document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('login-error-message');
  const changeCredentialsForm = document.getElementById('changeCredentialsForm');
  const changeCredentialsModal = new bootstrap.Modal(document.getElementById('changeCredentialsModal'));

  // Dynamically detect API base URL
  const API_BASE_URL = window.location.hostname.includes("localhost")
    ? "http://localhost:3000"
    : window.location.origin; // ✅ use same origin in production

  // Helper to send JSON POST requests with credentials
  const postData = async (url, data) => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include' // ✅ ensures session cookie is sent/stored
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Login submit handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    errorMessage.style.display = 'none';

    const result = await postData('/api/admin/login', { username, password });

    if (result.success) {
      if (result.isFirstLogin) {
        // force user to change credentials
        changeCredentialsModal.show();
      } else {
        // ✅ stay within same origin
        window.location.href = `${API_BASE_URL}/admin/dashboard`;
      }
    } else {
      errorMessage.textContent = result.error || 'Login failed. Please try again.';
      errorMessage.style.display = 'block';
    }
  });

  // Change credentials submit handler
  changeCredentialsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('newUsername').value.trim();
    const newPassword = document.getElementById('newPassword').value;

    const result = await postData('/api/admin/change-credentials', { newUsername, newPassword });

    if (result.success) {
      alert('Credentials updated successfully. Please log in with your new credentials.');
      changeCredentialsModal.hide();
      window.location.reload();
    } else {
      alert(result.error || 'Failed to update credentials.');
    }
  });
});
