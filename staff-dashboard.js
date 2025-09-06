const API_URL = '/api';
const createAssignmentModal = new bootstrap.Modal(document.getElementById('createAssignmentModal'));
let courseProgressChart = null;

/**
 * Shows the selected content section and hides others.
 * @param {string} sectionId The ID of the section to show (e.g., 'overview').
 */
function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });

    const activeSection = document.getElementById(sectionId + 'Section');
    if (activeSection) {
        activeSection.style.display = 'block';
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.nav-link[data-section="${sectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    document.getElementById('pageTitle').textContent = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);

    // Fetch and load data for the specific section
    if (sectionId === 'overview') {
        loadDashboardData();
    } else if (sectionId === 'students') {
        loadStudentsData();
    } else if (sectionId === 'assignments') {
        loadAssignmentsData();
    } else if (sectionId === 'profile') {
        populateStaffProfile();
    } else if (sectionId === 'reports') {
        loadCourseProgressReport();
    } else if (sectionId === 'settings') {
        // No specific loading logic for settings, just show the section
    }
}

/**
 * Fetches and renders the course progress report chart.
 */
async function loadCourseProgressReport() {
    try {
        const chartLoading = document.getElementById('chartLoading');
        chartLoading.style.display = 'block';

        const response = await fetch(`${API_URL}/reports/course-progress`);
        const data = await response.json();

        chartLoading.style.display = 'none';

        if (response.ok && data.length > 0) {
            const ctx = document.getElementById('courseProgressChart').getContext('2d');
            
            // Destroy existing chart if it exists
            if (courseProgressChart) {
                courseProgressChart.destroy();
            }

            courseProgressChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.map(item => item.courseName),
                    datasets: [{
                        label: 'Average Score (%)',
                        data: data.map(item => item.averageScore ? (item.averageScore / 100 * 100).toFixed(2) : 0),
                        backgroundColor: 'rgba(13, 110, 253, 0.5)',
                        borderColor: 'rgba(13, 110, 253, 1)',
                        borderWidth: 1
                    }, {
                        label: 'Number of Students',
                        data: data.map(item => item.studentCount),
                        backgroundColor: 'rgba(40, 167, 69, 0.5)',
                        borderColor: 'rgba(40, 167, 69, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            title: {
                                display: true,
                                text: 'Score (%) / Student Count'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Courses'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.dataset.label === 'Average Score (%)') {
                                        label += `${context.parsed.y}%`;
                                    } else {
                                        label += context.parsed.y;
                                    }
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            document.getElementById('reportsSection').innerHTML += `
                <div class="alert alert-info mt-3">No data available to display the course progress report.</div>
            `;
        }
    } catch (error) {
        console.error('Error loading course progress report:', error);
        document.getElementById('chartLoading').style.display = 'none';
        document.getElementById('reportsSection').innerHTML += `
            <div class="alert alert-danger mt-3">Failed to load course progress report.</div>
        `;
    }
}

/**
 * Fetches and populates the staff profile from the backend.
 */
async function populateStaffProfile() {
    try {
        const response = await fetch(`${API_URL}/staff/me`);
        if (!response.ok) {
            throw new Error('Failed to fetch staff profile.');
        }
        const data = await response.json();
        
        // Populate sidebar profile
        const sidebarProfilePic = document.getElementById('sidebarProfilePic');
        const staffName = document.getElementById('staffName');
        const staffId = document.getElementById('staffId');

        sidebarProfilePic.src = data.profilePic;
        staffName.textContent = `${data.first_name} ${data.last_name}`;
        staffId.textContent = `ID: ${data.id}`;

        // Populate full profile section
        const profilePicture = document.getElementById('profilePicture');
        const profileName = document.getElementById('profileName');
        const profileId = document.getElementById('profileId');
        const profilePosition = document.getElementById('profilePosition');
        const profileQualifications = document.getElementById('profileQualifications');
        const profileCourses = document.getElementById('profileCourses');

        profilePicture.src = data.profilePic;
        profileName.textContent = `${data.first_name} ${data.last_name}`;
        profileId.textContent = `ID: ${data.id}`;
        profilePosition.textContent = data.positions || 'N/A';
        profileQualifications.textContent = data.qualifications || 'N/A';
        profileCourses.textContent = data.courses || 'N/A';

    } catch (error) {
        console.error('Error populating staff profile:', error);
        // Fallback to default values
        document.getElementById('staffName').textContent = "Staff Name";
        document.getElementById('staffId').textContent = "ID: N/A";
    }
}

/**
 * Fetches and populates the dashboard statistics and recent activities.
 */
async function loadDashboardData() {
    try {
        const statsResponse = await fetch(`${API_URL}/dashboard/stats`);
        const statsData = await statsResponse.json();
        if (statsResponse.ok) {
            document.getElementById('activeAssignments').textContent = statsData.activeAssignments;
            document.getElementById('pendingSubmissions').textContent = statsData.pendingSubmissions;
            document.getElementById('upcomingExams').textContent = statsData.upcomingExams;
            
            let totalStudents = 0;
            const studentCountsContainer = document.getElementById('studentCountsContainer');
            studentCountsContainer.innerHTML = ''; 

            if (statsData.studentCounts.length > 0) {
                statsData.studentCounts.forEach(course => {
                    totalStudents += course.studentCount;
                    const card = document.createElement('div');
                    card.className = 'card bg-light mb-2';
                    card.innerHTML = `
                        <div class="card-body p-2 d-flex justify-content-between align-items-center">
                            <span class="text-muted">${course.courseName}</span>
                            <span class="badge bg-primary rounded-pill">${course.studentCount} students</span>
                        </div>
                    `;
                    studentCountsContainer.appendChild(card);
                });
            } else {
                studentCountsContainer.innerHTML = '<p class="text-muted text-center py-4">No students found for your courses.</p>';
            }
            document.getElementById('totalStudentsCount').textContent = totalStudents;
        }

        const activitiesResponse = await fetch(`${API_URL}/dashboard/activities`);
        const activitiesData = await activitiesResponse.json();
        if (activitiesResponse.ok) {
            const activitiesList = document.getElementById('recentActivities');
            activitiesList.innerHTML = '';
            if (activitiesData.length > 0) {
                activitiesData.forEach(activity => {
                    const eventDate = new Date(activity.event_date);
                    const formattedDate = eventDate.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    });

                    activitiesList.innerHTML += `
                        <div class="alert alert-light py-2" role="alert">
                            <small class="text-muted float-end">${formattedDate}</small>
                            ${activity.description}
                        </div>
                    `;
                });
            } else {
                activitiesList.innerHTML = '<p class="text-muted">No recent activities.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

/**
 * Fetches and populates the students table.
 */
async function loadStudentsData() {
    try {
        const response = await fetch(`${API_URL}/students`);
        const studentsData = await response.json();
        const studentsTableBody = document.getElementById('studentsTableBody');
        studentsTableBody.innerHTML = ''; // Clear previous content
        if (response.ok && studentsData.length > 0) {
            studentsData.forEach(student => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${student.studentId}</td>
                    <td>${student.name}</td>
                    <td>${student.email}</td>
                    <td>${student.course || 'N/A'}</td>
                    <td><span class="badge bg-success">${student.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-info me-2"><i class="fas fa-eye"></i> View</button>
                        <button class="btn btn-sm btn-danger"><i class="fas fa-trash-alt"></i> Delete</button>
                    </td>
                `;
                studentsTableBody.appendChild(row);
            });
        } else {
            studentsTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No students found for your courses.</td></tr>';
        }
    } catch (error) {
        console.error('Error fetching students:', error);
    }
}

/**
 * Fetches and populates the assignments table.
 */
async function loadAssignmentsData() {
    try {
        const response = await fetch(`${API_URL}/assignments`);
        const assignmentsData = await response.json();
        const assignmentsTableBody = document.getElementById('assignmentsTableBody');
        assignmentsTableBody.innerHTML = ''; // Clear previous content
        if (response.ok && assignmentsData.length > 0) {
            assignmentsData.forEach(assignment => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${assignment.title}</td>
                    <td>${assignment.course}</td>
                    <td>${new Date(assignment.dueDate).toLocaleString()}</td>
                    <td>${assignment.maxScore}</td>
                    <td>${assignment.submissions}</td>
                    <td>
                        <button class="btn btn-sm btn-info me-2"><i class="fas fa-eye"></i> View</button>
                        <button class="btn btn-sm btn-danger"><i class="fas fa-trash-alt"></i> Delete</button>
                    </td>
                `;
                assignmentsTableBody.appendChild(row);
            });
        } else {
            assignmentsTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No assignments found.</td></tr>';
        }
    } catch (error) {
        console.error('Error fetching assignments:', error);
    }
}

/**
 * Creates a new assignment by submitting form data to the backend.
 */
async function createAssignment() {
    const title = document.getElementById('assignmentTitle').value;
    const course_id = document.getElementById('assignmentCourse').value;
    const description = document.getElementById('assignmentDescription').value;
    const instructions = document.getElementById('assignmentInstructions').value;
    const due_date = document.getElementById('assignmentDueDate').value;
    const max_score = document.getElementById('assignmentMaxScore').value;

    const newAssignment = {
        title,
        course_id,
        description,
        instructions,
        date_given: new Date().toISOString(),
        due_date,
        max_score
    };

    try {
        const response = await fetch(`${API_URL}/assignments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newAssignment)
        });

        const result = await response.json();

        if (response.ok) {
            createAssignmentModal.hide();
            loadAssignmentsData();
            // Show a success message
            const assignmentsSection = document.getElementById('assignmentsSection');
            assignmentsSection.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show mt-3" role="alert">
                    ${result.message}
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            ` + assignmentsSection.innerHTML;
        } else {
            // Show an error message
            const assignmentsSection = document.getElementById('assignmentsSection');
            assignmentsSection.innerHTML = `
                <div class="alert alert-danger alert-dismissible fade show mt-3" role="alert">
                    ${result.error || 'Failed to create assignment.'}
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            ` + assignmentsSection.innerHTML;
        }
    } catch (error) {
        console.error('Error creating assignment:', error);
        // Show a general error message
        const assignmentsSection = document.getElementById('assignmentsSection');
        assignmentsSection.innerHTML = `
            <div class="alert alert-danger alert-dismissible fade show mt-3" role="alert">
                An unexpected error occurred.
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        ` + assignmentsSection.innerHTML;
    }
}

/**
 * Fetches and populates the course dropdown for the assignment creation modal.
 */
async function populateCourseDropdown() {
    try {
        const response = await fetch(`${API_URL}/courses`);
        const courses = await response.json();
        const dropdown = document.getElementById('assignmentCourse');
        dropdown.innerHTML = '<option value="">Select a Course</option>'; // Default option
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id; // Use course ID for submission
            option.textContent = course.name;
            dropdown.appendChild(option);
        });
    } catch (error) {
        console.error('Error fetching courses:', error);
    }
}

/**
 * Handles the profile picture update form submission.
 */
async function updateProfilePicture() {
    const form = document.getElementById('profilePictureForm');
    const messageDiv = document.getElementById('profilePictureMessage');
    const formData = new FormData(form);

    messageDiv.innerHTML = `<div class="alert alert-info">Uploading...</div>`;

    try {
        const response = await fetch(`${API_URL}/settings/update-profile-picture`, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (response.ok) {
            messageDiv.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
            // Re-populate profile to show the new picture
            populateStaffProfile();
        } else {
            messageDiv.innerHTML = `<div class="alert alert-danger">${result.error || 'Failed to update profile picture.'}</div>`;
        }
    } catch (error) {
        console.error('Error updating profile picture:', error);
        messageDiv.innerHTML = `<div class="alert alert-danger">An unexpected error occurred.</div>`;
    }
}

/**
 * Handles the password change form submission.
 */
async function changePassword() {
    const form = document.getElementById('changePasswordForm');
    const messageDiv = document.getElementById('passwordMessage');
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmNewPassword) {
        messageDiv.innerHTML = `<div class="alert alert-warning">New passwords do not match.</div>`;
        return;
    }

    messageDiv.innerHTML = `<div class="alert alert-info">Changing password...</div>`;

    try {
        const response = await fetch(`${API_URL}/settings/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        const result = await response.json();

        if (response.ok) {
            messageDiv.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
            form.reset();
        } else {
            messageDiv.innerHTML = `<div class="alert alert-danger">${result.error || 'Failed to change password.'}</div>`;
        }
    } catch (error) {
        console.error('Error changing password:', error);
        messageDiv.innerHTML = `<div class="alert alert-danger">An unexpected error occurred.</div>`;
    }
}

/**
 * Handles logout functionality.
 */
async function logout() {
    try {
        const response = await fetch(`${API_URL}/staff/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const result = await response.json();
        if (response.ok) {
            window.location.href = '/staff/login';
        } else {
            alert(result.error || 'Failed to log out.');
        }
    } catch (error) {
        console.error('Error logging out:', error);
        alert('An unexpected error occurred during logout.');
    }
}

/**
 * Shows the create assignment modal and populates the course dropdown.
 */
function showCreateAssignmentModal() {
    populateCourseDropdown();
    createAssignmentModal.show();
}

// Initial setup on page load
document.addEventListener('DOMContentLoaded', () => {
    // Populate staff profile and load the default section
    populateStaffProfile();
    showSection('overview');

    // Set up navigation link event listeners
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            showSection(section);
        });
    });

    // Set up create assignment button event listeners
    document.getElementById('createAssignmentButton').addEventListener('click', showCreateAssignmentModal);
    document.getElementById('createAssignmentButton2').addEventListener('click', showCreateAssignmentModal);

    // Set up logout button event listener
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    // Set up form submission event listeners
    document.getElementById('createAssignmentForm').addEventListener('submit', (e) => {
        e.preventDefault();
        createAssignment();
    });

    document.getElementById('profilePictureForm').addEventListener('submit', (e) => {
        e.preventDefault();
        updateProfilePicture();
    });

    document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
        e.preventDefault();
        changePassword();
    });

    // Set up export students button (placeholder for future implementation)
    document.getElementById('exportStudentsBtn').addEventListener('click', () => {
        alert('Export functionality not yet implemented.');
    });
});