document.addEventListener("DOMContentLoaded", () => {
  setupLoginForm();
  setupForgotPasswordForm();
});

// -------------------- LOGIN --------------------
function setupLoginForm() {
  const loginForm = document.getElementById("loginForm");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const admissionNumber = document.getElementById("admissionNumber").value.trim();
    const password = document.getElementById("password").value;

    if (!/^[A-Z0-9/]{6,17}$/.test(admissionNumber)) {
      showMessage("Admission Number must be 6-17 characters (A-Z, 0-9, /).", "danger");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      showMessage("Password must be at least 8 characters with uppercase, lowercase, and a number.", "danger");
      return;
    }

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    setLoadingState(submitBtn, true);

    try {
      const response = await fetch("/api/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ admissionNumber, password }),
      });

      const result = await response.json();

      if (result.success) {
        showMessage("Login successful! Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "/student/dashboard";
        }, 1500);
      } else {
        throw new Error(result.message || "Login failed");
      }
    } catch (error) {
      showMessage(error.message, "danger");
    } finally {
      setLoadingState(submitBtn, false, originalText);
    }
  });
}

// -------------------- FORGOT PASSWORD --------------------
let step = 1;

function setupForgotPasswordForm() {
  const forgotForm = document.getElementById("forgotPasswordForm");

  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (step === 1) {
      await handleStep1();
    } else if (step === 2) {
      await handleStep2();
    } else if (step === 3) {
      await handleStep3();
    }
  });
}

// STEP 1: Get Security Question
async function handleStep1() {
  const admissionNumber = document.getElementById("resetAdmissionNumber").value.trim();

  if (!/^[A-Z0-9/]{6,17}$/.test(admissionNumber)) {
    showMessage("Admission Number must be 6-17 characters (A-Z, 0-9, /).", "danger");
    return;
  }

  const stepButton = document.getElementById("stepButton");
  const originalText = stepButton.innerHTML;
  setLoadingState(stepButton, true);

  try {
    const response = await fetch(`/api/student/security-question/${encodeURIComponent(admissionNumber)}`, {
      method: "GET",
      credentials: "include",
    });
    const result = await response.json();

    if (result.success) {
      document.getElementById("securityQuestionText").textContent = result.securityQuestion;
      document.getElementById("step2").style.display = "block";
      stepButton.textContent = "Verify Answer";
      step = 2;
    } else {
      throw new Error(result.message || "Student not found");
    }
  } catch (error) {
    showMessage(error.message, "danger");
  } finally {
    setLoadingState(stepButton, false, originalText);
  }
}

// STEP 2: Verify Security Answer
async function handleStep2() {
  const admissionNumber = document.getElementById("resetAdmissionNumber").value.trim();
  const securityAnswer = document.getElementById("securityAnswer").value.trim().toUpperCase();

  if (!securityAnswer) {
    showMessage("Security answer is required.", "danger");
    return;
  }

  const stepButton = document.getElementById("stepButton");
  const originalText = stepButton.innerHTML;
  setLoadingState(stepButton, true);

  try {
    const response = await fetch("/api/student/verify-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionNumber, securityAnswer }),
    });
    const result = await response.json();

    if (result.success) {
      document.getElementById("step2").style.display = "none";
      document.getElementById("step3").style.display = "block";
      stepButton.textContent = "Change Password";
      step = 3;
    } else {
      throw new Error(result.message || "Incorrect security answer.");
    }
  } catch (error) {
    showMessage(error.message, "danger");
  } finally {
    setLoadingState(stepButton, false, originalText);
  }
}

// STEP 3: Reset Password
async function handleStep3() {
  const admissionNumber = document.getElementById("resetAdmissionNumber").value.trim();
  const newPassword = document.getElementById("newPassword").value;
  const confirmNewPassword = document.getElementById("confirmNewPassword").value;

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
    showMessage("New password must be at least 8 characters with uppercase, lowercase, and a number.", "danger");
    return;
  }
  if (newPassword !== confirmNewPassword) {
    showMessage("Passwords do not match.", "danger");
    return;
  }

  const stepButton = document.getElementById("stepButton");
  const originalText = stepButton.innerHTML;
  setLoadingState(stepButton, true);

  try {
    const response = await fetch("/api/student/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ admissionNumber, newPassword }),
    });
    const result = await response.json();

    if (result.success) {
      // Show inline alert
      showMessage("Password reset successful! Redirecting to login...", "success");

      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById("forgotPasswordModal"));
      modal.hide();

      // ✅ Show toast notification
      const toastEl = document.getElementById("successToast");
      if (toastEl) {
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
      }

      // Redirect after delay
      setTimeout(() => {
        window.location.href = "/student/login";
      }, 2500);
    } else {
      throw new Error(result.message || "Password reset failed.");
    }
  } catch (error) {
    showMessage(error.message, "danger");
  } finally {
    setLoadingState(stepButton, false, originalText);
  }
}

// -------------------- LOGOUT --------------------
async function logout() {
  try {
    const response = await fetch("/api/student/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    const result = await response.json();

    if (result.success) {
      showMessage("Logged out successfully!", "success");
      setTimeout(() => {
        window.location.href = result.redirect || "/student/login.html";
      }, 1500);
    } else {
      throw new Error(result.message || "Logout failed");
    }
  } catch (error) {
    showMessage(error.message, "danger");
  }
}

// -------------------- UTILITIES --------------------
function togglePassword(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggleIcon = document.getElementById(toggleId);

  if (input.type === "password") {
    input.type = "text";
    toggleIcon.className = "fas fa-eye-slash";
  } else {
    input.type = "password";
    toggleIcon.className = "fas fa-eye";
  }
}

function setLoadingState(button, loading, originalText = "Loading...") {
  if (loading) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Loading...';
  } else {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

function showMessage(message, type) {
  const messageElement = document.getElementById("message");
  if (!messageElement) return;

  messageElement.textContent = message;
  messageElement.className = `alert alert-${type} d-block`;
  messageElement.style.display = "block";

  setTimeout(() => {
    messageElement.style.display = "none";
  }, 3000);
}
