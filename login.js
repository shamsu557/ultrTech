// Student Login JavaScript

document.addEventListener("DOMContentLoaded", () => {
  setupLoginForm()
  setupForgotPasswordForm()
})

// Setup login form
function setupLoginForm() {
  const loginForm = document.getElementById("loginForm")

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault()

    const username = document.getElementById("username").value.trim()
    const password = document.getElementById("password").value

    const submitBtn = loginForm.querySelector('button[type="submit"]')
    const originalText = submitBtn.innerHTML
    setLoadingState(submitBtn, true, originalText)

    try {
      const response = await fetch("/api/student/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      })

      const result = await response.json()

      if (result.success) {
        showMessage("Login successful! Redirecting...", "success")
        setTimeout(() => {
          window.location.href = "/student/dashboard"
        }, 1500)
      } else {
        throw new Error(result.error || "Login failed")
      }
    } catch (error) {
      console.error("Login error:", error)
      showMessage(error.message || "Login failed. Please check your credentials.", "danger")
    } finally {
      setLoadingState(submitBtn, false, originalText)
    }
  })
}

// Setup forgot password form
function setupForgotPasswordForm() {
  const forgotForm = document.getElementById("forgotPasswordForm")
  const step = 1 // 1: Get security question, 2: Reset password

  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault()

    if (step === 1) {
      await getSecurityQuestion()
    } else {
      await resetPassword()
    }
  })
}

// Get security question
async function getSecurityQuestion() {
  const username = document.getElementById("resetUsername").value.trim()

  try {
    const response = await fetch(`/api/student/security-question/${username}`)
    const result = await response.json()

    if (result.success) {
      document.getElementById("securityQuestionText").textContent = result.securityQuestion
      document.getElementById("securityQuestionSection").style.display = "block"
      document.getElementById("resetButtonText").textContent = "Reset Password"
      step = 2
    } else {
      throw new Error(result.error || "Student not found")
    }
  } catch (error) {
    console.error("Security question error:", error)
    showMessage(error.message || "Failed to get security question", "danger")
  }
}

// Reset password
async function resetPassword() {
  const username = document.getElementById("resetUsername").value.trim()
  const securityAnswer = document.getElementById("securityAnswerReset").value.trim()
  const newPassword = document.getElementById("newPassword").value
  const confirmPassword = document.getElementById("confirmNewPassword").value

  if (newPassword !== confirmPassword) {
    showMessage("Passwords do not match", "danger")
    return
  }

  if (newPassword.length < 8) {
    showMessage("Password must be at least 8 characters long", "danger")
    return
  }

  try {
    const response = await fetch("/api/student/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        securityAnswer: securityAnswer.toUpperCase().trim(),
        newPassword,
      }),
    })

    const result = await response.json()

    if (result.success) {
      showMessage("Password reset successful! You can now login with your new password.", "success")
      const modal = window.bootstrap.Modal.getInstance(document.getElementById("forgotPasswordModal"))
      modal.hide()

      // Reset form
      document.getElementById("forgotPasswordForm").reset()
      document.getElementById("securityQuestionSection").style.display = "none"
      document.getElementById("resetButtonText").textContent = "Get Security Question"
      step = 1
    } else {
      throw new Error(result.error || "Password reset failed")
    }
  } catch (error) {
    console.error("Password reset error:", error)
    showMessage(error.message || "Password reset failed", "danger")
  }
}

// Toggle password visibility
function togglePassword() {
  const passwordInput = document.getElementById("password")
  const toggleIcon = document.getElementById("passwordToggle")

  if (passwordInput.type === "password") {
    passwordInput.type = "text"
    toggleIcon.className = "fas fa-eye-slash"
  } else {
    passwordInput.type = "password"
    toggleIcon.className = "fas fa-eye"
  }
}

// Declare functions
function setLoadingState(button, loading, originalText) {
  if (loading) {
    button.disabled = true
    button.innerHTML = "Loading..."
  } else {
    button.disabled = false
    button.innerHTML = originalText
  }
}

function showMessage(message, type) {
  const messageElement = document.getElementById("message")
  messageElement.textContent = message
  messageElement.className = `alert alert-${type}`
  messageElement.style.display = "block"

  setTimeout(() => {
    messageElement.style.display = "none"
  }, 3000)
}

// Declare bootstrap
window.bootstrap = window.bootstrap || {}
window.bootstrap.Modal = window.bootstrap.Modal || {
  getInstance: (element) => ({
    hide: () => {
      element.style.display = "none"
    },
  }),
}
