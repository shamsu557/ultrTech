let currentStep = 1;
let studentData = null;
let paymentType = null;
let registrationFee = 0;

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
  setTimeout(() => messageDiv.innerHTML = "", 5000);
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

  const applicationNumber = document.getElementById("applicationNumber").value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;

  setLoadingState(submitBtn, true, originalText);

  try {
    // Call the correct endpoint to verify the application
    const response = await fetch(`/api/student/verify-application/${applicationNumber}`, {
      method: "GET", // The server endpoint uses GET
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server responded with status ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.success) {
      studentData = result.student;
      registrationFee = 500; // Hardcoded based on server logic in /api/student/payments
      displayStudentDetails(result.student);
      updatePaymentOptions();
      showStep(2);
    } else {
      // Assume application not found means payment is pending
      const paymentModal = new bootstrap.Modal(document.getElementById("paymentModal"));
      paymentModal.show();
      setupPaymentButton(applicationNumber);
    }
  } catch (error) {
    console.error("Verification error:", error);
    showMessage(error.message || "Application verification failed. Please ensure the application number is correct or complete the payment.", "danger");
  } finally {
    setLoadingState(submitBtn, false, originalText);
  }
}
function updatePaymentOptions() {
  const fullPaymentAmount = document.getElementById("fullPaymentAmount");
  const installmentAmount = document.getElementById("installmentAmount");
  const formatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
  fullPaymentAmount.textContent = formatter.format(registrationFee);
  installmentAmount.textContent = `${formatter.format(registrationFee / 2)} × 2`;
}

function displayStudentDetails(student) {
  const studentDetails = document.getElementById("studentDetails");
  studentDetails.innerHTML = `
    <p><strong>Name:</strong> ${student.first_name} ${student.last_name}</p>
    <p><strong>Email:</strong> ${student.email}</p>
    <p><strong>Course:</strong> ${student.course_name}</p>
    <p><strong>Application Number:</strong> ${student.application_number}</p>
  `;
}

function selectPayment(type) {
  paymentType = type;
  document.querySelectorAll(".payment-card").forEach((card) => {
    card.classList.remove("border-primary", "shadow");
  });
  const selectedCard = document.querySelector(`.payment-card[onclick="selectPayment('${type}')"]`);
  selectedCard.classList.add("border-primary", "shadow");
  document.getElementById("proceedPayment").style.display = "block";
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

  console.log("Initiating payment with application_number:", studentData.application_number); // Debug log

  const button = document.getElementById("proceedPayment");
  const originalText = button.innerHTML;
  setLoadingState(button, true, originalText);

  try {
    const amount = paymentType === "full" ? registrationFee : registrationFee / 2;
    const totalInstallments = paymentType === "full" ? 1 : 2;
    const installmentNumber = 1;

    const response = await fetch("/api/payment/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentData.id,
        amount,
        payment_type: "Registration",
        installment_number: installmentNumber,
        total_installments: totalInstallments,
        application_number: studentData.application_number,
      }),
    });
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to initiate payment");
    }

    const handler = PaystackPop.setup({
      key: "pk_live_661e479efe8cccc078d6e6c078a5b6e0dc963079",
      email: studentData.email,
      amount: amount * 100, // Convert to kobo
      currency: "NGN",
      ref: result.reference,
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
        console.log("Paystack callback response:", response); // Debug log
        verifyRegistrationPayment(response.reference);
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

async function verifyRegistrationPayment(reference) {
  const button = document.getElementById("proceedPayment");
  const originalText = button.innerHTML;
  setLoadingState(button, true, originalText);

  try {
    const response = await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        paymentType: "Registration",
      }),
    });

    const result = await response.json();
    console.log("Payment verification response:", result); // Debug log

    if (result.success) {
      showMessage("Payment verified successfully!", "success");
      showStep(3);
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
      // Fetch student details to get email and other info
      const response = await fetch(`/api/student/verify-application/${applicationNumber}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}: ${await response.text()}`);
      }

      if (!result.success) {
        throw new Error(result.error || "Application not found");
      }

      const student = result.student;

      const handler = PaystackPop.setup({
        key: "pk_live_661e479efe8cccc078d6e6c078a5b6e0dc963079",
        email: student.email,
        amount: 10000, // ₦100 in kobo (adjust based on your application fee)
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
              value: student.first_name,
            },
            {
              display_name: "Last Name",
              variable_name: "last_name",
              value: student.last_name,
            },
            {
              display_name: "Email",
              variable_name: "email",
              value: student.email,
            },
            {
              display_name: "Phone",
              variable_name: "phone",
              value: student.phone,
            },
            {
              display_name: "Gender",
              variable_name: "gender",
              value: student.gender,
            },
            {
              display_name: "Date of Birth",
              variable_name: "date_of_birth",
              value: student.date_of_birth,
            },
            {
              display_name: "Address",
              variable_name: "address",
              value: student.address,
            },
            {
              display_name: "Course ID",
              variable_name: "course_id",
              value: student.course_id,
            },
            {
              display_name: "Schedule",
              variable_name: "schedule",
              value: student.schedule,
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
function showStep(step) {
  document.querySelectorAll(".registration-step").forEach((el) => {
    el.style.display = "none";
  });
  document.getElementById(`step${step}`).style.display = "block";
  currentStep = step;
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
               placeholder="Qualification Name" name="qualName[]">
      </div>
      <div class="col-md-6">
        <input type="file" class="form-control form-control-custom" 
               accept=".pdf,.jpg,.jpeg,.png" name="qualFile[]">
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
  window.location.href = `/api/receipt/download?type=registration&ref=${studentData.reference_number}&appNum=${studentData.application_number}`;
}

function generateReference(prefix) {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}
