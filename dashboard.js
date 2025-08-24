// Student Dashboard JavaScript

let currentStudent = null
let currentSection = "overview"

document.addEventListener("DOMContentLoaded", () => {
  checkAuthentication()
  loadStudentData()
  setupEventListeners()
})

// Check if student is authenticated
async function checkAuthentication() {
  try {
    const response = await fetch("/api/student/profile")
    if (!response.ok) {
      window.location.href = "/student/login"
      return
    }
    const result = await response.json()
    currentStudent = result.student
    updateStudentInfo(currentStudent)
  } catch (error) {
    console.error("Authentication check failed:", error)
    window.location.href = "/student/login"
  }
}

// Update student information in UI
function updateStudentInfo(student) {
  document.getElementById("studentName").textContent = `${student.first_name} ${student.last_name}`
  document.getElementById("sidebarStudentName").textContent = `${student.first_name} ${student.last_name}`
  document.getElementById("admissionNumber").textContent = student.admission_number || student.application_number
  document.getElementById("courseName").textContent = student.course_name || "Course Info Loading..."

  if (student.profile_picture) {
    document.getElementById("studentAvatar").src = student.profile_picture
  }
}

// Load student data for dashboard
async function loadStudentData() {
  await Promise.all([
    loadOverviewData(),
    loadProfileData(),
    loadPaymentsData(),
    loadAssignmentsData(),
    loadResultsData(),
    loadExamsData(),
  ])
}

// Load overview data
async function loadOverviewData() {
  try {
    const response = await fetch("/api/student/overview")
    const data = await response.json()

    if (data.success) {
      document.getElementById("totalAssignments").textContent = data.stats.totalAssignments
      document.getElementById("completedAssignments").textContent = data.stats.completedAssignments
      document.getElementById("overallGrade").textContent = `${data.stats.overallGrade}%`
      document.getElementById("upcomingExams").textContent = data.stats.upcomingExams

      displayRecentActivities(data.recentActivities)
    }
  } catch (error) {
    console.error("Error loading overview data:", error)
  }
}

// Display recent activities
function displayRecentActivities(activities) {
  const container = document.getElementById("recentActivities")

  if (!activities || activities.length === 0) {
    container.innerHTML = '<div class="text-center text-muted">No recent activities</div>'
    return
  }

  container.innerHTML = activities
    .map(
      (activity) => `
    <div class="activity-item">
      <div class="activity-icon ${activity.type}">
        <i class="fas ${getActivityIcon(activity.type)}"></i>
      </div>
      <div class="activity-content">
        <h6 class="mb-1">${activity.title}</h6>
        <p class="mb-0 text-muted">${activity.description}</p>
        <small class="activity-time">${formatDate(activity.created_at)}</small>
      </div>
    </div>
  `,
    )
    .join("")
}

// Get activity icon
function getActivityIcon(type) {
  const icons = {
    assignment: "fa-tasks",
    exam: "fa-clipboard-check",
    payment: "fa-credit-card",
    result: "fa-chart-bar",
  }
  return icons[type] || "fa-info-circle"
}

// Load profile data
async function loadProfileData() {
  if (!currentStudent) return

  document.getElementById("profileFirstName").value = currentStudent.first_name
  document.getElementById("profileLastName").value = currentStudent.last_name
  document.getElementById("profileEmail").value = currentStudent.email
  document.getElementById("profilePhone").value = currentStudent.phone || ""
  document.getElementById("profileGender").value = currentStudent.gender
  document.getElementById("profileDOB").value = currentStudent.date_of_birth
  document.getElementById("profileAddress").value = currentStudent.address || ""
  document.getElementById("profileCourse").value = currentStudent.course_name || ""
  document.getElementById("profileAdmissionNumber").value =
    currentStudent.admission_number || currentStudent.application_number
  document.getElementById("profileStatus").value = currentStudent.status
}

// Load payments data
async function loadPaymentsData() {
  try {
    const response = await fetch("/api/student/payments")
    const data = await response.json()

    if (data.success) {
      displayPayments(data.payments)
      displayOutstandingPayments(data.outstanding)
    }
  } catch (error) {
    console.error("Error loading payments data:", error)
    document.getElementById("paymentsContent").innerHTML =
      '<div class="text-center text-danger">Error loading payments</div>'
  }
}

// Display payments
function displayPayments(payments) {
  const container = document.getElementById("paymentsContent")

  if (!payments || payments.length === 0) {
    container.innerHTML = '<div class="text-center text-muted">No payment history found</div>'
    return
  }

  container.innerHTML = payments
    .map(
      (payment) => `
    <div class="payment-card">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <h6 class="mb-1">${payment.payment_type} Payment</h6>
          <p class="mb-1 text-muted">Reference: ${payment.reference_number}</p>
          <small class="text-muted">${formatDate(payment.payment_date)}</small>
        </div>
        <div class="text-end">
          <h5 class="mb-1">₦${payment.amount.toLocaleString()}</h5>
          <span class="payment-status ${payment.status.toLowerCase()}">${payment.status}</span>
        </div>
      </div>
      <div class="mt-2">
        <button class="btn btn-outline-primary btn-sm" onclick="downloadReceipt('${payment.reference_number}')">
          <i class="fas fa-download me-1"></i>Download Receipt
        </button>
      </div>
    </div>
  `,
    )
    .join("")
}

// Display outstanding payments
function displayOutstandingPayments(outstanding) {
  const container = document.getElementById("outstandingPayments")

  if (!outstanding || outstanding.length === 0) {
    container.innerHTML = '<div class="text-center text-success">No outstanding payments</div>'
    return
  }

  container.innerHTML = outstanding
    .map(
      (payment) => `
    <div class="payment-card border-warning">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <h6 class="mb-1">${payment.type} Payment</h6>
          <p class="mb-1 text-muted">${payment.description}</p>
          <small class="text-muted">Due: ${payment.dueDate || "Immediate"}</small>
        </div>
        <div class="text-end">
          <h5 class="mb-1 text-warning">₦${payment.amount.toLocaleString()}</h5>
          <button class="btn btn-warning btn-sm" onclick="payOutstanding('${payment.type}', ${payment.amount})">
            <i class="fas fa-credit-card me-1"></i>Pay Now
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join("")
}

// Load assignments data
async function loadAssignmentsData() {
  try {
    const response = await fetch("/api/student/assignments")
    const data = await response.json()

    if (data.success) {
      displayAssignments(data.assignments)
    }
  } catch (error) {
    console.error("Error loading assignments data:", error)
    document.getElementById("assignmentsContent").innerHTML =
      '<div class="text-center text-danger">Error loading assignments</div>'
  }
}

// Display assignments
function displayAssignments(assignments) {
  const container = document.getElementById("assignmentsContent")

  if (!assignments || assignments.length === 0) {
    container.innerHTML = '<div class="text-center text-muted">No assignments found</div>'
    return
  }

  container.innerHTML = assignments
    .map((assignment) => {
      const status = getAssignmentStatus(assignment)
      const isOverdue = new Date(assignment.due_date) < new Date() && !assignment.submitted

      return `
      <div class="assignment-card ${status} ${isOverdue ? "overdue" : ""}" data-status="${status}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <h6 class="card-title">${assignment.title}</h6>
              <p class="card-text text-muted">${assignment.description || "No description provided"}</p>
              <div class="assignment-meta">
                <small class="text-muted">
                  <i class="fas fa-calendar me-1"></i>Given: ${formatDate(assignment.date_given)}
                </small>
                <small class="text-muted ms-3">
                  <i class="fas fa-clock me-1"></i>Due: ${formatDate(assignment.due_date)}
                </small>
                <small class="text-muted ms-3">
                  <i class="fas fa-star me-1"></i>Max Score: ${assignment.max_score}
                </small>
              </div>
            </div>
            <div class="assignment-actions">
              ${getAssignmentActions(assignment, status, isOverdue)}
            </div>
          </div>
          ${
            assignment.submission
              ? `
            <div class="submission-info mt-3 p-2 bg-light rounded">
              <small class="text-success">
                <i class="fas fa-check-circle me-1"></i>
                Submitted on ${formatDate(assignment.submission.submission_date)}
              </small>
              ${
                assignment.submission.score !== null
                  ? `
                <div class="mt-1">
                  <strong>Score: ${assignment.submission.score}/${assignment.max_score}</strong>
                  ${
                    assignment.submission.feedback
                      ? `
                    <div class="mt-1">
                      <small class="text-muted">Feedback: ${assignment.submission.feedback}</small>
                    </div>
                  `
                      : ""
                  }
                </div>
              `
                  : '<div class="mt-1"><small class="text-warning">Awaiting grading</small></div>'
              }
            </div>
          `
              : ""
          }
        </div>
      </div>
    `
    })
    .join("")
}

// Get assignment status
function getAssignmentStatus(assignment) {
  if (assignment.submission) {
    return assignment.submission.score !== null ? "graded" : "submitted"
  }
  return "pending"
}

// Get assignment actions
function getAssignmentActions(assignment, status, isOverdue) {
  if (status === "graded") {
    return `<span class="badge bg-success">Graded</span>`
  } else if (status === "submitted") {
    return `<span class="badge bg-info">Submitted</span>`
  } else if (isOverdue) {
    return `<span class="badge bg-danger">Overdue</span>`
  } else {
    return `
      <button class="btn btn-primary btn-sm" onclick="submitAssignment(${assignment.id}, '${assignment.title}', '${assignment.due_date}')">
        <i class="fas fa-upload me-1"></i>Submit
      </button>
    `
  }
}

// Load results data
async function loadResultsData() {
  try {
    const response = await fetch("/api/student/results")
    const data = await response.json()

    if (data.success) {
      displayResults(data.results)
    }
  } catch (error) {
    console.error("Error loading results data:", error)
  }
}

// Display results
function displayResults(results) {
  const assignmentGrade = results.assignmentAverage || 0
  const testGrade = results.testAverage || 0
  const examGrade = results.examAverage || 0

  // Calculate weighted final grade
  const finalGrade = assignmentGrade * 0.6 + testGrade * 0.1 + examGrade * 0.3

  document.getElementById("assignmentGrade").textContent = `${assignmentGrade}%`
  document.getElementById("testGrade").textContent = `${testGrade}%`
  document.getElementById("examGrade").textContent = `${examGrade}%`
  document.getElementById("finalGrade").textContent = `${Math.round(finalGrade)}%`

  // Update grade status
  const gradeStatus = document.getElementById("gradeStatus")
  if (finalGrade >= 70) {
    gradeStatus.textContent = "Excellent Performance"
    gradeStatus.className = "lead text-success"
  } else if (finalGrade >= 60) {
    gradeStatus.textContent = "Good Performance"
    gradeStatus.className = "lead text-info"
  } else if (finalGrade >= 50) {
    gradeStatus.textContent = "Average Performance"
    gradeStatus.className = "lead text-warning"
  } else {
    gradeStatus.textContent = "Needs Improvement"
    gradeStatus.className = "lead text-danger"
  }

  // Display detailed results
  displayDetailedResults(results.detailed || [])
}

// Display detailed results
function displayDetailedResults(detailed) {
  const container = document.getElementById("detailedResults")

  if (!detailed || detailed.length === 0) {
    container.innerHTML = '<div class="text-center text-muted">No detailed results available</div>'
    return
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-striped">
        <thead>
          <tr>
            <th>Assessment</th>
            <th>Type</th>
            <th>Score</th>
            <th>Max Score</th>
            <th>Percentage</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${detailed
            .map(
              (result) => `
            <tr>
              <td>${result.title}</td>
              <td><span class="badge bg-secondary">${result.type}</span></td>
              <td>${result.score}</td>
              <td>${result.max_score}</td>
              <td>
                <span class="badge ${getGradeBadgeClass(result.percentage)}">
                  ${result.percentage}%
                </span>
              </td>
              <td>${formatDate(result.date)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
}

// Get grade badge class
function getGradeBadgeClass(percentage) {
  if (percentage >= 70) return "bg-success"
  if (percentage >= 60) return "bg-info"
  if (percentage >= 50) return "bg-warning"
  return "bg-danger"
}

// Load exams data
async function loadExamsData() {
  try {
    const response = await fetch("/api/student/exams")
    const data = await response.json()

    if (data.success) {
      displayExams(data.exams)
      displayExamHistory(data.history)
    }
  } catch (error) {
    console.error("Error loading exams data:", error)
    document.getElementById("examsContent").innerHTML = '<div class="text-center text-danger">Error loading exams</div>'
  }
}

// Display exams
function displayExams(exams) {
  const container = document.getElementById("examsContent")

  if (!exams || exams.length === 0) {
    container.innerHTML = '<div class="text-center text-muted">No exams available at this time</div>'
    return
  }

  container.innerHTML = exams
    .map((exam) => {
      const isActive = exam.is_active && new Date(exam.scheduled_date) <= new Date()
      const isPast = new Date(exam.scheduled_date) < new Date()

      return `
      <div class="exam-card ${isActive ? "active" : ""}">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <h6>${exam.title}</h6>
            <p class="text-muted mb-2">${exam.description || "No description provided"}</p>
            <div class="exam-meta">
              <small class="text-muted">
                <i class="fas fa-clock me-1"></i>Duration: ${exam.duration_minutes} minutes
              </small>
              <small class="text-muted ms-3">
                <i class="fas fa-question-circle me-1"></i>Questions: ${exam.total_questions}
              </small>
              <small class="text-muted ms-3">
                <i class="fas fa-calendar me-1"></i>Scheduled: ${formatDate(exam.scheduled_date)}
              </small>
            </div>
          </div>
          <div class="exam-actions">
            ${getExamActions(exam, isActive, isPast)}
          </div>
        </div>
      </div>
    `
    })
    .join("")
}

// Get exam actions
function getExamActions(exam, isActive, isPast) {
  if (isPast && !isActive) {
    return '<span class="badge bg-secondary">Ended</span>'
  } else if (isActive) {
    return `
      <button class="btn btn-success" onclick="startExam(${exam.id})">
        <i class="fas fa-play me-1"></i>Start Exam
      </button>
    `
  } else {
    return `
      <div class="exam-timer">
        <i class="fas fa-clock me-1"></i>
        Starts ${formatDate(exam.scheduled_date)}
      </div>
    `
  }
}

// Display exam history
function displayExamHistory(history) {
  const container = document.getElementById("examHistory")

  if (!history || history.length === 0) {
    container.innerHTML = '<div class="text-center text-muted">No exam history found</div>'
    return
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-striped">
        <thead>
          <tr>
            <th>Exam</th>
            <th>Type</th>
            <th>Score</th>
            <th>Total Questions</th>
            <th>Percentage</th>
            <th>Time Taken</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${history
            .map(
              (result) => `
            <tr>
              <td>${result.exam_title}</td>
              <td><span class="badge bg-info">${result.exam_type}</span></td>
              <td>${result.score}</td>
              <td>${result.total_questions}</td>
              <td>
                <span class="badge ${getGradeBadgeClass(Math.round((result.score / result.total_questions) * 100))}">
                  ${Math.round((result.score / result.total_questions) * 100)}%
                </span>
              </td>
              <td>${result.time_taken_minutes} min</td>
              <td>${formatDate(result.completed_at)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
}

// Setup event listeners
function setupEventListeners() {
  // Profile form submission
  document.getElementById("profileForm").addEventListener("submit", updateProfile)

  // Assignment upload form
  document.getElementById("assignmentUploadForm").addEventListener("submit", uploadAssignment)

  // Profile picture form
  document.getElementById("profilePictureForm").addEventListener("submit", updateProfilePicture)

  // Profile picture preview
  document.getElementById("profilePictureFile").addEventListener("change", previewProfilePicture)
}

// Show section
function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll(".dashboard-section").forEach((section) => {
    section.style.display = "none"
  })

  // Show selected section
  document.getElementById(`${sectionName}-section`).style.display = "block"

  // Update menu active state
  document.querySelectorAll(".menu-item").forEach((item) => {
    item.classList.remove("active")
  })
  document.querySelector(`[data-section="${sectionName}"]`).classList.add("active")

  currentSection = sectionName
}

// Submit assignment
function submitAssignment(assignmentId, title, dueDate) {
  document.getElementById("assignmentId").value = assignmentId
  document.getElementById("assignmentTitle").value = title
  document.getElementById("assignmentDueDate").value = formatDate(dueDate)

  const modal = window.bootstrap.Modal(document.getElementById("assignmentUploadModal"))
  modal.show()
}

// Upload assignment
async function uploadAssignment(e) {
  e.preventDefault()

  const formData = new FormData()
  formData.append("assignmentId", document.getElementById("assignmentId").value)
  formData.append("file", document.getElementById("assignmentFile").files[0])
  formData.append("notes", document.getElementById("submissionNotes").value)

  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  setLoadingState(submitBtn, true, originalText)

  try {
    const response = await fetch("/api/student/submit-assignment", {
      method: "POST",
      body: formData,
    })

    const result = await response.json()

    if (result.success) {
      showMessage("Assignment submitted successfully!", "success")
      const modal = window.bootstrap.Modal.getInstance(document.getElementById("assignmentUploadModal"))
      modal.hide()

      // Reload assignments
      await loadAssignmentsData()
    } else {
      throw new Error(result.error || "Submission failed")
    }
  } catch (error) {
    console.error("Assignment submission error:", error)
    showMessage(error.message || "Submission failed", "danger")
  } finally {
    setLoadingState(submitBtn, false, originalText)
  }
}

// Change profile picture
function changeProfilePicture() {
  const modal = window.bootstrap.Modal(document.getElementById("profilePictureModal"))
  modal.show()
}

// Preview profile picture
function previewProfilePicture(e) {
  const file = e.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      document.getElementById("previewImage").src = e.target.result
    }
    reader.readAsDataURL(file)
  }
}

// Update profile picture
async function updateProfilePicture(e) {
  e.preventDefault()

  const formData = new FormData()
  formData.append("profilePicture", document.getElementById("profilePictureFile").files[0])

  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  setLoadingState(submitBtn, true, originalText)

  try {
    const response = await fetch("/api/student/update-profile-picture", {
      method: "POST",
      body: formData,
    })

    const result = await response.json()

    if (result.success) {
      showMessage("Profile picture updated successfully!", "success")
      document.getElementById("studentAvatar").src = result.profilePicture

      const modal = window.bootstrap.Modal.getInstance(document.getElementById("profilePictureModal"))
      modal.hide()
    } else {
      throw new Error(result.error || "Update failed")
    }
  } catch (error) {
    console.error("Profile picture update error:", error)
    showMessage(error.message || "Update failed", "danger")
  } finally {
    setLoadingState(submitBtn, false, originalText)
  }
}

// Update profile
async function updateProfile(e) {
  e.preventDefault()

  const profileData = {
    phone: document.getElementById("profilePhone").value,
    address: document.getElementById("profileAddress").value,
  }

  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  setLoadingState(submitBtn, true, originalText)

  try {
    const response = await fetch("/api/student/update-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(profileData),
    })

    const result = await response.json()

    if (result.success) {
      showMessage("Profile updated successfully!", "success")
    } else {
      throw new Error(result.error || "Update failed")
    }
  } catch (error) {
    console.error("Profile update error:", error)
    showMessage(error.message || "Update failed", "danger")
  } finally {
    setLoadingState(submitBtn, false, originalText)
  }
}

// Filter assignments
function filterAssignments(filter) {
  const assignments = document.querySelectorAll(".assignment-card")

  // Update button states
  document.querySelectorAll(".btn-group .btn").forEach((btn) => {
    btn.classList.remove("active")
  })
  event.target.classList.add("active")

  assignments.forEach((assignment) => {
    const status = assignment.dataset.status

    if (filter === "all") {
      assignment.style.display = "block"
    } else if (filter === status) {
      assignment.style.display = "block"
    } else {
      assignment.style.display = "none"
    }
  })
}

// Start exam
function startExam(examId) {
  if (confirm("Are you ready to start the exam? Once started, the timer will begin and cannot be paused.")) {
    window.location.href = `/student/exam/${examId}`
  }
}

// Download receipt
function downloadReceipt(reference) {
  window.open(`/api/receipt/download?reference=${reference}`, "_blank")
}

// Pay outstanding payment
function payOutstanding(type, amount) {
  // This would integrate with Paystack for payment
  alert(`Payment integration for ${type} payment of ₦${amount.toLocaleString()} will be implemented.`)
}

// Logout
function logout() {
  if (confirm("Are you sure you want to logout?")) {
    fetch("/api/student/logout", { method: "POST" })
      .then(() => {
        window.location.href = "/student/login"
      })
      .catch((error) => {
        console.error("Logout error:", error)
        window.location.href = "/student/login"
      })
  }
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Utility functions
function setLoadingState(button, loading, originalText) {
  if (loading) {
    button.disabled = true
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...'
  } else {
    button.disabled = false
    button.innerHTML = originalText
  }
}

function showMessage(message, type) {
  const alertDiv = document.createElement("div")
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`
  alertDiv.style.cssText = "top: 100px; right: 20px; z-index: 9999; min-width: 300px;"
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `

  document.body.appendChild(alertDiv)

  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.remove()
    }
  }, 5000)
}
