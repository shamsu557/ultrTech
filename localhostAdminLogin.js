 document.addEventListener('DOMContentLoaded', () => {
      const loginForm = document.getElementById('login-form');
      const errorMessage = document.getElementById('login-error-message');
      const changeCredentialsForm = document.getElementById('changeCredentialsForm');
      const changeCredentialsModal = new bootstrap.Modal(document.getElementById('changeCredentialsModal'));
      const API_BASE_URL = 'http://localhost:3000';

      // Helper to POST JSON
      const postData = async (url, data) => {
        try {
          const response = await fetch(`${API_BASE_URL}${url}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
          });
          return await response.json();
        } catch (err) {
          return { success: false, error: err.message };
        }
      };

      // Login submit
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        errorMessage.style.display = 'none';

        const result = await postData('/api/admin/login', { username, password });

        if (result.success) {
          if (result.isFirstLogin) {
            changeCredentialsModal.show();
          } else {
            window.location.href = '/admin/dashboard';
          }
        } else {
          errorMessage.textContent = result.error || 'Login failed. Please try again.';
          errorMessage.style.display = 'block';
        }
      });

      // Change credentials submit
      changeCredentialsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newUsername = document.getElementById('newUsername').value;
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