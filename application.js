document.addEventListener("DOMContentLoaded", () => {
    loadCourses();
    setupApplicationForm();
    setupCourseScheduleRestriction();
});

// Load courses for selection
async function loadCourses() {
    const courseSelect = document.getElementById("courseId");
    try {
        const response = await fetch("/api/courses");
        const courses = await response.json();
        courseSelect.innerHTML = '<option value="">Select a course</option>';
        courses.forEach((course) => {
            courseSelect.innerHTML += `<option value="${course.id}" data-department="${course.department}">${course.name} (${course.duration})</option>`;
        });
    } catch (error) {
        console.error("Error loading courses:", error);
        courseSelect.innerHTML = '<option value="">Error loading courses</option>';
    }
}

// Set up schedule options and notes
function setupCourseScheduleRestriction() {
    const courseSelect = document.getElementById("courseId");
    const scheduleSelect = document.getElementById("schedule");
    const scheduleNote = document.getElementById("scheduleNote");

    scheduleSelect.innerHTML = `
        <option value="">Select Schedule</option>
        <option value="morning">Morning Classes</option>
        <option value="evening">Evening Classes</option>
    `;
    scheduleNote.textContent = "Note: Backend, Frontend, and AI Starter Kit courses are only available on weekends";

    courseSelect.addEventListener("change", () => {
        const selectedOption = courseSelect.options[courseSelect.selectedIndex];
        const department = selectedOption ? selectedOption.getAttribute("data-department") : "";
        if (department === "Backend" || department === "Frontend" || department === "AI") {
            scheduleNote.textContent = "Note: This course is only available on weekends";
            scheduleSelect.disabled = true;
        } else {
            scheduleNote.textContent = "Note: Select your preferred schedule";
            scheduleSelect.disabled = false;
        }
    });
}

// Validate form fields
function validateForm(form) {
    const inputs = form.querySelectorAll("input[required], select[required]");
    let isValid = true;
    inputs.forEach((input) => {
        if (!input.value.trim()) {
            input.classList.add("is-invalid");
            let errorDiv = input.nextElementSibling;
            if (!errorDiv || !errorDiv.classList.contains("invalid-feedback")) {
                errorDiv = document.createElement("div");
                errorDiv.className = "invalid-feedback";
                input.parentNode.insertBefore(errorDiv, input.nextSibling);
            }
            errorDiv.textContent = `Please enter your ${input.id}`;
            isValid = false;
        } else {
            input.classList.remove("is-invalid");
            const errorDiv = input.nextElementSibling;
            if (errorDiv && errorDiv.classList.contains("invalid-feedback")) {
                errorDiv.textContent = "";
            }
        }
    });
    return isValid;
}

// Show alert messages
function showMessage(message, type) {
    const alertContainer = document.getElementById("alertContainer") || document.createElement("div");
    alertContainer.id = "alertContainer";
    alertContainer.innerHTML = `<div class="alert alert-${type}" role="alert">${message}</div>`;
    if (!document.getElementById("alertContainer")) {
        document.querySelector(".card-body").prepend(alertContainer);
    }
}

// Set button loading state
function setLoadingState(button, isLoading, originalText) {
    if (isLoading) {
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Loading...';
        button.disabled = true;
    } else {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// Generate unique reference
function generateReference(prefix) {
    return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

// Setup application form
function setupApplicationForm() {
    const form = document.getElementById("applicationForm");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!validateForm(form)) {
            showMessage("Please fill in all required fields", "danger");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        setLoadingState(submitBtn, true, originalText);

        try {
            const courseSelect = document.getElementById("courseId");
            const selectedOption = courseSelect.options[courseSelect.selectedIndex];
            const department = selectedOption.getAttribute("data-department");
            const schedule = (department === "Backend" || department === "Frontend" || department === "AI") 
                ? "weekend" 
                : document.getElementById("schedule").value;

            const applicationData = {
                firstName: document.getElementById("firstName").value.trim(),
                lastName: document.getElementById("lastName").value.trim(),
                email: document.getElementById("email").value.trim(),
                phone: document.getElementById("phone").value.trim(),
                gender: document.getElementById("gender").value,
                dateOfBirth: document.getElementById("dateOfBirth").value,
                address: document.getElementById("address").value.trim(),
                courseId: document.getElementById("courseId").value,
                schedule: schedule,
            };

            const applicationNumber = "APP" + Date.now();
            initializeApplicationPayment(applicationNumber, applicationData);
        } catch (error) {
            console.error("Application error:", error);
            showMessage(error.message || "Application failed. Please try again.", "danger");
        } finally {
            setLoadingState(submitBtn, false, originalText);
        }
    });
}

// Initialize Paystack payment
function initializeApplicationPayment(applicationNumber, applicationData) {
    const handler = PaystackPop.setup({
        key: "pk_live_661e479efe8cccc078d6e6c078a5b6e0dc963079",
        email: applicationData.email, 
        
        amount: 10000, // ₦100 in kobo
        currency: "NGN",
        ref: generateReference("APP"),
        metadata: {
            application_number: applicationNumber,
            first_name: applicationData.firstName,
            last_name: applicationData.lastName,
            email: applicationData.email,
            phone: applicationData.phone,
            gender: applicationData.gender,
            date_of_birth: applicationData.dateOfBirth,
            address: applicationData.address,
            course_id: applicationData.courseId,
            schedule: applicationData.schedule,
            profile_picture: applicationData.profilePicture,

        },
        callback: (response) => {
            verifyApplicationPayment(response.reference, applicationNumber);
        },
        onClose: () => {
            showMessage("Payment cancelled", "warning");
        },
    });

    try {
        handler.openIframe();
    } catch (error) {
        console.error("Payment initialization error:", error);
        showMessage("Failed to initialize payment. Please try again.", "danger");
    }
}

// Verify payment
async function verifyApplicationPayment(reference, applicationNumber) {
    try {
        const response = await fetch("/api/payment/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference, paymentType: "Application" }),
        });

        const result = await response.json();
        if (result.success) {
            document.getElementById("applicationNumber").textContent = applicationNumber;
            alert(`Application Successful! Your Application Number is ${applicationNumber}. Please save it for registration.`);
            const successModal = new bootstrap.Modal(document.getElementById("successModal"));
            successModal.show();
            sessionStorage.setItem("applicationNumber", applicationNumber);
            sessionStorage.setItem("paymentReference", reference);
        } else {
            throw new Error(result.error || "Payment verification failed");
        }
    } catch (error) {
        console.error("Payment verification error:", error);
        showMessage("Payment verification failed. Please contact support.", "danger");
    }
}

// Download receipt
function downloadReceipt() {
    const applicationNumber = sessionStorage.getItem("applicationNumber");
    const reference = sessionStorage.getItem("paymentReference");
    if (applicationNumber && reference) {
        window.open(`/api/receipt/download?type=application&ref=${reference}&appNum=${applicationNumber}`, "_blank");
    } else {
        showMessage("Receipt information not found", "danger");
    }
}
