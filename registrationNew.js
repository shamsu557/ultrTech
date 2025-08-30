const BASE_URL = "http://localhost:3000";
const bootstrap = window.bootstrap;
const PaystackPop = window.PaystackPop;

let currentStep = 1;
let studentData = null;
let paymentType = null;
let registrationFee = 0;
let paymentStatus = { installmentNumber: 0, totalInstallments: 0, remainingBalance: 0, installmentType: null };
let latestReference = null;

function setLoadingState(button, loading, originalText) {
  if (!button) return;
  if (loading) {
    button.dataset.origText = button.innerHTML;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.origText || originalText || button.innerHTML;
    button.disabled = false;
  }
}

function showMessage(message, type = "info") {
  const messageDiv = document.getElementById("message");
  if (messageDiv) {
    messageDiv.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>`;
    setTimeout(() => (messageDiv.innerHTML = ""), 6000);
  } else {
    console.warn("Message div not found in DOM");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupRegistrationSteps();
});

/* -------------------------
   Helpers: normalize student
   ------------------------- */
function normalizeStudent(raw) {
  if (!raw) return null;
  const s = { ...raw };

  s.admission_number = raw.admission_number || raw.admissionNumber || raw.admission || null;
  s.totalPaid = raw.totalPaid ?? raw.total_paid ?? raw.total_paid_amount ?? 0;
  s.installmentNumber = raw.installmentNumber ?? raw.installment_number ?? raw.installment_no ?? 0;
  s.installmentType = raw.installmentType ?? raw.installment_type ?? raw.latest_installment_type ?? null;
  s.registration_fee = raw.registration_fee ?? raw.registrationFee ?? raw.regFee ?? 0;
  s.hasPassword = raw.hasPassword ?? !!raw.password_hash ?? false;

  return s;
}

/* -------------------------
   Setup event bindings
   ------------------------- */
function setupRegistrationSteps() {
  const verifyForm = document.getElementById("verifyApplicationForm");
  if (verifyForm) verifyForm.addEventListener("submit", verifyApplication);

  const securityForm = document.getElementById("securityForm");
  if (securityForm) securityForm.addEventListener("submit", setupSecurity);

  const documentForm = document.getElementById("documentForm");
  if (documentForm) documentForm.addEventListener("submit", completeRegistration);

  const proceedBtn = document.getElementById("proceedPayment");
  if (proceedBtn) proceedBtn.addEventListener("click", processPayment);

  const receiptBtn = document.getElementById("downloadReceiptBtn");
  if (receiptBtn) receiptBtn.addEventListener("click", downloadRegistrationReceipt);
  const letterBtn = document.getElementById("downloadAdmissionLetterBtn");
  if (letterBtn) letterBtn.addEventListener("click", downloadAdmissionLetter);
}

/* -------------------------
   Verify application/admission
   ------------------------- */
async function verifyApplication(e) {
  e.preventDefault();

  const verifyTypeSelected = document.getElementById("verifyType")?.value;
  const inputNumberRaw = document.getElementById("applicationNumber")?.value;
  const inputNumber = inputNumberRaw ? inputNumberRaw.trim() : "";
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : "Verify";

  if (!inputNumber) {
    showMessage("Please enter your application or admission number", "danger");
    return;
  }

  const admissionNumberRegex = /^[A-Z0-9]{2,5}\/\d{4}\/[A-Z]{3,6}\/\d{1,4}$/i;
  const applicationNumberRegex = /^[A-Z0-9\-]+$/i;

  let typeToUse = verifyTypeSelected || "application";
  if (admissionNumberRegex.test(inputNumber) && typeToUse !== "admission") {
    typeToUse = "admission";
  }
  if (typeToUse === "application" && !applicationNumberRegex.test(inputNumber)) {
    showMessage("Invalid application number format. Use alphanumeric only.", "danger");
    return;
  }
  if (typeToUse === "admission" && !admissionNumberRegex.test(inputNumber)) {
    showMessage("Invalid admission number format. Expected e.g. CYB/2025/DIP/181", "danger");
    return;
  }

  if (submitBtn) setLoadingState(submitBtn, true, originalText);

  try {
    const encoded = encodeURIComponent(inputNumber);
    const url = `${BASE_URL}/api/student/verify-application/${encoded}?type=${typeToUse}`;
    const res = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });
    const text = await res.text();
    if (!res.ok) {
      try {
        const parsed = JSON.parse(text);
        throw new Error(parsed.error || text || `HTTP ${res.status}`);
      } catch {
        throw new Error(text || `HTTP ${res.status}`);
      }
    }

    const result = JSON.parse(text);
    if (!result.success) {
      if (typeToUse === "application") {
        const res2 = await fetch(`${BASE_URL}/api/student/verify-application/${encoded}?type=admission`, { method: "GET" });
        const text2 = await res2.text();
        if (res2.ok) {
          const r2 = JSON.parse(text2);
          if (r2.success) {
            processVerificationResult(r2);
            return;
          }
        }
      }
      showMessage(result.error || "No record found", "danger");
      return;
    }

    processVerificationResult(result);
  } catch (err) {
    console.error("Verification error:", err);
    showMessage(err.message || "Verification failed. Please try again.", "danger");
  } finally {
    if (submitBtn) setLoadingState(submitBtn, false, originalText);
  }
}

function processVerificationResult(result) {
  const rawStudent = result.student || result.data || result;
  const s = normalizeStudent(rawStudent);
  studentData = s;
  registrationFee = s.registration_fee || 0;

  paymentStatus = {
    installmentNumber: s.installmentNumber || 0,
    totalInstallments: s.installmentType === "full" ? 1 : 2,
    remainingBalance: Math.max(0, (s.registration_fee || registrationFee) - (s.totalPaid || 0)),
    installmentType: s.installmentType || null,
  };

  displayStudentDetails({ student: s });
  updatePaymentOptions({ student: s });

  if (s.admission_number) {
    if (s.totalPaid >= registrationFee) {
      showMessage("✅ You have completed your registration payment. You may download your receipt below. To finish registration, complete security setup and upload qualifications (steps 3 and 4).", "success");
      showStep(2);
    } else if (s.installmentNumber === 1) {
      showMessage("First installment paid. Please complete the second installment.", "info");
      showStep(2);
    } else {
      showMessage("Please complete your registration payment.", "warning");
      showStep(2);
    }
  } else {
    showMessage("No admission number assigned yet. Please proceed to payment options below.", "warning");
    showStep(2);
  }
}

/* -------------------------
   Update payment UI
   ------------------------- */
function updatePaymentOptions(result) {
  const fullPaymentCard = document.getElementById("fullPaymentCard");
  const installmentCard = document.getElementById("installmentCard");
  const fullPaymentAmount = document.getElementById("fullPaymentAmount");
  const installmentAmount = document.getElementById("installmentAmount");
  const proceedPaymentBtn = document.getElementById("proceedPayment");
  const receiptBtn = document.getElementById("downloadReceiptBtn");
  const letterBtn = document.getElementById("downloadAdmissionLetterBtn");
  const messageBox = document.getElementById("paymentMessage");

  if (fullPaymentCard) fullPaymentCard.style.display = "none";
  if (installmentCard) installmentCard.style.display = "none";
  if (proceedPaymentBtn) proceedPaymentBtn.style.display = "none";
  if (receiptBtn) receiptBtn.style.display = "none";
  if (letterBtn) letterBtn.style.display = "none";
  if (messageBox) messageBox.innerHTML = "";

  const studentRaw = result.student || result;
  const student = normalizeStudent(studentRaw);
  const regFee = student.registration_fee || registrationFee || 0;
  const totalPaid = student.totalPaid || 0;
  const formatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

  if (!student.admission_number) {
    if (fullPaymentCard && fullPaymentAmount) {
      fullPaymentCard.style.display = "block";
      fullPaymentAmount.textContent = formatter.format(regFee);
    }
    if (installmentCard && installmentAmount) {
      installmentCard.style.display = "block";
      installmentAmount.textContent = `${formatter.format(regFee / 2)} (First Installment)`;
    }
    if (proceedPaymentBtn) proceedPaymentBtn.style.display = "block";
    return;
  }

  if (totalPaid >= regFee) {
    if (messageBox) messageBox.innerHTML = "<p class='text-success fw-bold'>✅ You have completed your payment.</p>";
    if (receiptBtn) receiptBtn.style.display = "inline-block";
    if (letterBtn) letterBtn.style.display = "inline-block";
    return;
  }

  if (student.installmentNumber === 1 && totalPaid < regFee) {
    if (installmentCard && installmentAmount) {
      installmentCard.style.display = "block";
      installmentAmount.textContent = `${formatter.format(regFee / 2)} (Second Installment)`;
      paymentType = "installment";
      selectPayment("installment");
    }
    if (proceedPaymentBtn) proceedPaymentBtn.style.display = "block";
    if (receiptBtn) receiptBtn.style.display = "inline-block";
    return;
  }

  if (messageBox) messageBox.innerHTML = "<p class='text-warning'>Please contact support or try again.</p>";
}

/* -------------------------
   Display student details
   ------------------------- */
function displayStudentDetails(result) {
  const student = normalizeStudent(result.student || result);
  const studentDetails = document.getElementById("studentDetails");
  if (!studentDetails) return;

  const paymentStatusText =
    (student.totalPaid || 0) >= registrationFee
      ? "Fully Paid"
      : student.installmentNumber === 1
      ? "Partially Paid (Installment 1 of 2)"
      : "Pending";

  studentDetails.innerHTML = `
    <p><strong>Name:</strong> ${student.first_name || student.firstName || ""} ${student.last_name || student.lastName || ""}</p>
    <p><strong>Email:</strong> ${student.email || ""}</p>
    <p><strong>Application Number:</strong> ${student.application_number || student.applicationNumber || ""}</p>
    ${student.admission_number ? `<p><strong>Admission Number:</strong> ${student.admission_number}</p>` : ""}
    <p><strong>Course:</strong> ${student.course_name || student.courseName || ""}</p>
    <p><strong>Course Duration:</strong> ${student.duration || ""}</p>
    <p><strong>Certification Type:</strong> ${student.certification_type || student.certificationType || ""}</p>
    <p><strong>Payment Status:</strong> ${paymentStatusText}</p>
    <p><strong>Total Paid:</strong> ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(student.totalPaid || 0)}</p>
  `;
}

/* -------------------------
   Payment selection & start
   ------------------------- */
function selectPayment(type) {
  paymentType = type;
  document.querySelectorAll(".payment-card").forEach((card) => {
    card.classList.remove("border-primary", "shadow");
  });
  const selectedCard = document.querySelector(`.payment-card[onclick="selectPayment('${type}')"]`);
  if (selectedCard) {
    selectedCard.classList.add("border-primary", "shadow");
    const proceedPaymentBtn = document.getElementById("proceedPayment");
    if (proceedPaymentBtn) proceedPaymentBtn.style.display = "block";
  }
}

async function processPayment() {
  if (!paymentType) {
    showMessage("Please select a payment option", "warning");
    return;
  }
  if (!studentData || (!studentData.application_number && !studentData.id)) {
    showMessage("Error: Application or student data not found. Please verify application again.", "danger");
    return;
  }

  const button = document.getElementById("proceedPayment");
  const originalText = button ? button.innerHTML : "Proceed to Payment";
  if (button) setLoadingState(button, true, originalText);

  try {
    const regFee = studentData.registration_fee || registrationFee || 0;
    const amount = paymentType === "full" ? regFee : regFee / 2;
    const installmentType = paymentType === "full" ? "full" : (studentData.installmentNumber === 1 ? "second" : "first");

    const handler = PaystackPop.setup({
      key: "pk_live_661e479efe8cccc078d6e6c078a5b6e0dc963079",
      email: studentData.email,
      amount: Math.round(amount * 100),
      currency: "NGN",
      ref: generateReference("REG"),
      metadata: {
        custom_fields: [
          { display_name: "Application Number", variable_name: "application_number", value: studentData.application_number || studentData.applicationNumber || "" },
          { display_name: "Student ID", variable_name: "student_id", value: studentData.id || "" },
          { display_name: "Payment Type", variable_name: "payment_type", value: "Registration" },
          { display_name: "Installment Type", variable_name: "installment_type", value: installmentType },
        ],
      },
      callback: (response) => {
        console.log("Paystack callback response:", response);
        verifyRegistrationPayment(response.reference, installmentType);
      },
      onClose: () => {
        showMessage("Payment cancelled", "warning");
        if (button) setLoadingState(button, false, originalText);
      },
    });

    handler.openIframe();
  } catch (err) {
    console.error("Payment initialization error:", err);
    showMessage("Failed to initialize payment: " + err.message, "danger");
    if (button) setLoadingState(button, false, originalText);
  }
}

/* -------------------------
   Verify registration payment
   ------------------------- */
async function verifyRegistrationPayment(reference, installmentType) {
  const button = document.getElementById("proceedPayment");
  const originalText = button ? button.innerHTML : "Proceed to Payment";
  if (button) setLoadingState(button, true, originalText);

  try {
    const body = {
      reference,
      paymentType: "Registration",
      applicationNumber: studentData?.application_number || studentData?.applicationNumber || null,
      admissionNumber: studentData?.admission_number || studentData?.admissionNumber || null,
      installmentType,
      studentId: studentData?.id || null,
    };

    const res = await fetch(`${BASE_URL}/api/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `HTTP error ${res.status}`);
    }
    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || "Payment verification failed");
    }

    latestReference = reference;
    const newStudent = normalizeStudent(result.student || result);
    studentData = { ...studentData, ...newStudent };

    paymentStatus = {
      installmentNumber: newStudent.installmentNumber || 0,
      totalInstallments: newStudent.installmentType === "full" ? 1 : 2,
      remainingBalance: Math.max(0, (newStudent.registration_fee || registrationFee) - (newStudent.totalPaid || 0)),
      installmentType: newStudent.installmentType || installmentType,
    };

    displayStudentDetails({ student: studentData });
    updatePaymentOptions({ student: studentData });

    if (installmentType === "first") {
      showMessage("✅ First installment payment verified. Please set up your security details and upload qualifications.", "success");
      showStep(3);
      showSecuritySetup(studentData.id, studentData.admission_number);
    } else if (installmentType === "full") {
      showMessage("✅ You have completed your registration payment. Please set up your security details and upload qualifications.", "success");
      showStep(3);
      showSecuritySetup(studentData.id, studentData.admission_number);
    } else if (installmentType === "second") {
      showMessage("✅ You have completed your registration payment. Please download your receipt.", "success");
      updatePaymentOptions({ student: studentData });
      showStep(2);
    }
  } catch (err) {
    console.error("Payment verification error:", err);
    showMessage("Payment verification failed: " + (err.message || "Unknown error"), "danger");
  } finally {
    if (button) setLoadingState(button, false, originalText);
  }
}

/* -------------------------
   Application fee flow
   ------------------------- */
function setupPaymentButton(applicationNumber) {
  const payButton = document.getElementById("payNowButton");
  if (!payButton) {
    console.warn("payNowButton not found in DOM");
    return;
  }
  payButton.onclick = async () => {
    try {
      const form = document.getElementById("applicationForm");
      if (!form) {
        showMessage("Application form not found. Please contact support.", "danger");
        return;
      }

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
        showMessage("Please fill required application fields.", "danger");
        return;
      }

      const handler = PaystackPop.setup({
        key: "pk_live_661e479efe8cccc078d6e6c078a5b6e0dc963079",
        email,
        amount: 10000,
        currency: "NGN",
        ref: generateReference("APP"),
        metadata: {
          custom_fields: [
            { display_name: "Application Number", variable_name: "application_number", value: applicationNumber },
            { display_name: "First Name", variable_name: "first_name", value: firstName },
            { display_name: "Last Name", variable_name: "last_name", value: lastName },
            { display_name: "Email", variable_name: "email", value: email },
            { display_name: "Phone", variable_name: "phone", value: phone },
            { display_name: "Gender", variable_name: "gender", value: gender },
            { display_name: "Date of Birth", variable_name: "date_of_birth", value: dateOfBirth },
            { display_name: "Address", variable_name: "address", value: address },
            { display_name: "Course ID", variable_name: "course_id", value: courseId },
            { display_name: "Schedule", variable_name: "schedule", value: schedule },
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
    } catch (err) {
      console.error("Payment initialization error:", err);
      showMessage("Failed to initialize payment: " + err.message, "danger");
    }
  };
}

async function verifyApplicationPayment(reference, applicationNumber) {
  try {
    const res = await fetch(`${BASE_URL}/api/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, paymentType: "Application", applicationNumber }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `HTTP ${res.status}`);
    }

    const result = await res.json();
    if (result.success) {
      showMessage("Application fee payment verified successfully! Please verify your application number again.", "success");
      const paymentModal = bootstrap.Modal.getInstance(document.getElementById("paymentModal"));
      if (paymentModal) paymentModal.hide();
    } else {
      throw new Error(result.error || "Verification failed");
    }
  } catch (err) {
    console.error("Application payment verification error:", err);
    showMessage("Payment verification failed: " + (err.message || "Unknown error"), "danger");
  }
}

/* -------------------------
   Security setup
   ------------------------- */
async function setupSecurity(e) {
  e.preventDefault();
  const password = document.getElementById("password")?.value;
  const confirmPassword = document.getElementById("confirmPassword")?.value;
  const securityQuestion = document.getElementById("securityQuestion")?.value;
  const securityAnswer = document.getElementById("securityAnswer")?.value;
  const button = e.target.querySelector('button[type="submit"]');
  const originalText = button ? button.innerHTML : "Submit";

  if (!password || !confirmPassword || !securityQuestion || !securityAnswer) {
    showMessage("Please fill in all security fields", "danger");
    return;
  }

  if (!studentData || !studentData.id) {
    showMessage("Student data missing. Please verify your application first.", "danger");
    return;
  }

  if (studentData.hasPassword) {
    showMessage("Security already set. Proceed to upload documents.", "info");
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

  if (button) setLoadingState(button, true, originalText);

  try {
    const res = await fetch(`${BASE_URL}/api/student/setup-security`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: studentData.id,
        password,
        securityQuestion,
        securityAnswer,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `HTTP ${res.status}`);
    }

    const result = await res.json();
    if (result.success) {
      showMessage("Security setup completed", "success");
      studentData.hasPassword = true;
      showStep(4);
    } else {
      throw new Error(result.error || "Security setup failed");
    }
  } catch (err) {
    console.error("Security setup error:", err);
    showMessage("Security setup failed: " + (err.message || "Unknown error"), "danger");
  } finally {
    if (button) setLoadingState(button, false, originalText);
  }
}

/* -------------------------
   Complete registration
   ------------------------- */
async function completeRegistration(e) {
  e.preventDefault();
  const highestQualification = document.getElementById("highestQualification")?.files[0];
  const button = e.target.querySelector('button[type="submit"]');
  const originalText = button ? button.innerHTML : "Submit";

  if (!highestQualification) {
    showMessage("Please upload your highest qualification", "danger");
    return;
  }

  if (!studentData || !studentData.id) {
    showMessage("Student data missing. Please verify/complete payment first.", "danger");
    return;
  }

  if (!studentData.admission_number && (studentData.totalPaid || 0) < (studentData.registration_fee || registrationFee)) {
    showMessage("Registration payment incomplete. Please complete payment first.", "danger");
    showStep(2);
    return;
  }

  if (button) setLoadingState(button, true, originalText);

  const formData = new FormData();
  formData.append("studentId", studentData.id);
  formData.append("highestQualification", highestQualification);

  const qualNames = document.querySelectorAll('input[name="qualName[]"]');
  const qualFiles = document.querySelectorAll('input[name="qualFile[]"]');
  qualNames.forEach((name, idx) => {
    if (name.value && qualFiles[idx]?.files[0]) {
      formData.append(`additionalQualName_${idx}`, name.value);
      formData.append(`additionalQualFile_${idx}`, qualFiles[idx].files[0]);
    }
  });

  try {
    const res = await fetch(`${BASE_URL}/api/student/complete-registration`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `HTTP ${res.status}`);
    }

    const result = await res.json();
    if (result.success) {
      const admissionNum = result.admissionNumber || result.admission_number || null;
      if (admissionNum) {
        studentData.admission_number = admissionNum;
      }
      showMessage("Registration completed successfully!", "success");
      updatePaymentOptions({ student: studentData });
      const successModalEl = document.getElementById("registrationSuccessModal");
      if (successModalEl) new bootstrap.Modal(successModalEl).show();
    } else {
      showMessage(result.error || "Registration failed", "danger");
    }
  } catch (err) {
    console.error("Registration error:", err);
    showMessage("Registration failed: " + (err.message || "Unknown error"), "danger");
  } finally {
    if (button) setLoadingState(button, false, originalText);
  }
}

/* -------------------------
   Setup Security & Complete Registration
   ------------------------- */
function showSecuritySetup(studentId, admissionNumber) {
  const container = document.getElementById("step3Container");
  if (!container) {
    showMessage("Error: Security setup container not found. Please contact support.", "danger");
    return;
  }
  container.innerHTML = `
    <h3>Setup Security & Upload Qualification</h3>
    <form id="securityForm">
      <label>Password</label>
      <input type="password" id="password" required />

      <label>Confirm Password</label>
      <input type="password" id="confirmPassword" required />

      <label>Security Question</label>
      <select id="securityQuestion" required>
        <option value="">-- Select a question --</option>
        <option value="MOTHER_MAIDEN_NAME">What is your mother's maiden name?</option>
        <option value="FAVOURITE_TEACHER">Who was your favourite teacher?</option>
        <option value="FIRST_SCHOOL">What was the name of your first school?</option>
      </select>

      <label>Answer</label>
      <input type="text" id="securityAnswer" required />

      <label>Upload Qualification</label>
      <input type="file" id="qualificationFile" accept=".pdf,.jpg,.png" required />

      <button type="submit">Complete Registration</button>
    </form>
  `;

  document.getElementById("securityForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = document.getElementById("password")?.value;
    const confirmPassword = document.getElementById("confirmPassword")?.value;
    const question = document.getElementById("securityQuestion")?.value;
    const answer = document.getElementById("securityAnswer")?.value.trim().toUpperCase();
    const file = document.getElementById("qualificationFile")?.files[0];
    const button = e.target.querySelector('button[type="submit"]');
    const originalText = button ? button.innerHTML : "Complete Registration";

    if (!password || !confirmPassword || !question || !answer || !file) {
      showMessage("Please fill in all required fields", "danger");
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

    if (answer.length < 3) {
      showMessage("Security answer must be at least 3 characters", "danger");
      return;
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (!allowedTypes.includes(file.type)) {
      showMessage("Invalid file type. Please upload PDF, JPG, or PNG.", "danger");
      return;
    }
    if (file.size > maxSize) {
      showMessage("File size exceeds 5MB limit.", "danger");
      return;
    }

    if (button) setLoadingState(button, true, originalText);

    try {
      // Save password + security Q/A
      const securityRes = await fetch(`${BASE_URL}/api/student/setup-security/${studentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, securityQuestion: question, securityAnswer: answer }),
      });

      if (!securityRes.ok) {
        const txt = await securityRes.text();
        throw new Error(txt || `HTTP ${securityRes.status}`);
      }

      // Upload qualification
      const formData = new FormData();
      formData.append("qualification", file);
      const uploadRes = await fetch(`${BASE_URL}/api/student/upload-qualification/${studentId}`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const txt = await uploadRes.text();
        throw new Error(txt || `HTTP ${uploadRes.status}`);
      }

      // Complete registration
      const completeRes = await fetch(`${BASE_URL}/api/student/complete-registration/${studentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await completeRes.json();

      if (!completeRes.ok) {
        throw new Error(data.error || `HTTP ${completeRes.status}`);
      }

      if (data.success) {
        const admissionNum = data.admissionNumber || data.admission_number || admissionNumber;
        studentData.admission_number = admissionNum;
        showMessage(`Registration completed! Your Admission Number is: ${admissionNum}`, "success");

        container.innerHTML = `
          <h3>Registration Completed ✅</h3>
          <p>Admission Number: <strong>${admissionNum}</strong></p>
          <button onclick="downloadAdmissionLetter('${admissionNum}')">Download Admission Letter</button>
          <button onclick="downloadReceipt('${admissionNum}')">Download Receipt</button>
        `;
      } else {
        throw new Error(data.error || "Registration completion failed");
      }
    } catch (err) {
      console.error("Error completing registration:", err);
      showMessage("Something went wrong, please try again: " + (err.message || "Unknown error"), "danger");
    } finally {
      if (button) setLoadingState(button, false, originalText);
    }
  });
}

/* -------------------------
   Downloads
   ------------------------- */
function downloadAdmissionLetter(admissionNumber) {
  if (!admissionNumber) {
    showMessage("No admission number provided.", "danger");
    return;
  }
  window.open(`${BASE_URL}/api/student/admission-letter/${encodeURIComponent(admissionNumber)}`, "_blank");
}

function downloadRegistrationReceipt() {
  const adm = studentData?.admission_number;
  if (!adm) {
    showMessage("Registration payment incomplete or admission number missing. Cannot download receipt.", "danger");
    return;
  }
  const url = `${BASE_URL}/api/receipt/download?type=registration&admissionNum=${encodeURIComponent(adm)}`;
  window.open(url, "_blank");
}

/* -------------------------
   Misc UI: steps, add field
   ------------------------- */
function showStep(step) {
  document.querySelectorAll(".registration-step").forEach((el) => { el.style.display = "none"; });
  const stepElement = document.getElementById(`step${step}`);
  if (stepElement) stepElement.style.display = "block";
  currentStep = step;

  const stepHeader = document.getElementById("stepHeader");
  if (stepHeader) {
    const stepMessages = {
      1: "Step 1: Verify your application or admission number",
      2: "Step 2: Complete your registration fee payment",
      3: "Step 3: Set up your security question and upload qualifications",
      4: "Step 4: Upload additional qualification documents",
    };
    stepHeader.textContent = stepMessages[step] || "Student Registration";
  }

  document.querySelectorAll("[id^='step'][id$='Guide']").forEach((el) => {
    el.style.fontWeight = "normal";
    el.style.color = "inherit";
  });
  const currentStepGuide = document.getElementById(`step${step}Guide`);
  if (currentStepGuide) {
    currentStepGuide.style.fontWeight = "bold";
    currentStepGuide.style.color = "#0d6efd";
  }
}

function addQualificationField() {
  const container = document.getElementById("additionalQualifications");
  if (!container) return;
  const div = document.createElement("div");
  div.className = "additional-qual-item mb-2";
  div.innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <input type="text" class="form-control form-control-custom" placeholder="Qualification Name" name="qualName[]" aria-label="Qualification Name">
      </div>
      <div class="col-md-6">
        <input type="file" class="form-control form-control-custom" accept=".pdf,.jpg,.jpeg,.png" name="qualFile[]" aria-label="Upload Additional Qualification">
      </div>
    </div>
  `;
  container.appendChild(div);
}

/* -------------------------
   Utility
   ------------------------- */
function generateReference(prefix) {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}-${Date.now().toString().slice(-5)}`;
}



