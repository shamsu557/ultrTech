document.addEventListener("DOMContentLoaded", () => {
  // Load courses on page load
  loadCourses();

  // Mobile navbar toggle
  const navbarToggler = document.querySelector(".navbar-toggler");
  const navbarCollapse = document.querySelector("#navbarNav");
  const togglerIcon = document.querySelector(".navbar-toggler-icon");
  const togglerCloseIcon = document.querySelector(".navbar-toggler-icon-close");

  if (!navbarToggler || !navbarCollapse || !togglerIcon || !togglerCloseIcon) {
    console.error("Navbar elements missing. Check selectors: .navbar-toggler, #navbarNav, .navbar-toggler-icon, .navbar-toggler-icon-close");
    return;
  }

  // Initialize Bootstrap collapse
  const bsCollapse = new bootstrap.Collapse(navbarCollapse, { toggle: false });

  // Function to update icon visibility
  const updateIcons = (isExpanded) => {
    navbarToggler.setAttribute("aria-expanded", isExpanded);
    togglerIcon.style.display = isExpanded ? "none" : "block";
    togglerCloseIcon.style.display = isExpanded ? "block" : "none";
  };

  // Set initial icon state (menu icon visible, cancel icon hidden)
  updateIcons(false);

  // Handle navbar toggle click
  navbarToggler.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isExpanded = navbarCollapse.classList.contains("show");
    if (isExpanded) {
      bsCollapse.hide();
    } else {
      bsCollapse.show();
    }
  });

  // Listen for Bootstrap collapse events to update icons
  navbarCollapse.addEventListener("show.bs.collapse", () => {
    updateIcons(true);
  });
  navbarCollapse.addEventListener("hide.bs.collapse", () => {
    updateIcons(false);
  });

  // Close navbar when clicking nav links, dropdown items, or Enroll Now button
  document.querySelectorAll(".navbar-nav .nav-link, .dropdown-menu .dropdown-item, .navbar .btn-primary").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (window.innerWidth <= 991 && !e.target.classList.contains("dropdown-toggle")) {
        bsCollapse.hide();
      }
    });
  });

  // Close navbar when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if (
      window.innerWidth <= 991 &&
      !navbarCollapse.contains(e.target) &&
      !navbarToggler.contains(e.target) &&
      navbarCollapse.classList.contains("show")
    ) {
      bsCollapse.hide();
    }
  });

  // Close navbar on resize to desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 991 && navbarCollapse.classList.contains("show")) {
      bsCollapse.hide();
    }
  });

  // Smooth scrolling for navigation links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Navbar background change on scroll
  window.addEventListener("scroll", () => {
    const navbar = document.querySelector(".navbar");
    if (window.scrollY > 50) {
      navbar.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
      navbar.style.backdropFilter = "blur(10px)";
    } else {
      navbar.style.backgroundColor = "var(--background)";
      navbar.style.backdropFilter = "none";
    }
  });

  // Back to Top button
  const backToTopButton = document.createElement("button");
  backToTopButton.innerHTML = '<i class="fas fa-arrow-up"></i>';
  backToTopButton.className = "back-to-top";
  document.body.appendChild(backToTopButton);

  window.addEventListener("scroll", () => {
    if (window.scrollY > 200) {
      backToTopButton.style.display = "block";
    } else {
      backToTopButton.style.display = "none";
    }
  });

  backToTopButton.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });
});

// Store courses data globally
let coursesData = [];

// Load courses from API
async function loadCourses() {
  const coursesContainer = document.getElementById("coursesContainer");
  const loading = document.getElementById("coursesLoading");

  try {
    loading.style.display = "block";

    const response = await fetch("/api/courses");
    coursesData = await response.json();

    loading.style.display = "none";

    if (coursesData.length === 0) {
      coursesContainer.innerHTML =
        '<div class="col-12 text-center"><p class="text-muted">No courses available at the moment.</p></div>';
      return;
    }

    coursesContainer.innerHTML = coursesData
      .map(
        (course) => `
          <div class="col-6 col-lg-4 mb-4 d-flex">
            <div class="card shadow-sm w-100 course-card">
              <div class="card-body d-flex flex-column">
                <div class="course-meta">
                  <span class="course-badge">${course.certification_type}</span>
                  <small><i class="fas fa-clock me-1"></i>${course.duration}</small>
                </div>
                <h5 class="card-title">${course.name}</h5>
                <p class="card-text text-muted mb-3">${course.description || "Comprehensive training program designed to equip you with industry-relevant skills."}</p>
                <div class="course-meta mb-3">
                  <small><i class="fas fa-calendar me-1"></i>${formatSchedule(course.schedule)}</small>
                  <small><i class="fas fa-money-bill-wave me-1"></i>Price: ${formatCurrency(course.registration_fee)}</small>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-auto">
                  <button class="btn btn-primary-custom" onclick="showCourseDetails(${course.id})">
                    Learn More
                  </button>
                  <a href="/student/apply?course=${course.id}" class="btn btn-outline-success">
                    Apply Now
                  </a>
                </div>
              </div>
            </div>
          </div>
        `
      )
      .join("");
  } catch (error) {
    console.error("Error loading courses:", error);
    loading.style.display = "none";
    coursesContainer.innerHTML =
      '<div class="col-12 text-center"><p class="text-danger">Error loading courses. Please try again later.</p></div>';
  }
}

// Format schedule display
function formatSchedule(schedule) {
  const scheduleMap = {
    weekend: "Weekends",
    morning: "Morning Classes",
    evening: "Evening Classes",
    "morning,evening": "Morning & Evening",
  };
  return scheduleMap[schedule] || schedule;
}

// Show course details modal
function showCourseDetails(courseId) {
  const course = coursesData.find((c) => c.id === courseId);
  if (!course) {
    showMessage("Course not found.", "danger");
    return;
  }

  // Create modal
  const modal = document.createElement("div");
  modal.className = "modal fade";
  modal.id = "courseDetailsModal";
  modal.setAttribute("tabindex", "-1");
  modal.setAttribute("aria-labelledby", "courseDetailsModalLabel");
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="courseDetailsModalLabel">${course.name}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <h6 class="course-details-title">Learning Outcomes</h6>
          <p class="course-description">${course.description || "Gain industry-relevant skills and knowledge."}</p>
          <h6 class="course-details-title">Course Details</h6>
          <ul class="course-details-list">
            <li><strong>Course Code:</strong> ${course.abbreviation || "N/A"}</li>
            <li><strong>Certification Type:</strong> ${course.certification_type || "N/A"}</li>
            <li><strong>Duration:</strong> ${course.duration || "N/A"}</li>
            <li><strong>Schedule:</strong> ${formatSchedule(course.schedule) || "N/A"}</li>
            <li><strong>Price:</strong> ${formatCurrency(course.registration_fee) || "N/A"}</li>
            <li><strong>Delivery Method:</strong> Physical Classes</li>
            <li><strong>Location:</strong> Gwammaja Housing Estate, Opp. Orthopedic Hospital, Dala</li>
            <li><strong>Start Date:</strong> ${course.start_date || "20 Sept 2025"}</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
          <a href="/student/apply?course=${course.id}" class="btn btn-primary">Apply Now</a>
        </div>
      </div>
    </div>
  `;

  // Append modal to body
  document.body.appendChild(modal);

  // Initialize and show modal
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();

  // Remove modal from DOM after it's hidden
  modal.addEventListener("hidden.bs.modal", () => {
    modal.remove();
  });
}

// Payment integration helper
function initializePayment(amount, email, reference, callback) {
  console.log("Payment initialization:", { amount, email, reference });
  alert("Payment integration will be implemented with Paystack in the next phase.");
}

// Form validation helper
function validateForm(formElement) {
  const inputs = formElement.querySelectorAll("input[required], select[required], textarea[required]");
  let isValid = true;

  inputs.forEach((input) => {
    if (!input.value.trim()) {
      input.classList.add("is-invalid");
      isValid = false;
    } else {
      input.classList.remove("is-invalid");
    }
  });

  return isValid;
}

// Generate application/reference numbers
function generateReference(prefix = "REF") {
  return prefix + Date.now() + Math.floor(Math.random() * 1000);
}

// Format currency (Nigerian Naira)
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amount);
}

// Show success/error messages
function showMessage(message, type = "success") {
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
  alertDiv.style.cssText = "top: 100px; right: 20px; z-index: 9999; min-width: 300px;";
  alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

  document.body.appendChild(alertDiv);

  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.remove();
    }
  }, 5000);
}

// Loading state helper
function setLoadingState(element, isLoading, originalText = "") {
  if (isLoading) {
    element.disabled = true;
    element.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
  } else {
    element.disabled = false;
    element.innerHTML = originalText;
  }
}