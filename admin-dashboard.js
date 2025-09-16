document.addEventListener('DOMContentLoaded', async () => {
  const dashboardContainer = document.getElementById('dashboard-container');
  const adminManagementTab = document.getElementById('admin-management-tab');
  const staffTable = document.getElementById('staff-table');
  const studentsTable = document.getElementById('students-table');
  const adminsTable = document.getElementById('admins-table');
  const resourcesTable = document.getElementById('resources-table');
  const paymentsTable = document.getElementById('payments-table');
  const staffCountEl = document.getElementById('staff-count');
  const studentCountEl = document.getElementById('student-count');
  const courseCountEl = document.getElementById('course-count');
  const totalPaidEl = document.getElementById('total-paid');
  const addStaffButton = document.getElementById('add-staff-button');
  const addStudentButton = document.getElementById('add-student-button');
  const addAdminButton = document.getElementById('add-admin-button');
  const addResourceButton = document.getElementById('add-resource-button');
  const generateIdCardButton = document.getElementById('generate-id-card-button');
  const generateCertificateButton = document.getElementById('generate-certificate-button');
  const logoutButton = document.getElementById('logout-button');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalForm = document.getElementById('modal-form');
  const closeModalButton = document.getElementById('close-modal-button');
  const closeModalButtonSecondary = document.getElementById('close-modal-button-secondary');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const hamburger = document.getElementById('hamburger');
  const pageTitle = document.getElementById('pageTitle');

  let currentAction = '';
  let currentEntityType = '';
  let currentEntityId = null;

  // Dynamic API base URL
 // Auto-detect backend base URL
const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000" // Local backend
    : `${window.location.origin}`; // Same domain as frontend (Render, Vercel, Netlify, custom)

  const bootstrapModal = new bootstrap.Modal(modal, { backdrop: 'static', keyboard: false });

  // Sidebar Toggle Functionality
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar-active');
    sidebarBackdrop.classList.toggle('d-block');
  });
  sidebarBackdrop.addEventListener('click', () => {
    sidebar.classList.remove('sidebar-active');
    sidebarBackdrop.classList.remove('d-block');
  });

  // API Functions
  const fetchData = async (url, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'API call failed');
      return data;
    } catch (error) {
      console.error('Fetch error:', error);
      return { success: false, error: error.message };
    }
  };

  const postData = async (url, data) => {
    return fetchData(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  };

  const postFormData = async (url, formData) => {
    return fetchData(url, {
      method: 'POST',
      body: formData
    });
  };

  const putData = async (url, data) => {
    const headers = data instanceof FormData ? {} : { 'Content-Type': 'application/json' };
    return fetchData(url, {
      method: 'PUT',
      headers,
      body: data instanceof FormData ? data : JSON.stringify(data)
    });
  };

  const deleteData = async (url) => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const errorData = await response.json();
          return { success: false, error: errorData.error || `Error ${response.status}` };
        } else {
          return { success: false, error: "Session may have expired. Please log in again." };
        }
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Delete error:", error);
      return { success: false, error: error.message || "Request failed." };
    }
  };

  // UI Rendering Functions
  const formatCurrency = (amount) => {
    return `₦${parseFloat(amount || 0).toFixed(2)}`;
  };

  const renderStaff = (staff) => {
    staffTable.querySelector('tbody').innerHTML = '';
    staff.forEach(person => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${person.staff_id}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${person.first_name} ${person.last_name}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${person.email}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${person.positions || 'N/A'}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${person.courses || 'N/A'}</td>
     <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
  <button class="btn btn-sm btn-outline-danger delete-button" data-id="${person.id}" data-type="staff">
    <i class="bi bi-trash"></i>
  </button>
</td>
      `;
      staffTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderStudents = (students) => {
    studentsTable.querySelector('tbody').innerHTML = '';
    students.forEach(student => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
         <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${student.admission_number || 'N/A'}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${student.first_name} ${student.last_name}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.email}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.course_name || 'N/A'}</td>
      <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
  <button class="btn btn-sm btn-outline-primary edit-button" data-id="${student.id}" data-type="student">
    <i class="bi bi-pencil-square"></i>
  </button>
  <button class="btn btn-sm btn-outline-danger delete-button" data-id="${student.id}" data-type="student">
    <i class="bi bi-trash"></i>
  </button>
</td>

      `;
      studentsTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderAdmins = (admins) => {
    adminsTable.querySelector('tbody').innerHTML = '';
    admins.forEach(admin => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${admin.username}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${admin.role}</td>
     <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
  ${admin.role !== 'Admin' 
    ? `<button class="btn btn-sm btn-outline-danger delete-button" data-id="${admin.id}" data-type="admin">
         <i class="bi bi-trash"></i>
       </button>` 
    : ''
  }
</td>

      `;
      adminsTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderResources = (resources) => {
    resourcesTable.querySelector('tbody').innerHTML = '';
    resources.forEach(resource => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
         <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${resource.title}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${resource.course_name}</td>
     <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 space-x-2">
  <a href="${API_BASE_URL}${resource.file_path}" class="btn btn-sm btn-outline-secondary" target="_blank">
    <i class="bi bi-eye"></i>
  </a>
  <button class="btn btn-sm btn-outline-success download-button" data-id="${resource.id}" data-type="resource">
    <i class="bi bi-download"></i>
  </button>
</td>
<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
  <button class="btn btn-sm btn-outline-primary edit-button" data-id="${resource.id}" data-type="resource">
    <i class="bi bi-pencil-square"></i>
  </button>
  <button class="btn btn-sm btn-outline-danger delete-button" data-id="${resource.id}" data-type="resource">
    <i class="bi bi-trash"></i>
  </button>
</td>

      `;
      resourcesTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderPayments = (payments) => {
    paymentsTable.querySelector('tbody').innerHTML = '';
    payments.forEach(payment => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${payment.first_name} ${payment.last_name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${payment.payment_type}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(payment.amount)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          <span class="${payment.status === 'Completed' ? 'text-green-600' : 'text-yellow-500'} font-semibold">${payment.status}</span>
        </td>
      `;
      paymentsTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderDashboardOverview = async () => {
    const data = await fetchData('/api/admin/dashboard-overview');
    if (data.success) {
      staffCountEl.textContent = data.data.staffCount.count || 0;
      studentCountEl.textContent = data.data.studentCount.count || 0;
      courseCountEl.textContent = data.data.courseCount.count || 0;
      totalPaidEl.textContent = formatCurrency(data.data.paymentSummary.total_paid);
    } else {
      console.error('Failed to fetch dashboard data:', data.error);
      alert('Failed to load dashboard data. Please try again.');
    }

    const paymentsData = await fetchData('/api/admin/dashboard/payments');
    if (paymentsData.success) {
      renderPayments(paymentsData.payments);
    }
  };

  const refreshData = async () => {
    await fetchDataAndRender('/api/admin/staff', renderStaff);
    await fetchDataAndRender('/api/admin/students', renderStudents);
    await fetchDataAndRender('/api/admin/resources', renderResources);
    const adminsData = await fetchData('/api/admin/users');
    if (adminsData.success) {
      renderAdmins(adminsData.users);
    }
  };

  const fetchDataAndRender = async (url, renderFunc) => {
    const data = await fetchData(url);
    if (data.success) {
      renderFunc(data.staff || data.students || data.resources || data.users);
    }
  };

  // Modal Functionality
  const showModal = (title, formHtml, onSubmit, closable = true) => {
    modalTitle.textContent = title;
    modalForm.innerHTML = formHtml;
    bootstrapModal.show();
    closeModalButton.style.display = closable ? 'inline-block' : 'none';
    closeModalButtonSecondary.style.display = closable ? 'inline-block' : 'none';
    modalForm.onsubmit = async (e) => {
      e.preventDefault();
      await onSubmit(e);
      bootstrapModal.hide();
      if (currentAction !== 'change-credentials') await refreshData();
    };
  };

  closeModalButton.addEventListener('click', () => {
    if (currentAction !== 'change-credentials') {
      bootstrapModal.hide();
    }
  });

  closeModalButtonSecondary.addEventListener('click', () => {
    if (currentAction !== 'change-credentials') {
      bootstrapModal.hide();
    }
  });

  logoutButton.addEventListener('click', async () => {
    const result = await postData('/api/admin/logout');
    if (result.success) {
      window.location.href = '/admin/login';
    } else {
      alert('Failed to log out.');
    }
  });

  // Tab Functionality
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', async () => {
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

      button.classList.add('active');
      const tabName = button.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      pageTitle.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);
      sidebar.classList.remove('sidebar-active');
      sidebarBackdrop.classList.remove('d-block');

      if (tabName === 'overview') {
        await renderDashboardOverview();
      } else if (tabName === 'resources') {
        await fetchDataAndRender('/api/admin/resources', renderResources);
      }
    });
  });

// Staff Management
addStaffButton.addEventListener('click', async () => {
    const positionsData = await fetchData('/api/admin/positions');
    const coursesData = await fetchData('/api/admin/courses');

    const positionsHtml = positionsData.success && positionsData.positions.length > 0
        ? positionsData.positions.map(pos => `<option value="${pos.id}">${pos.name}</option>`).join('')
        : '<option value="" disabled>No positions available</option>';

    const coursesHtml = coursesData.success && coursesData.courses.length > 0
        ? coursesData.courses.map(course => `<option value="${course.id}">${course.name}</option>`).join('')
        : '<option value="" disabled>No courses available</option>';

    const formHtml = `
      <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Staff ID</label>
          <input type="text" name="staff_id" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">First Name</label>
          <input type="text" name="first_name" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Last Name</label>
          <input type="text" name="last_name" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Email</label>
          <input type="email" name="email" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Phone</label>
          <input type="text" name="phone" class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Positions</label>
          <select name="positions[]" multiple class="form-control">
            ${positionsHtml}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Courses</label>
          <select name="courses[]" multiple class="form-control">
            ${coursesHtml}
          </select>
        </div>
      </div>
    `;

    currentAction = 'add-staff';
    showModal('Add New Staff Member', formHtml, async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        data.positions = formData.getAll('positions[]');
        data.courses = formData.getAll('courses[]');
        const result = await postData('/api/admin/staff', data);
        if (result.success) {
            alert('Staff member added successfully.');
        } else {
            alert(result.error || 'Failed to add staff.');
        }
    });
});

  // Student Management
  addStudentButton.addEventListener('click', async () => {
    const coursesData = await fetchData('/api/admin/courses');
    const coursesHtml = coursesData.success && coursesData.courses.length > 0
      ? coursesData.courses.map(course => `<option value="${course.id}">${course.name}</option>`).join('')
      : '<option value="" disabled>No courses available</option>';
    const formHtml = `
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Admission No</label>
        <input type="text" name="admission_number" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">First Name</label>
        <input type="text" name="first_name" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Last Name</label>
        <input type="text" name="last_name" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Email</label>
        <input type="email" name="email" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Course</label>
        <select name="course_id" required class="form-control">
          ${coursesHtml}
        </select>
      </div>
    `;
    currentAction = 'add-student';
    showModal('Add New Student', formHtml, async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const result = await postFormData('/api/admin/students', formData);
      if (result.success) {
        alert('Student added successfully.');
      } else {
        alert(result.error || 'Failed to add student.');
      }
    });
  });

  // Admin Management
  addAdminButton.addEventListener('click', async () => {
    const formHtml = `
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Username</label>
        <input type="text" name="username" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Password</label>
        <input type="password" name="password" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Role</label>
        <select name="role" required class="form-control">
          <option value="Admin">Admin</option>
          <option value="Deputy Admin">Deputy Admin</option>
          <option value="Assistant Admin">Assistant Admin</option>
        </select>
      </div>
    `;
    currentAction = 'add-admin';
    showModal('Add New Admin', formHtml, async (e) => {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(e.target).entries());
      const result = await postData('/api/admin/users', formData);
      if (result.success) {
        alert('Admin created successfully.');
      } else {
        alert(result.error || 'Failed to create admin.');
      }
    });
  });

  // Resource Management
  addResourceButton.addEventListener('click', async () => {
    const coursesData = await fetchData('/api/admin/courses');
    const coursesHtml = coursesData.success && coursesData.courses.length > 0
      ? coursesData.courses.map(course => `<option value="${course.id}">${course.name}</option>`).join('')
      : '<option value="" disabled>No courses available</option>';
    const formHtml = `
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Title</label>
        <input type="text" name="title" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Course</label>
        <select name="course_id" required class="form-control">
          ${coursesHtml}
        </select>
      </div>
      <div class="mb-3">
        <label for="file" class="form-label text-gray-700 font-medium">File</label>
        <input type="file" id="file" name="file" accept=".pdf,.doc,.docx,.zip,.rar,.jpg,.jpeg,.png" required class="form-control">
      </div>
    `;
    currentAction = 'add-resource';
    showModal('Add New Resource', formHtml, async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const result = await postFormData('/api/admin/resources', formData);
      if (result.success) {
        alert('Resource added successfully.');
      } else {
        alert(result.error || 'Failed to add resource.');
      }
    });
  });

  // Delete and Edit Handlers
document.addEventListener('click', async (e) => {
  const deleteBtn = e.target.closest('.delete-button');
  const editBtn = e.target.closest('.edit-button');
  const downloadBtn = e.target.closest('.download-button');

  // Delete Staff
  if (deleteBtn && deleteBtn.dataset.type === 'staff') {
    const id = deleteBtn.dataset.id;
    if (confirm('Are you sure you want to delete this staff?')) {
      const result = await deleteData(`/api/admin/staff/${id}`);
      if (result.success) {
        alert('Staff deleted successfully.');
        await refreshData();
      } else {
        alert(result.error || 'Failed to delete staff.');
        if (result.error.includes('Session may have expired')) {
          logoutButton.click();
        }
      }
    }
  }

  // Delete Student
  if (deleteBtn && deleteBtn.dataset.type === 'student') {
    const id = deleteBtn.dataset.id;
    if (confirm('Are you sure you want to delete this student?')) {
      const result = await deleteData(`/api/admin/students/${id}`);
      if (result.success) {
        alert('Student deleted successfully.');
        await refreshData();
      } else {
        alert(result.error || 'Failed to delete student.');
        if (result.error.includes('Session may have expired')) {
          logoutButton.click();
        }
      }
    }
  }

  // Delete Admin
  if (deleteBtn && deleteBtn.dataset.type === 'admin') {
    const id = deleteBtn.dataset.id;
    if (confirm('Are you sure you want to delete this admin?')) {
      const result = await deleteData(`/api/admin/users/${id}`);
      if (result.success) {
        alert('Admin deleted successfully.');
        await refreshData();
      } else {
        alert(result.error || 'Failed to delete admin.');
        if (result.error.includes('Session may have expired')) {
          logoutButton.click();
        }
      }
    }
  }

  // Delete Resource
  if (deleteBtn && deleteBtn.dataset.type === 'resource') {
    const id = deleteBtn.dataset.id;
    if (confirm('Are you sure you want to delete this resource?')) {
      const result = await deleteData(`/api/admin/resources/${id}`);
      if (result.success) {
        alert('Resource deleted successfully.');
        await refreshData();
      } else {
        alert(result.error || 'Failed to delete resource.');
        if (result.error.includes('Session may have expired')) {
          logoutButton.click();
        }
      }
    }
  }

  // Download Resource
  if (downloadBtn && downloadBtn.dataset.type === 'resource') {
    const id = downloadBtn.dataset.id;
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/resources/download/${id}`, {
        method: 'GET',
        credentials: 'include'
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `resource_${id}${response.headers.get('content-type').includes('pdf') ? '.pdf' : ''}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        alert('Resource downloaded successfully.');
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to download resource.');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert(error.message || 'Failed to download resource.');
      if (error.message.includes('Session may have expired')) {
        logoutButton.click();
      }
    }
  }
// Edit Student
if (editBtn && editBtn.dataset.type === 'student') {
  const id = editBtn.dataset.id;
  currentAction = 'edit-student';
  currentEntityType = 'student';
  currentEntityId = id;

  const data = await fetchData(`/api/admin/students/${id}`);
  if (!data.success) {
    alert(data.error || 'Failed to fetch data for editing student.');
    return;
  }
  const student = data.student;
  const coursesData = await fetchData('/api/admin/courses');
  const coursesHtml = coursesData.success
    ? coursesData.courses.map(course => `<option value="${course.id}" ${student.course_id === course.id ? 'selected' : ''}>${course.name}</option>`).join('')
    : '<option value="" disabled>No courses available</option>';

  const formHtml = `
    <div class="mb-3 text-center">
      <label class="form-label text-gray-700 font-medium d-block">Profile Picture</label>
      <img src="${student.profile_picture ? API_BASE_URL + student.profile_picture : '/default-avatar.png'}" 
           alt="Profile Picture" 
           class="rounded-circle mb-2" 
           style="width: 100px; height: 100px; object-fit: cover;">
      <input type="file" name="profile_picture" accept="image/*" class="form-control mt-2">
    </div>
    <div class="mb-3">
      <label class="form-label text-gray-700 font-medium">Admission No</label>
      <input type="text" name="admission_number" value="${student.admission_number || ''}" required class="form-control">
    </div>
    <div class="mb-3">
      <label class="form-label text-gray-700 font-medium">First Name</label>
      <input type="text" name="first_name" value="${student.first_name || ''}" required class="form-control">
    </div>
    <div class="mb-3">
      <label class="form-label text-gray-700 font-medium">Last Name</label>
      <input type="text" name="last_name" value="${student.last_name || ''}" required class="form-control">
    </div>
    <div class="mb-3">
      <label class="form-label text-gray-700 font-medium">Email</label>
      <input type="email" name="email" value="${student.email || ''}" required class="form-control">
    </div>
    <div class="mb-3">
      <label class="form-label text-gray-700 font-medium">Course</label>
      <select name="course_id" required class="form-control">
        ${coursesHtml}
      </select>
    </div>
  `;

  showModal('Edit Student', formHtml, async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const result = await putData(`/api/admin/students/${currentEntityId}`, formData);
    if (result.success) {
      alert('Student updated successfully.');
    } else {
      alert(result.error || 'Failed to update student.');
    }
  });
}


  // Edit Admin
  if (editBtn && editBtn.dataset.type === 'admin') {
    const id = editBtn.dataset.id;
    currentAction = 'edit-admin';
    currentEntityType = 'admin';
    currentEntityId = id;

    const data = await fetchData(`/api/admin/users/${id}`);
    if (!data.success) {
      alert(data.error || 'Failed to fetch data for editing admin.');
      return;
    }
    const admin = data.users[0];
    const formHtml = `
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Username</label>
        <input type="text" name="username" value="${admin.username || ''}" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Role</label>
        <select name="role" required class="form-control">
          <option value="Deputy Admin" ${admin.role === 'Deputy Admin' ? 'selected' : ''}>Deputy Admin</option>
          <option value="Assistant Admin" ${admin.role === 'Assistant Admin' ? 'selected' : ''}>Assistant Admin</option>
        </select>
      </div>
    `;
    showModal('Edit Admin', formHtml, async (e) => {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(e.target).entries());
      const result = await putData(`/api/admin/users/${currentEntityId}`, formData);
      if (result.success) {
        alert('Admin updated successfully.');
      } else {
        alert(result.error || 'Failed to update admin.');
      }
    });
  }

  // Edit Resource
  if (editBtn && editBtn.dataset.type === 'resource') {
    const id = editBtn.dataset.id;
    currentAction = 'edit-resource';
    currentEntityType = 'resource';
    currentEntityId = id;

    const data = await fetchData(`/api/admin/resources/${id}`);
    if (!data.success) {
      alert(data.error || 'Failed to fetch data for editing resource.');
      return;
    }
    const resource = data.resource;
    const coursesData = await fetchData('/api/admin/courses');
    const coursesHtml = coursesData.success
      ? coursesData.courses.map(course => `<option value="${course.id}" ${resource.course_id === course.id ? 'selected' : ''}>${course.name}</option>`).join('')
      : '<option value="" disabled>No courses available</option>';
    const formHtml = `
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Title</label>
        <input type="text" name="title" value="${resource.title || ''}" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Course</label>
        <select name="course_id" required class="form-control">
          ${coursesHtml}
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Current File</label>
        <a href="${API_BASE_URL}${resource.file_path}" target="_blank" class="text-indigo-600 hover:text-indigo-900">${resource.file_path.split('/').pop()}</a>
      </div>
      <div class="mb-3">
        <label for="file" class="form-label text-gray-700 font-medium">New File (optional)</label>
        <input type="file" id="file" name="file" accept=".pdf,.doc,.docx,.zip,.rar,.jpg,.jpeg,.png" class="form-control">
      </div>
    `;
    showModal('Edit Resource', formHtml, async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      if (!formData.get('file') || formData.get('file').name === '') {
        formData.delete('file');
      }
      const result = await putData(`/api/admin/resources/${currentEntityId}`, formData);
      if (result.success) {
        alert('Resource updated successfully.');
      } else {
        alert(result.error || 'Failed to update resource.');
      }
    });
  }
});

  generateIdCardButton.addEventListener('click', async () => {
    const entityType = document.getElementById('id-card-entity-type').value;
    const entityId = document.getElementById('id-card-entity-id').value;
    if (!entityId) {
      alert('Please enter an ID.');
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/admin/id-card/${entityType}/${entityId}`, {
      method: 'GET',
      credentials: 'include'
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entityType}_ID_${entityId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      alert('ID card generated successfully.');
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to generate ID card.');
    }
  });

  generateCertificateButton.addEventListener('click', async () => {
    const studentId = document.getElementById('certificate-student-id').value;
    if (!studentId) {
      alert('Please enter a student ID.');
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/admin/certificate/${studentId}`, {
      method: 'GET',
      credentials: 'include'
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certificate_${studentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      alert('Certificate generated successfully.');
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to generate certificate.');
    }
  });

  // Initial check and data load
  const checkAuth = async () => {
    const authCheck = await fetchData('/api/admin/auth-check');
    if (authCheck.success) {
      dashboardContainer.classList.remove('hidden');
      if (authCheck.role === 'Admin') {
        adminManagementTab.classList.remove('hidden');
      }
      await renderDashboardOverview();
      await refreshData();
    } else {
      window.location.href = '/admin/login';
    }
  };

  await checkAuth();
});