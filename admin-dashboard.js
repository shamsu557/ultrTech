import { Chart } from "@/components/ui/chart"
let currentAdmin = null
let revenueChart = null
const bootstrap = window.bootstrap

document.addEventListener("DOMContentLoaded", () => {
  // Check authentication
  checkAuthentication()

  // Load initial data
  loadDashboardData()

  // Initialize charts
  initializeCharts()
})

async function checkAuthentication() {
  try {
    const response = await fetch("/api/admin/profile")
    const result = await response.json()

    if (!result.success) {
      window.location.href = "/admin/login"
      return
    }

    currentAdmin = result.admin
    document.getElementById("adminName").textContent = `${currentAdmin.first_name} ${currentAdmin.last_name}`
    document.getElementById("adminRole").textContent = currentAdmin.role
  } catch (error) {
    console.error("Authentication check failed:", error)
    window.location.href = "/admin/login"
  }
}

async function loadDashboardData() {
  try {
    const response = await fetch("/api/admin/overview")
    const result = await response.json()

    if (result.success) {
      // Update stats
      document.getElementById("totalStudents").textContent = result.stats.totalStudents || 0
      document.getElementById("activeStaff").textContent = result.stats.activeStaff || 0
      document.getElementById("monthlyRevenue").textContent = `₦${(result.stats.monthlyRevenue || 0).toLocaleString()}`
      document.getElementById("pendingApprovals").textContent = result.stats.pendingApprovals || 0

      // Update chart data
      if (revenueChart && result.revenueData) {
        updateRevenueChart(result.revenueData)
      }
    }
  } catch (error) {
    console.error("Error loading dashboard data:", error)
  }
}

function initializeCharts() {
  const ctx = document.getElementById("revenueChart").getContext("2d")
  revenueChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      datasets: [
        {
          label: "Revenue (₦)",
          data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          borderColor: "#007bff",
          backgroundColor: "rgba(0, 123, 255, 0.1)",
          borderWidth: 2,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => "₦" + value.toLocaleString(),
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  })
}

function updateRevenueChart(data) {
  if (revenueChart) {
    revenueChart.data.datasets[0].data = data
    revenueChart.update()
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
    case "staff":
      loadStaff()
      break
    case "courses":
      loadCourses()
      break
    case "payments":
      loadPayments()
      break
    case "assignments":
      loadAssignments()
      break
    case "exams":
      loadExams()
      break
    case "reports":
      loadReports()
      break
    case "certificates":
      loadCertificates()
      break
    case "system":
      loadSystemSettings()
      break
  }
}

async function loadStudents() {
  try {
    const response = await fetch("/api/admin/students")
    const result = await response.json()

    if (result.success) {
      const tbody = document.getElementById("studentsTableBody")

      if (result.students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">No students found</td></tr>'
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
                    <td>${formatDate(student.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewStudent(${student.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="editStudent(${student.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${
                          student.status === "Applied"
                            ? `<button class="btn btn-sm btn-success" onclick="approveStudent(${student.id})">
                                <i class="fas fa-check"></i>
                            </button>`
                            : ""
                        }
                        <button class="btn btn-sm btn-danger" onclick="deleteStudent(${student.id})">
                            <i class="fas fa-trash"></i>
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

function getStatusColor(status) {
  const colors = {
    Applied: "warning",
    Registered: "success",
    Active: "primary",
    Suspended: "danger",
    Graduated: "info",
    Pending: "secondary",
  }
  return colors[status] || "secondary"
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

function showApprovalModal() {
  const modal = new bootstrap.Modal(document.getElementById("approvalModal"))
  modal.show()
  loadPendingApprovals()
}

async function loadPendingApprovals() {
  try {
    const response = await fetch("/api/admin/pending-approvals")
    const result = await response.json()

    const container = document.getElementById("pendingStudents")

    if (result.success && result.students.length > 0) {
      container.innerHTML = result.students
        .map(
          (student) => `
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-md-8">
                                <h6 class="mb-1">${student.first_name} ${student.last_name}</h6>
                                <p class="mb-1 text-muted">${student.email}</p>
                                <small class="text-muted">Course: ${student.course_name}</small>
                            </div>
                            <div class="col-md-4 text-end">
                                <button class="btn btn-sm btn-success me-2" onclick="approveStudent(${student.id})">
                                    <i class="fas fa-check me-1"></i>Approve
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="rejectStudent(${student.id})">
                                    <i class="fas fa-times me-1"></i>Reject
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `,
        )
        .join("")
    } else {
      container.innerHTML = '<p class="text-center text-muted py-4">No pending approvals</p>'
    }
  } catch (error) {
    console.error("Error loading pending approvals:", error)
  }
}

async function approveStudent(studentId) {
  try {
    const response = await fetch(`/api/admin/approve-student/${studentId}`, {
      method: "POST",
    })

    const result = await response.json()

    if (result.success) {
      showSuccess("Student approved successfully!")
      loadPendingApprovals()
      loadDashboardData()
    } else {
      throw new Error(result.error || "Failed to approve student")
    }
  } catch (error) {
    console.error("Error approving student:", error)
    showError(error.message || "Failed to approve student")
  }
}

async function logout() {
  try {
    const response = await fetch("/api/admin/logout", {
      method: "POST",
    })

    const result = await response.json()

    if (result.success) {
      window.location.href = "/admin/login"
    }
  } catch (error) {
    console.error("Logout error:", error)
    window.location.href = "/admin/login"
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
function loadStaff() {
  console.log("Loading staff...")
}

function loadCourses() {
  console.log("Loading courses...")
}

function loadPayments() {
  console.log("Loading payments...")
}

function loadAssignments() {
  console.log("Loading assignments...")
}

function loadExams() {
  console.log("Loading exams...")
}

function loadReports() {
  console.log("Loading reports...")
}

function loadCertificates() {
  console.log("Loading certificates...")
}

function loadSystemSettings() {
  console.log("Loading system settings...")
}

function viewStudent(studentId) {
  console.log("Viewing student:", studentId)
}

function editStudent(studentId) {
  console.log("Editing student:", studentId)
}

function deleteStudent(studentId) {
  console.log("Deleting student:", studentId)
}

function rejectStudent(studentId) {
  console.log("Rejecting student:", studentId)
}

function exportStudents() {
  console.log("Exporting students...")
}

function showStaffApprovalModal() {
  console.log("Showing staff approval modal...")
}

function showAddCourseModal() {
  console.log("Showing add course modal...")
}
