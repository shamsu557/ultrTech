document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("staffSignupForm");
    const coursesSelect = document.getElementById("courses");
    const positionsSelect = document.getElementById("positions");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const profilePictureInput = document.getElementById("profilePicture");
    const alertContainer = document.querySelector('.alert-container');
    const bootstrap = window.bootstrap;

    // Function to fetch courses and populate the dropdown
    const fetchCourses = async () => {
        try {
            const response = await fetch("/api/courses");
            const courses = await response.json();
            
            if (Array.isArray(courses)) {
                coursesSelect.innerHTML = '';
                courses.forEach(course => {
                    const option = document.createElement("option");
                    option.value = course.id;
                    option.textContent = course.name;
                    coursesSelect.appendChild(option);
                });
            } else {
                showError("Failed to load courses. Invalid data format received.");
            }
        } catch (error) {
            console.error("Error fetching courses:", error);
            showError("An error occurred while fetching courses.");
        }
    };

    // Function to fetch positions and populate the dropdown
    const fetchPositions = async () => {
        try {
            const response = await fetch("/api/positions");
            const result = await response.json();
            if (result.success && Array.isArray(result.positions)) {
                positionsSelect.innerHTML = '';
                result.positions.forEach(position => {
                    const option = document.createElement("option");
                    option.value = position.id;
                    option.textContent = position.name;
                    positionsSelect.appendChild(option);
                });
            } else {
                showError("Failed to load positions. Please refresh the page.");
            }
        } catch (error) {
            console.error("Error fetching positions:", error);
            showError("An error occurred while fetching positions.");
        }
    };

    // Call functions to populate dropdowns when the page loads
    fetchCourses();
    fetchPositions();

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Frontend validation
        if (passwordInput.value !== confirmPasswordInput.value) {
            showError("Passwords do not match.");
            return;
        }
        if (passwordInput.value.length < 8) {
            showError("Password must be at least 8 characters long.");
            return;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(document.getElementById("email").value.trim())) {
            showError("Please enter a valid email address.");
            return;
        }

        const selectedCourses = Array.from(coursesSelect.selectedOptions).map(option => option.value);
        if (selectedCourses.length === 0) {
            showError("Please select at least one course.");
            return;
        }

        const selectedPositions = Array.from(positionsSelect.selectedOptions).map(option => option.value);
        if (selectedPositions.length === 0) {
            showError("Please select at least one position.");
            return;
        }

        const profilePicture = profilePictureInput.files[0];
        
        // Use FormData for file uploads
        const formData = new FormData();
        formData.append("firstName", document.getElementById("firstName").value.trim());
        formData.append("lastName", document.getElementById("lastName").value.trim());
        formData.append("email", document.getElementById("email").value.trim());
        formData.append("phone", document.getElementById("phone").value.trim());
        formData.append("qualifications", document.getElementById("qualifications").value.trim());
        formData.append("password", passwordInput.value);
        selectedCourses.forEach(courseId => formData.append("courseIds[]", courseId));
        selectedPositions.forEach(positionId => formData.append("positionIds[]", positionId));
        
        if (profilePicture) {
            formData.append("profilePicture", profilePicture);
        }

        try {
            showLoading();
            const response = await fetch("/api/staff/signup", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (response.ok) {
                // Display the staff ID from the server's response
                if (result.success && result.message) {
                    showSuccess(result.message);
                } else {
                    showSuccess("Account created successfully. You can now log in.");
                }
                
                setTimeout(() => {
                    window.location.href = "/staff/login";
                }, 2000);
            } else {
                // If the server returns an error, use its message
                throw new Error(result.error || "Registration failed. Please try again.");
            }
        } catch (error) {
            console.error("Signup error:", error);
            showError(error.message || "An unexpected error occurred.");
        } finally {
            hideLoading();
        }
    });

    function showLoading() {
        const modal = new bootstrap.Modal(document.getElementById("loadingModal"));
        modal.show();
    }

    function hideLoading() {
        const modal = bootstrap.Modal.getInstance(document.getElementById("loadingModal"));
        if (modal) modal.hide();
    }

    function showError(message) {
        const alertContainer = document.querySelector('.alert-container') || createAlertContainer();
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
        const alertContainer = document.querySelector('.alert-container') || createAlertContainer();
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

    function createAlertContainer() {
        const container = document.createElement('div');
        container.className = 'alert-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        container.style.maxWidth = '400px';
        document.body.appendChild(container);
        return container;
    }
});