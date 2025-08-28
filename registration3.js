// Base URL for API requests (adjust for production or other environments)
const BASE_URL = 'http://localhost:3000';

let currentStep = 1;
let studentData = null;
let paymentType = null;
let registrationFee = 0;
let paymentStatus = { installmentNumber: 0, totalInstallments: 0, remainingBalance: 0 };
let latestReference = null;

function setLoadingState(button, loading, originalText) {
  if (loading) {
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
    button.disabled = true;
  } else {
    button.innerHTML = originalText;
    button.disabled = false;
  }
}

function showMessage(message, type) {
  const messageDiv = document.getElementById("message");
  messageDiv.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  </div>`;
  setTimeout(() => (messageDiv.innerHTML = ""), 5000);
}

document.addEventListener("DOMContentLoaded", () => {
  setupRegistrationSteps();
});

function setupRegistrationSteps() {
  document.getElementById("verifyApplicationForm").addEventListener("submit", verifyApplication);
  document.getElementById("securityForm").addEventListener("submit", setupSecurity);
  document.getElementById("documentForm").addEventListener("submit", completeRegistration);
}

async function verifyApplication(e) {
  e.preventDefault();

  const verifyType = document.getElementById("verifyType").value;
  const inputNumber = document.getElementById("applicationNumber").value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;

  // Validate inputNumber: allow alphanumeric, hyphens, and slashes for admission_number (e.g., CYB/2025/DIP/181)
  const admissionNumberRegex = /^[A-Z0-9]+\/[0-9]{4}\/[A-Z]+\/[0-9]+$/;
  const applicationNumberRegex = /^[A-Z0-9]+$/; // Assuming application_number is alphanumeric (e.g., APP123456)
  if (!inputNumber) {
    showMessage(`Please enter a valid ${verifyType} number`, "danger");
    return;
  }
  if (verifyType === "admission" && !admissionNumberRegex.test(inputNumber)) {
    showMessage("Invalid admission number format. Expected format: XXX/YYYY/XXX/NNN (e.g., CYB/2025/DIP/181)", "danger");
    return;
  }
  if (verifyType === "application" && !applicationNumberRegex.test(inputNumber)) {
    showMessage("Invalid application number format. Expected alphanumeric characters only (e.g., APP123456)", "danger");
    return;
  }

  setLoadingState(submitBtn, true, originalText);

  // Encode inputNumber to handle slashes
  const encodedInputNumber = encodeURIComponent(inputNumber);
  const requestUrl = `${BASE_URL}/api/student/verify-application/${encodedInputNumber}?type=${verifyType}`;
  console.log(`Sending request to: ${requestUrl}`);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Verification failed:", { status: response.status, response: errorText });
      throw new Error(`Verification failed: ${errorText}`);
    }

    const result = await response.json();

    if (result.success) {
      studentData = result.student;
      registrationFee = result.student.registration_fee;
      paymentStatus = {
        installmentNumber: result.student.installmentNumber || 0,
        totalInstallments: result.student.paymentOptions.includes("Installment") && result.student.installmentNumber > 0 ? 2 : result.student.paymentOptions.includes("Full") ? 0 : 1,
        remainingBalance: result.student.paymentStatus === "Completed" ? 0 : registrationFee - (result.student.totalPaid || 0),
      };
      displayStudentDetails(result);
      updatePaymentOptions(result);

      // Check if both application_number and admission_number exist
      if (result.student.application_number && result.student.admission_number) {
        if (result.student.paymentStatus === "Completed") {
          // Full payment or two installments completed
          showMessage("Registration fee fully paid. Proceed to upload documents.", "success");
          showStep(4); // Skip security setup, go to document upload
        } else if (result.student.paymentStatus === "Partial" && paymentStatus.installmentNumber === 1) {
          // One installment paid, prompt for second installment
          showMessage("First installment paid. Please pay the second installment to complete registration.", "info");
          showStep(2); // Show payment options for second installment
        } else if (result.student.paymentStatus === "Partial" && paymentStatus.installmentNumber === 2) {
          // Should not occur (two installments = Completed), but handle for safety
          showMessage("Registration fee fully paid. Proceed to upload documents.", "success");
          showStep(4); // Skip security setup, go to document upload
        } else {
          // No payments or first installment pending
          showMessage(result.student.message, "warning");
          showStep(2); // Show payment options
        }
      } else if (result.student.application_number) {
        // Only application_number exists
        if (verifyType === "application") {
          showMessage(result.student.message, "success");
          showStep(2); // Proceed to payment
        } else {
          showMessage("No admission number associated with this application. Please verify payment status.", "danger");
          showStep(1);
        }
      } else {
        // No valid student data
        showMessage("No application or admission number found. Please try again.", "danger");
        showStep(1);
      }
    } else {
      if (verifyType === "application") {
        const paymentModal = new bootstrap.Modal(document.getElementById("paymentModal"));
        paymentModal.show();
        setupPaymentButton(inputNumber);
      } else {
        showMessage("Admission number does not exist. Please try using your application number.", "danger");
      }
    }
  } catch (error) {
    console.error("Verification error:", error);
    showMessage(
      error.message.includes("Database error")
        ? "Unable to verify due to a server issue. Please try again later or contact support."
        : error.message.includes("Route not found")
        ? `Verification failed: Server route not found. Please ensure the ${verifyType} number is correct (e.g., ${verifyType === "admission" ? "CYB/2025/DIP/181" : "APP123456"}) and the server is running.`
        : error.message || `Verification failed. Please ensure the ${verifyType} number is correct.`,
      "danger"
    );
  } finally {
    setLoadingState(submitBtn, false, originalText);
  }
}

function updatePaymentOptions(result) {
  const fullPaymentCard = document.getElementById("fullPaymentCard");
  const installmentCard = document.getElementById("installmentCard");
  const fullPaymentAmount = document.getElementById("fullPaymentAmount");
  const installmentAmount = document.getElementById("installmentAmount");
  const proceedPaymentBtn = document.getElementById("proceedPayment");
  const formatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

  if (!fullPaymentCard || !installmentCard || !fullPaymentAmount || !installmentAmount || !proceedPaymentBtn) {
    console.error("Payment option elements not found in DOM");
    showMessage("Error: Payment options not available. Please contact support.", "danger");
    return;
  }

  fullPaymentCard.style.display = result.student.paymentOptions.includes("Full") ? "block" : "none";
  installmentCard.style.display = result.student.paymentOptions.includes("Installment") ? "block" : "none";
  proceedPaymentBtn.style.display = result.student.paymentOptions.length > 0 ? "none" : "none";

  if (result.student.paymentStatus === "Completed") {
    fullPaymentCard.style.display = "none";
    installmentCard.style.display = "none";
    proceedPaymentBtn.style.display = "none";
  } else if (result.student.paymentStatus === "Partial" && result.student.paymentOptions.includes("Installment") && paymentStatus.installmentNumber === 1) {
    fullPaymentCard.style.display = "none"; // Hide full payment for second installment
    installmentCard.style.display = "block";
    installmentAmount.textContent = `${formatter.format(registrationFee / 2)} (Second Installment)`;
    paymentType = "installment";
    selectPayment("installment");
  } else if (result.student.paymentOptions.includes("Full") && result.student.paymentOptions.includes("Installment")) {
    fullPaymentCard.style.display = "block";
    installmentCard.style.display = "block";
    fullPaymentAmount.textContent = formatter.format(registrationFee);
    installmentAmount.textContent = `${formatter.format(registrationFee / 2)} (Installment ${paymentStatus.installmentNumber + 1})`;
  }
}

function displayStudentDetails(result) {
  const student = result.student;
  const studentDetails = document.getElementById("studentDetails");
  const paymentStatusText =
    student.paymentStatus === "Completed"
      ? "Fully Paid"
      : student.paymentStatus === "Partial"
      ? `Partially Paid (Installment ${paymentStatus.installmentNumber} of ${paymentStatus.totalInstallments})`
      : "Pending";
  studentDetails.innerHTML = `
    <p><strong>Name:</strong> ${student.first_name} ${student.last_name}</p>
    <p><strong>Email:</strong> ${student.email}</p>
    <p><strong>Application Number:</strong> ${student.application_number}</p>
    ${student.admission_number ? `<p><strong>Admission Number:</strong> ${student.admission_number}</p>` : ""}
    <p><strong>Course:</strong> ${student.course_name}</p>
    <p><strong>Course Duration:</strong> ${student.duration}</p>
    <p><strong>Start Date:</strong> 20th Sept 2025</p>
    <p><strong>Certification Type:</strong> ${student.certification_type}</p>
    <p><strong>Registration Payment Status:</strong> ${paymentStatusText}</p>
  `;
}

function selectPayment(type) {
  paymentType = type;
  document.querySelectorAll(".payment-card").forEach((card) => {
    card.classList.remove("border-primary", "shadow");
  });
  const selectedCard = document.querySelector(`.payment-card[onclick="selectPayment('${type}')"]`);
  if (selectedCard) {
    selectedCard.classList.add("border-primary", "shadow");
    document.getElementById("proceedPayment").style.display = "block";
  }
}

async function processPayment() {
  if (!paymentType) {
    showMessage("Please select a payment option", "warning");
    return;
  }

  if (!studentData || !studentData.application_number) {
    showMessage("Error: Application number not found. Please verify application again.", "danger");
    return;
  }

  const button = document.getElementById("proceedPayment");
  const originalText = button.innerHTML;
  setLoadingState(button, true, originalText);

  try {
    const amount = paymentType === "full" ? registrationFee : registrationFee / 2;
    const totalInstallments = paymentType === "full" ? 1 : 2;
    const installmentNumber = paymentStatus.installmentNumber;

    const handler = PaystackPop.setup({
      key: "pk_live_661e479efe8cccc078d6e6c078a5b6e0dc963079",
      email: studentData.email,
      amount: amount * 100, // Convert to kobo
      currency: "NGN",
      ref: generateReference("REG"),
      metadata: {
        custom_fields: [
          {
            display_name: "Application Number",
            variable_name: "application_number",
            value: studentData.application_number,
          },
          {
            display_name: "Payment Type",
            variable_name: "payment_type",
            value: "Registration",
          },
          {
            display_name: "Installment Number",
            variable_name: "installment_number",
            value: installmentNumber,
          },
          {
            display_name: "Total Installments",
            variable_name: "total_installments",
            value: totalInstallments,
          },
        ],
      },
      callback: (response) => {
        console.log("Paystack callback response:", response);
        verifyRegistrationPayment(response.reference, paymentType);
      },
      onClose: () => {
        showMessage("Payment cancelled", "warning");
        setLoadingState(button, false, originalText);
      },
    });

    handler.openIframe();
  } catch (error) {
    console.error("Payment initialization error:", error);
    showMessage("Failed to initialize payment: " + error.message, "danger");
    setLoadingState(button, false, originalText);
  }
}

async function verifyRegistrationPayment(reference, paymentOption) {
  const button = document.getElementById("proceedPayment");
  const originalText = button.innerHTML;
  setLoadingState(button, true, originalText);

  try {
    const response = await fetch(`${BASE_URL}/api/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        paymentType: "Registration",
        applicationNumber: studentData.application_number,
        admissionNumber: studentData.admission_number,
      }),
    });

    const result = await response.json();
    console.log("Payment verification response:", result);

    if (result.success) {
      latestReference = reference;
      paymentStatus.installmentNumber = result.installmentNumber;
      paymentStatus.totalInstallments = result.totalInstallments;
      paymentStatus.remainingBalance = registrationFee - (result.totalPaid || 0);
      showMessage(`Payment verified successfully! ${result.student.message}`, "success");
      // Re-verify application to update payment status
      const reVerifyResponse = await fetch(`${BASE_URL}/api/student/verify-application/${encodeURIComponent(studentData.application_number)}?type=application`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const reVerifyResult = await reVerifyResponse.json();
      if (reVerifyResult.success) {
        studentData = reVerifyResult.student;
        registrationFee = reVerifyResult.student.registration_fee;
        paymentStatus = {
          installmentNumber: reVerifyResult.student.installmentNumber,
          totalInstallments: reVerifyResult.student.paymentOptions.includes("Installment") && reVerifyResult.student.installmentNumber > 0 ? 2 : reVerifyResult.student.paymentOptions.includes("Full") ? 0 : 1,
          remainingBalance: reVerifyResult.student.paymentStatus === "Completed" ? 0 : registrationFee - (reVerifyResult.student.totalPaid || 0),
        };
        displayStudentDetails(reVerifyResult);
        updatePaymentOptions(reVerifyResult);
        if (reVerifyResult.student.paymentStatus === "Completed") {
          showStep(4); // Skip security setup, go to document upload
        } else if (paymentStatus.installmentNumber === 1 && paymentStatus.totalInstallments === 2) {
          showStep(2); // Prompt for second installment
        } else {
          showStep(3); // Proceed to security setup for first installment or full payment
        }
      } else {
        throw new Error(reVerifyResult.error || "Failed to re-verify application");
      }
    } else {
      throw new Error(result.error || "Payment verification failed");
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    showMessage("Payment verification failed: " + error.message + ". Please contact support.", "danger");
  } finally {
    setLoadingState(button, false, originalText);
  }
}

function setupPaymentButton(applicationNumber) {
  const payButton = document.getElementById("payNowButton");
  payButton.onclick = async () => {
    try {
      const form = document.getElementById("applicationForm");
      const firstName = form.querySelector("#firstName")?.value || "Unknown";
      const lastName = form.querySelector("#lastName")?.value || "Unknown";
      const email = form.querySelector("#email")?.value || "default@example.com";
      const phone = form.querySelector("#phone")?.value || "Unknown";
      const gender = form.querySelector("#gender")?.value || "Unknown";
      const dateOfBirth = form.querySelector("#dateOfBirth")?.value || "2000-01-01";
      const address = form.querySelector("#address")?.value || "Unknown";
      const courseId = form.querySelector("#courseId")?.value || "1";
      const schedule = form.querySelector("#schedule")?.value || "Unknown";

      if (!firstName || !lastName || !email || !courseId) {
        showMessage("Please fill in all required fields (First Name, Last Name, Email, Course).", "danger");
        return;
      }

      const handler = PaystackPop.setup({
        key: "pk_live_661e479efe8cccc078d6e6c078a5b6e0dc963079",
        email: email,
        amount: 10000, // ₦100 in kobo
        currency: "NGN",
        ref: generateReference("APP"),
        metadata: {
          custom_fields: [
            {
              display_name: "Application Number",
              variable_name: "application_number",
              value: applicationNumber,
            },
            {
              display_name: "First Name",
              variable_name: "first_name",
              value: firstName,
            },
            {
              display_name: "Last Name",
              variable_name: "last_name",
              value: lastName,
            },
            {
              display_name: "Email",
              variable_name: "email",
              value: email,
            },
            {
              display_name: "Phone",
              variable_name: "phone",
              value: phone,
            },
            {
              display_name: "Gender",
              variable_name: "gender",
              value: gender,
            },
            {
              display_name: "Date of Birth",
              variable_name: "date_of_birth",
              value: dateOfBirth,
            },
            {
              display_name: "Address",
              variable_name: "address",
              value: address,
            },
            {
              display_name: "Course ID",
              variable_name: "course_id",
              value: courseId,
            },
            {
              display_name: "Schedule",
              variable_name: "schedule",
              value: schedule,
            },
          ],
        },
        callback: (response) => {
          console.log("Paystack callback response:", response);
          verifyApplicationPayment(response.reference, applicationNumber);
        },
        onClose: () => {
          showMessage("Payment cancelled", "warning");
        },
      });

      handler.openIframe();
    } catch (error) {
      console.error("Payment initialization error:", error);
      showMessage("Failed to initialize payment: " + error.message, "danger");
    }
  };
}

async function verifyApplicationPayment(reference, applicationNumber) {
  try {
    const response = await fetch(`${BASE_URL}/api/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        paymentType: "Application",
        applicationNumber,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server responded with status ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.success) {
      showMessage("Application fee payment verified successfully! Please verify your application number again.", "success");
      const paymentModal = bootstrap.Modal.getInstance(document.getElementById("paymentModal"));
      paymentModal.hide();
    } else {
      throw new Error(result.error || "Payment verification failed");
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    showMessage(
      error.message.includes("Email already exists")
        ? "Payment verification failed: Email already exists. Please use a different email."
        : "Payment verification failed: " + error.message + ". Please contact support.",
      "danger"
    );
  }
}

async function setupSecurity(e) {
  e.preventDefault();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const securityQuestion = document.getElementById("securityQuestion").value;
  const securityAnswer = document.getElementById("securityAnswer").value;
  const button = e.target.querySelector('button[type="submit"]');
  const originalText = button.innerHTML;

  if (paymentStatus.installmentNumber === 2 || paymentStatus.totalInstallments === 0) {
    showMessage("Security setup not required for fully paid or second installment. Proceed to upload documents.", "info");
    showStep(4);
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Passwords do not match", "danger");
    return;
  }

  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    showMessage("Password must be at least 8 characters with letters and numbers", "danger");
    return;
  }

  setLoadingState(button, true, originalText);

  try {
    const response = await fetch(`${BASE_URL}/api/student/setup-security`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: studentData.id,
        password,
        securityQuestion,
        securityAnswer,
      }),
    });
    const result = await response.json();

    if (result.success) {
      showMessage("Security setup completed", "success");
      showStep(4);
    } else {
      throw new Error(result.error || "Security setup failed");
    }
  } catch (error) {
    console.error("Security setup error:", error);
    showMessage("Security setup failed: " + error.message, "danger");
  } finally {
    setLoadingState(button, false, originalText);
  }
}

async function completeRegistration(e) {
  e.preventDefault();
  const highestQualification = document.getElementById("highestQualification").files[0];
  const button = e.target.querySelector('button[type="submit"]');
  const originalText = button.innerHTML;

  if (!highestQualification) {
    showMessage("Please upload your highest qualification", "danger");
    return;
  }

  setLoadingState(button, true, originalText);

  const formData = new FormData();
  formData.append("studentId", studentData.id);
  formData.append("highestQualification", highestQualification);

  const qualNames = document.querySelectorAll('input[name="qualName[]"]');
  const qualFiles = document.querySelectorAll('input[name="qualFile[]"]');
  qualNames.forEach((name, index) => {
    if (name.value && qualFiles[index].files[0]) {
      formData.append(`additionalQualName_${index}`, name.value);
      formData.append(`additionalQualFile_${index}`, qualFiles[index].files[0]);
    }
  });

  try {
    const response = await fetch(`${BASE_URL}/api/student/complete-registration`, {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (result.success) {
      studentData.admissionNumber = result.admissionNumber;
      document.getElementById("admissionNumber").textContent = result.admissionNumber;
      const successModal = new bootstrap.Modal(document.getElementById("registrationSuccessModal"));
      successModal.show();
    } else {
      throw new Error(result.error || "Registration failed");
    }
  } catch (error) {
    console.error("Registration error:", error);
    showMessage("Registration failed: " + error.message, "danger");
  } finally {
    setLoadingState(button, false, originalText);
  }
}

function showStep(step) {
  document.querySelectorAll(".registration-step").forEach((el) => {
    el.style.display = "none";
  });
  document.getElementById(`step${step}`).style.display = "block";
  currentStep = step;

  // Update step header
  const stepHeader = document.getElementById("stepHeader");
  const stepMessages = {
    1: "Step 1: Verify your application or admission number",
    2: "Step 2: Complete your registration fee payment",
    3: "Step 3: Set up your security question",
    4: "Step 4: Upload your qualification documents",
  };
  stepHeader.textContent = stepMessages[step] || "Student Registration";

  // Update progress indicators
  document.querySelectorAll("[id^='step'][id$='Guide']").forEach((el) => {
    el.style.fontWeight = "normal";
    el.style.color = "inherit";
  });
  const currentStepGuide = document.getElementById(`step${step}Guide`);
  if (currentStepGuide) {
    currentStepGuide.style.fontWeight = "bold";
    currentStepGuide.style.color = "#0d6efd"; // Bootstrap primary color
  }
}

function addQualificationField() {
  const container = document.getElementById("additionalQualifications");
  const index = container.children.length;
  const div = document.createElement("div");
  div.className = "additional-qual-item mb-2";
  div.innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <input type="text" class="form-control form-control-custom" 
               placeholder="Qualification Name" name="qualName[]" aria-label="Qualification Name">
      </div>
      <div class="col-md-6">
        <input type="file" class="form-control form-control-custom" 
               accept=".pdf,.jpg,.jpeg,.png" name="qualFile[]" aria-label="Upload Additional Qualification">
      </div>
    </div>
  `;
  container.appendChild(div);
}

function downloadAdmissionLetter() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("UltraTech Global Solution LTD", 20, 20);
  doc.setFontSize(12);
  doc.text("Admission Letter", 20, 30);
  doc.text("Gwammaja Housing Estate, Opp. Orthopedic Hospital, Dala", 20, 40);

  doc.setFontSize(12);
  doc.text("Student Details", 20, 50);
  doc.setFontSize(10);
  doc.text(`Admission Number: ${document.getElementById("admissionNumber").textContent}`, 20, 60);
  doc.text(`Name: ${studentData.first_name} ${studentData.last_name}`, 20, 70);
  doc.text(`Email: ${studentData.email}`, 20, 80);
  doc.text(`Course: ${studentData.course_name}`, 20, 90);
  doc.text(`Start Date: 20 Sept 2025`, 20, 100);
  doc.text(`Location: Gwammaja Housing Estate, Opp. Orthopedic Hospital, Dala`, 20, 110);
  doc.text(`Status: Registered`, 20, 120);

  doc.save(`Admission_Letter_${document.getElementById("admissionNumber").textContent}.pdf`);
}

function downloadReceipt() {
  if (!latestReference || !studentData || !studentData.application_number) {
    showMessage("No payment reference available. Please complete a payment first.", "danger");
    return;
  }
  const installmentParam =
    paymentStatus.totalInstallments === 1 ? "full" :
    paymentStatus.installmentNumber === 1 ? "1" :
    paymentStatus.installmentNumber === 2 ? "2" : "1";
  window.location.href = `${BASE_URL}/api/receipt/download?type=registration&ref=${latestReference}&appNum=${encodeURIComponent(studentData.application_number)}&installment=${installmentParam}`;
}

function generateReference(prefix) {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}