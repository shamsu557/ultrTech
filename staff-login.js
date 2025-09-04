document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("staffLoginForm");
    const togglePassword = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");
    const bootstrap = window.bootstrap;

    // Toggle password visibility
    togglePassword.addEventListener("click", () => {
        const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
        passwordInput.setAttribute("type", type);
        togglePassword.innerHTML = type === "password" ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Retrieve the value from the input with id="email"
        const formData = {
            loginId: document.getElementById("email").value, 
            password: document.getElementById("password").value,
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

            if (result.success) {
                showSuccess("Login successful! Redirecting...");
                setTimeout(() => {
                    window.location.href = "/staff/dashboard";
                }, 1000);
            } else {
                throw new Error(result.error || "Login failed");
            }
        } catch (error) {
            console.error("Login error:", error);
            showError(error.message || "Login failed");
        }
    });

    // Forgot password form
    const forgotPasswordForm = document.getElementById("forgotPasswordForm");
    forgotPasswordForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("resetEmail").value;

        try {
            const response = await fetch("/api/staff/forgot-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email }),
            });

            const result = await response.json();

            if (result.success) {
                showSuccess("Password reset instructions sent to your email");
                const modal = bootstrap.Modal.getInstance(document.getElementById("forgotPasswordModal"));
                modal.hide();
            } else {
                throw new Error(result.error || "Failed to send reset email");
            }
        } catch (error) {
            console.error("Forgot password error:", error);
            showError(error.message || "Failed to send reset email");
        }
    });
});

function showError(message) {
    const alertDiv = document.createElement("div");
    alertDiv.className = "alert alert-danger alert-dismissible fade show position-fixed";
    alertDiv.style.cssText = "top: 20px; right: 20px; z-index: 9999; max-width: 400px;";
    alertDiv.innerHTML = `
        <strong>Error:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

function showSuccess(message) {
    const alertDiv = document.createElement("div");
    alertDiv.className = "alert alert-success alert-dismissible fade show position-fixed";
    alertDiv.style.cssText = "top: 20px; right: 20px; z-index: 9999; max-width: 400px;";
    alertDiv.innerHTML = `
        <strong>Success:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}