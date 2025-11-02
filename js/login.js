// Simple Login functionality - Number + Password only

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Check if already logged in
    const currentUser = getCurrentUser();
    if (currentUser) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Setup form submission
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
});

// Get current user from session storage
function getCurrentUser() {
    const userStr = sessionStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const password = document.getElementById('password').value;
    
    if (!phoneNumber) {
        showError('Please enter your number');
        return;
    }
    
    if (!password) {
        showError('Please enter your password');
        return;
    }
    
    const button = document.getElementById('loginButton');
    button.disabled = true;
    button.textContent = '⏳ Logging in...';
    
    try {
        // Find user by number (stored in 'number' column)
        const { data: users, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('number', phoneNumber);
        
        if (error) throw error;
        
        if (!users || users.length === 0) {
            showError('Number not found. Please contact admin.');
            return;
        }
        
        const user = users[0];
        
        // Check if password is set
        if (!user.password) {
            showError('Password not set for this account. Please contact admin.');
            return;
        }
        
        // Verify password
        if (user.password !== password) {
            showError('Incorrect password');
            return;
        }
        
        // Store user session
        sessionStorage.setItem('user', JSON.stringify({
            id: user.id,
            name: user.number, // This is the number (from 'number' column)
            username: user.username, // Display name
            access_level: user.access_level
        }));
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed: ' + error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Login';
    }
}

// Toggle password visibility
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = event.target;
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.textContent = '🙈';
    } else {
        passwordInput.type = 'password';
        toggleBtn.textContent = '🫣';
    }
}

// Guest login function
function guestLogin() {
    // Create a guest session with viewer access
    sessionStorage.setItem('user', JSON.stringify({
        id: 'guest',
        name: 'Guest',
        username: 'Guest',
        access_level: 'Viewer'
    }));
    
    // Redirect to dashboard
    window.location.href = 'dashboard.html';
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}
