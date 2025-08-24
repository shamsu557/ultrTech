let currentStaff = null
import bootstrap from "bootstrap"

document.addEventListener("DOMContentLoaded", () => {
  // Check authentication
  checkAuthentication()

  // Load initial data
  loadDashboardData()

  // Load courses for assignment creation
  loadCourses()
})

async function checkAuthentication() {
  try {
    const response = await fetch("/api/staff/profile")
    const result = await response.json()

    if (!result.success) {
      window.location.href = "/staff/login"
      return
    }

    currentStaff = result.staff
    document.getElementById("staffName").textContent = `${currentStaff.first_name} ${currentStaff.last_name}`
  } catch (error) {
    console.error("Authentication check failed:", error)
    window.location.href = "/staff/login"
  }
}

async function loadDashboardData() {
  try {
    const response = await fetch("/api/staff/overview")
    const result = await response.json()

    if (result.success) {
      // Update stats
      document.getElementById("totalStudents").textContent = result.stats.totalStudents || 0
      document.getElementById("activeAssignments").textContent = result.stats.activeAssignments || 0
      document.getElementById("pendingSubmissions").textContent = result.stats.pendingSubmissions || 0
      document.getElementById("upcomingExams").textContent = result.stats.upcomingExams || 0

      // Load recent activities
      loadRecentActivities(result.recentActivities || [])
    }
  } catch (error) {
    console.error("Error loading dashboard data:", error)
  }
}

function loadRecentActivities(activities) {
  const container = document.getElementById("recentActivities")

  if (activities.length === 0) {
    container.innerHTML = '<p class="text-muted text-center py-4">No recent activities</p>'
    return
  }

  const activitiesHtml = activities
    .map(
      (activity) => `
        <div class="d-flex align-items-center py-2 border-bottom">
            <div class="flex-shrink-0">
                <i class="fas fa-${getActivityIcon(activity.type)} text-primary"></i>
            </div>
            <div class="flex-grow-1 ms-3">
                <div class="fw-semibold">${activity.title}</div>
                <div class="text-muted small">${activity.description}</div>
            </div>
            <div class="flex-shrink-0 text-muted small">
                ${formatDate(activity.created_at)}
            </div>
        </div>
    `,
    )
    .join("")

  container.innerHTML = activitiesHtml
}

function getActivityIcon(type) {
  const icons = {
    assignment: "tasks",
    submission: "file-upload",
    student: "user-plus",
    exam: "clipboard-list",
  }
  return icons[type] || "info-circle"
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

async function loadCourses() {
  try {
    const response = await fetch("/api/courses")
    const courses = await response.json()

    const courseSelect = document.getElementById("assignmentCourse")
    courseSelect.innerHTML = '<option value="">Select Course</option>'

    courses.forEach((course) => {
      courseSelect.innerHTML += `<option value="${course.id}">${course.name}</option>`
    })
  } catch (error) {
    console.error("Error loading courses:", error)
  }
}

function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll(".content-section").forEach((section) => {
    section.style.display = "none"
  })

  // Remove active class from all nav links
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.remove("active")
  })

  // Show selected section
  document.getElementById(sectionName + "Section").style.display = "block"

  // Add active class to clicked nav link
  event.target.classList.add("active")

  // Load section-specific data
  switch (sectionName) {
    case "students":
      loadStudents()
      break
    case "assignments":
      loadAssignments()
      break
    case "submissions":
      loadSubmissions()
      break
    case "exams":
      loadExams()
      break
  }
}

async function loadStudents() {
  try {
    const response = await fetch("/api/staff/students")
    const result = await response.json()

    if (result.success) {
      const tbody = document.getElementById("studentsTableBody")

      if (result.students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No students found</td></tr>'
        return
      }

      tbody.innerHTML = result.students
        .map(
          (student) => `
                <tr>
                    <td>${student.admission_number || student.application_number}</td>
                    <td>${student.first_name} ${student.last_name}</td>
                    <td>${student.email}</td>
                    <td>${student.course_name}</td>
                    <td><span class="badge bg-${getStatusColor(student.status)}">${student.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewStudent(${student.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="messageStudent(${student.id})">
                            <i class="fas fa-envelope"></i>
                        </button>
                    </td>
                </tr>
            `,
        )
        .join("")
    }
  } catch (error) {
    console.error("Error loading students:", error)
  }
}

async function loadAssignments() {
  try {
    const response = await fetch("/api/staff/assignments")
    const result = await response.json()

    if (result.success) {
      const tbody = document.getElementById("assignmentsTableBody")

      if (result.assignments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No assignments found</td></tr>'
        return
      }

      tbody.innerHTML = result.assignments
        .map(
          (assignment) => `
                <tr>
                    <td>${assignment.title}</td>
                    <td>${assignment.course_name}</td>
                    <td>${formatDate(assignment.due_date)}</td>
                    <td>${assignment.max_score}</td>
                    <td>${assignment.submission_count || 0}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewAssignment(${assignment.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="editAssignment(${assignment.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteAssignment(${assignment.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `,
        )
        .join("")
    }
  } catch (error) {
    console.error("Error loading assignments:", error)
  }
}

function getStatusColor(status) {
  const colors = {
    Applied: "warning",
    Registered: "success",
    Active: "primary",
    Suspended: "danger",
    Graduated: "info",
  }
  return colors[status] || "secondary"
}

function showCreateAssignmentModal() {
  const modal = new bootstrap.Modal(document.getElementById("createAssignmentModal"))
  modal.show()
}

async function createAssignment() {
  const formData = {
    title: document.getElementById("assignmentTitle").value,
    courseId: document.getElementById("assignmentCourse").value,
    description: document.getElementById("assignmentDescription").value,
    instructions: document.getElementById("assignmentInstructions").value,
    dueDate: document.getElementById("assignmentDueDate").value,
    maxScore: document.getElementById("assignmentMaxScore").value,
  }

  try {
    const response = await fetch("/api/staff/create-assignment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    })

    const result = await response.json()

    if (result.success) {
      showSuccess("Assignment created successfully!")
      const modal = bootstrap.Modal.getInstance(document.getElementById("createAssignmentModal"))
      modal.hide()

      // Reset form
      document.getElementById("createAssignmentForm").reset()

      // Reload assignments if on assignments section
      if (document.getElementById("assignmentsSection").style.display !== "none") {
        loadAssignments()
      }
    } else {
      throw new Error(result.error || "Failed to create assignment")
    }
  } catch (error) {
    console.error("Error creating assignment:", error)
    showError(error.message || "Failed to create assignment")
  }
}

async function logout() {
  try {
    const response = await fetch("/api/staff/logout", {
      method: "POST",
    })

    const result = await response.json()

    if (result.success) {
      window.location.href = "/staff/login"
    }
  } catch (error) {
    console.error("Logout error:", error)
    window.location.href = "/staff/login"
  }
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

// Placeholder functions for future implementation
function loadSubmissions() {
  console.log("Loading submissions...")
}

function loadExams() {
  console.log("Loading exams...")
}

function viewStudent(studentId) {
  console.log("Viewing student:", studentId)
}

function messageStudent(studentId) {
  console.log("Messaging student:", studentId)
}

function viewAssignment(assignmentId) {
  console.log("Viewing assignment:", assignmentId)
}

function editAssignment(assignmentId) {
  console.log("Editing assignment:", assignmentId)
}

function deleteAssignment(assignmentId) {
  console.log("Deleting assignment:", assignmentId)
}

function exportStudents() {
  console.log("Exporting students...")
}
