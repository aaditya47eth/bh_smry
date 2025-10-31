// ============================================
// SUPABASE CONFIGURATION
// Shared across all pages
// ============================================

const SUPABASE_URL = 'https://tqbeaihrdtkcroiezame.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmVhaWhyZHRrY3JvaWV6YW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDk3ODMsImV4cCI6MjA3NzMyNTc4M30.TCpWEAhq08ivt3NbT7Lvw135qcCshkJH1X58y-T2rmw';

// Initialize Supabase client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper function to get current user from session
function getCurrentUser() {
    const userStr = sessionStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// Helper function to set current user in session
function setCurrentUser(user) {
    sessionStorage.setItem('user', JSON.stringify(user));
}

// Helper function to clear session (logout)
function clearSession() {
    sessionStorage.removeItem('user');
}

// Helper function to check if user is authenticated
function isAuthenticated() {
    return getCurrentUser() !== null;
}

// Helper function to check user permission
function hasPermission(permission) {
    const user = getCurrentUser();
    if (!user) return false;
    
    switch (permission) {
        case 'view':
            return ['admin', 'manager', 'viewer'].includes(user.access_level);
        case 'add':
            return ['admin', 'manager'].includes(user.access_level);
        case 'edit':
            return ['admin', 'manager'].includes(user.access_level);
        case 'delete':
            return ['admin', 'manager'].includes(user.access_level);
        case 'manage_users':
            return ['admin', 'manager'].includes(user.access_level);
        default:
            return false;
    }
}

