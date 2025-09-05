document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("staffLoginForm");
    const togglePassword = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");
    const forgotPasswordForm = document.getElementById("forgotPasswordForm");
    const securityQuestionForm = document.getElementById("securityQuestionForm");
    const forgotPasswordModal = new bootstrap.Modal(document.getElementById("forgotPasswordModal"));
    const forgotPasswordStep1 = document.getElementById("forgotPasswordStep1");
    const forgotPasswordStep2 = document.getElementById("forgotPasswordStep2");
    const securityQuestionLabel = document.getElementById("securityQuestionLabel");
    const alertContainer = document.querySelector('.alert-container');
    
    // A variable to store the identifier (email or staff ID) across the two steps
    let storedIdentifier = '';

    // Toggle password visibility
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener("click", () => {
            const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
            passwordInput.setAttribute("type", type);
            togglePassword.innerHTML = type === "password" ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
    }

    // Main login form submission
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = {
            loginId: document.getElementById("email").value.trim(),
            password: passwordInput.value,
        };

        try {
            const response = await fetch("/api/staff/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                showSuccess("Login successful! Redirecting...");
                setTimeout(() => {
                    window.location.href = "/staff/dashboard";
                }, 1000);
            } else {
                throw new Error(result.error || "Login failed. Please check your credentials.");
            }
        } catch (error) {
            console.error("Login error:", error);
            showError(error.message || "An unexpected error occurred.");
        }
    });

    // Forgot password step 1: Submit email/Staff ID to get security question
    forgotPasswordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        // The HTML input ID is now "resetIdentifier"
        const identifierInput = document.getElementById("resetIdentifier");
        const identifier = identifierInput.value.trim();

        if (!identifier) {
            showError("Please enter your Staff ID or email address.");
            return;
        }

        storedIdentifier = identifier; // Store the identifier for the next step

        try {
            const response = await fetch("/api/staff/forgot-password/get-question", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ identifier }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                securityQuestionLabel.textContent = result.securityQuestion;
                forgotPasswordStep1.style.display = "none";
                forgotPasswordStep2.style.display = "block";
                document.getElementById("securityAnswer").focus();
            } else {
                throw new Error(result.error || "Failed to retrieve security question. Please check the identifier.");
            }
        } catch (error) {
            console.error("Forgot password step 1 error:", error);
            showError(error.message || "An unexpected error occurred. Please try again.");
        }
    });

    // Forgot password step 2: Submit security answer and new password
    securityQuestionForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const securityAnswer = document.getElementById("securityAnswer").value.trim();
        const newPassword = document.getElementById("newPassword").value;
        const confirmNewPassword = document.getElementById("confirmNewPassword").value;

        if (newPassword !== confirmNewPassword) {
            showError("New passwords do not match.");
            return;
        }

        if (newPassword.length < 8) {
            showError("New password must be at least 8 characters long.");
            return;
        }
        
        if (!securityAnswer) {
            showError("Please provide an answer to the security question.");
            return;
        }

        try {
            const response = await fetch("/api/staff/forgot-password/reset", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    identifier: storedIdentifier,
                    securityAnswer: securityAnswer.toUpperCase(), // Normalize for server-side comparison
                    newPassword
                }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                showSuccess("Password has been reset successfully. You can now log in with your new password.");
                forgotPasswordModal.hide();
                // Reset the forms for next use
                forgotPasswordForm.reset();
                securityQuestionForm.reset();
                forgotPasswordStep1.style.display = "block";
                forgotPasswordStep2.style.display = "none";
            } else {
                throw new Error(result.error || "Password reset failed. Please check your answer.");
            }
        } catch (error) {
            console.error("Forgot password step 2 error:", error);
            showError(error.message || "An unexpected error occurred. Please try again.");
        }
    });

    // Show/hide alert messages
    function showError(message) {
        const alertDiv = document.createElement("div");
        alertDiv.className = "alert alert-danger alert-dismissible fade show";
        alertDiv.setAttribute("role", "alert");
        alertDiv.innerHTML = `
            <strong>Error:</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        alertContainer.innerHTML = '';
        alertContainer.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }

    function showSuccess(message) {
        const alertDiv = document.createElement("div");
        alertDiv.className = "alert alert-success alert-dismissible fade show";
        alertDiv.setAttribute("role", "alert");
        alertDiv.innerHTML = `
            <strong>Success:</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        alertContainer.innerHTML = '';
        alertContainer.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }
});