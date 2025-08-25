let currentStep = 1;
let studentData = null;
let paymentType = null;

function setLoadingState(button, loading, originalText) {
  if (loading) {
    button.innerHTML = "Loading...";
    button.disabled = true;
  } else {
    button.innerHTML = originalText;
    button.disabled = false;
  }
}

function showMessage(message, type) {
  const messageDiv = document.getElementById("message");
  messageDiv.innerHTML = `<div class="alert alert-${type}" role="alert">${message}</div>`;
}

const PaystackPop = {
  setup: (options) => ({
    openIframe: () => {
      console.log("Paystack payment handler opened with options:", options);
    },
  }),
};

function generateReference(prefix) {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

document.addEventListener("DOMContentLoaded", () => {
  setupRegistrationSteps();
});

// Setup registration step handlers
function setupRegistrationSteps() {
  document.getElementById("verifyApplicationForm").addEventListener("submit", verifyApplication);
  document.getElementById("securityForm").addEventListener("submit", setupSecurity);
  document.getElementById("documentForm").addEventListener("submit", completeRegistration);
}

// Verify application number
async function verifyApplication(e) {
  e.preventDefault();

  const applicationNumber = document.getElementById("applicationNumber").value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;

  setLoadingState(submitBtn, true, originalText);

  try {
    // First, verify application payment
    const paymentResponse = await fetch("/api/application/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationNumber }),
    });
    const paymentResult = await paymentResponse.json();

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || "Payment verification failed");
    }

    if (!paymentResult.paid) {
      const paymentModal = new bootstrap.Modal(document.getElementById("paymentModal"));
      paymentModal.show();
      setupPaymentButton(applicationNumber);
      setLoadingState(submitBtn, false, originalText);
      return;
    }

    // Proceed with application verification
    const response = await fetch(`/api/student/verify-application/${applicationNumber}`);
    const result = await response.json();

    if (result.success) {
      studentData = result.student;
      displayStudentDetails(result.student);
      showStep(2);
    } else {
      throw new Error(result.error || "Application not found");
    }
  } catch (error) {
    console.error("Verification error:", error);
    showMessage(error.message || "Application verification failed", "danger");
  } finally {
    setLoadingState(submitBtn, false, originalText);
  }
}

// Setup payment button
function setupPaymentButton(applicationNumber) {
  const payButton = document.getElementById("payNowButton");
  payButton.onclick = async () => {
    try {
      const response = await fetch(`/api/application/details?appNum=${applicationNumber}`);
      const results = await response.json();
      if (results.length === 0) {
        throw new Error("Application not found");
      }
      const student = results[0];

      const handler = PaystackPop.setup({
        key: "pk_test_your_paystack_public_key",
        email: student.email,
        amount: 20000, // ₦200 in kobo
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
              display_name: "Student ID",
              variable_name: "student_id",
              value: student.student_id,
            },
          ],
        },
        callback: (response) => {
          verifyApplicationPayment(response.reference, applicationNumber, student.student_id);
        },
        onClose: () => {
          showMessage("Payment cancelled", "warning");
        },
      });

      handler.openIframe();
    } catch (error) {
      console.error("Payment initialization error:", error);
      showMessage("Failed to initialize payment", "danger");
    }
  };
}

// Verify application payment
async function verifyApplicationPayment(reference, applicationNumber, studentId) {
  try {
    const response = await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        studentId,
        paymentType: "Application",
      }),
    });

    const result = await response.json();

    if (result.success) {
      showMessage("Payment verified successfully! Please verify application again.", "success");
      const paymentModal = bootstrap.Modal.getInstance(document.getElementById("paymentModal"));
      paymentModal.hide();
    } else {
      throw new Error(result.error || "Payment verification failed");
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    showMessage("Payment verification failed. Please contact support.", "danger");
  }
}

// [Include existing functions: displayStudentDetails, selectPayment, processPayment, verifyRegistrationPayment, setupSecurity, completeRegistration, showStep, addQualificationField, removeQualificationField, downloadAdmissionLetter unchanged]

// Add payment modal to registration.js
const bootstrap = {
  Modal: class {
    constructor(element) {
      this.element = element;
      console.log("Bootstrap modal initialized for element:", element);
    }
    show() {
      console.log("Modal shown");
      this.element.classList.add("show");
      this.element.style.display = "block";
    }
    hide() {
      console.log("Modal hidden");
      this.element.classList.remove("show");
      this.element.style.display = "none";
    }
  },
};