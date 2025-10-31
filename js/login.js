// ============================================
// LOGIN PAGE LOGIC
// ============================================

const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const errorMessage = document.getElementById('errorMessage');

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => {
        errorMessage.classList.remove('show');
    }, 5000);
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    // Disable button
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';

    try {
        // Query users table
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();

        if (error || !data) {
            showError('Invalid username or password');
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
            return;
        }

        // Store user session
        setCurrentUser(data);
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed. Please try again.');
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
    }
});

// Check if already logged in
window.addEventListener('DOMContentLoaded', () => {
    if (isAuthenticated()) {
        window.location.href = 'dashboard.html';
    }
});

