document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("staffSignupForm")
  const bootstrap = window.bootstrap // Declare the bootstrap variable

  form.addEventListener("submit", async (e) => {
    e.preventDefault()

    const formData = {
      firstName: document.getElementById("firstName").value,
      lastName: document.getElementById("lastName").value,
      email: document.getElementById("email").value,
      phone: document.getElementById("phone").value,
      department: document.getElementById("department").value,
      position: document.getElementById("position").value,
      qualifications: document.getElementById("qualifications").value,
      password: document.getElementById("password").value,
      confirmPassword: document.getElementById("confirmPassword").value,
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      showError("Passwords do not match")
      return
    }

    // Validate password strength
    if (formData.password.length < 8) {
      showError("Password must be at least 8 characters long")
      return
    }

    try {
      showLoading()

      const response = await fetch("/api/staff/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result.success) {
        showSuccess("Account created successfully! Please wait for admin approval.")
        setTimeout(() => {
          window.location.href = "/staff/login"
        }, 2000)
      } else {
        throw new Error(result.error || "Registration failed")
      }
    } catch (error) {
      console.error("Signup error:", error)
      showError(error.message || "Registration failed")
    } finally {
      hideLoading()
    }
  })
})

function showLoading() {
  const modal = new bootstrap.Modal(document.getElementById("loadingModal"))
  modal.show()
}

function hideLoading() {
  const modal = bootstrap.Modal.getInstance(document.getElementById("loadingModal"))
  if (modal) modal.hide()
}

function showError(message) {
  const alertDiv = document.createElement("div")
  alertDiv.className = "alert alert-danger alert-dismissible fade show position-fixed"
  alertDiv.style.cssText = "top: 20px; right: 20px; z-index: 9999; max-width: 400px;"
  alertDiv.innerHTML = `
        <strong>Error:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `

  document.body.appendChild(alertDiv)

  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.parentNode.removeChild(alertDiv)
    }
  }, 5000)
}

function showSuccess(message) {
  const alertDiv = document.createElement("div")
  alertDiv.className = "alert alert-success alert-dismissible fade show position-fixed"
  alertDiv.style.cssText = "top: 20px; right: 20px; z-index: 9999; max-width: 400px;"
  alertDiv.innerHTML = `
        <strong>Success:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `

  document.body.appendChild(alertDiv)

  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.parentNode.removeChild(alertDiv)
    }
  }, 5000)
}
