// ============================================
// ADMIN PANEL PAGE SCRIPT
// ============================================

// Check authentication and permissions on page load
document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        redirectToLogin();
        return;
    }

    // Only admin can access this page
    if (currentUser.access_level !== 'admin') {
        alert('Access Denied: Admin privileges required');
        window.location.href = 'dashboard.html';
        return;
    }

    // Display current user info
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('currentUserRole').textContent = currentUser.access_level;
    document.getElementById('userName').textContent = currentUser.username;

    // Load all users
    loadUsers();
});

// Load all users from Supabase
async function loadUsers() {
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*');

        if (error) throw error;

        // Sort users: First by access_level (admin > manager > viewer), then alphabetically by username
        const accessLevelOrder = { 'admin': 1, 'manager': 2, 'viewer': 3 };
        const sortedData = data.sort((a, b) => {
            // First priority: access level
            const levelDiff = (accessLevelOrder[a.access_level] || 999) - (accessLevelOrder[b.access_level] || 999);
            if (levelDiff !== 0) return levelDiff;
            
            // Second priority: username alphabetically
            return a.username.localeCompare(b.username);
        });

        displayUsers(sortedData);
    } catch (error) {
        console.error('Error loading users:', error);
        alert('Failed to load users: ' + error.message);
    }
}

// Display users in table
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #666;">No users found</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        
        const formattedDate = new Date(user.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        // Check if password is empty
        const passwordWarning = (!user.password || user.password === '') 
            ? '<span class="password-warning">⚠️ Password Not Set</span>' 
            : '';

        tr.innerHTML = `
            <td>
                <a href="person_view.html?username=${user.username}" class="username-link" title="View ${user.username}'s items">
                    ${user.username}
                </a>
                ${passwordWarning}
            </td>
            <td>${user.name}</td>
            <td><span class="access-badge ${user.access_level}">${user.access_level}</span></td>
            <td>${formattedDate}</td>
            <td>
                <button class="action-btn edit" onclick="editUser('${user.id}')">✏️ Edit</button>
                <button class="action-btn delete" onclick="deleteUser('${user.id}', '${user.username}')">🗑️ Delete</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

// Open add user modal
function openAddUserModal() {
    document.getElementById('addUserModal').style.display = 'block';
    document.getElementById('addUserForm').reset();
}

// Close add user modal
function closeAddUserModal() {
    document.getElementById('addUserModal').style.display = 'none';
}

// Handle form submissions
document.addEventListener('DOMContentLoaded', () => {
    const addForm = document.getElementById('addUserForm');
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addNewUser();
        });
    }

    const editForm = document.getElementById('editUserForm');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await updateUser();
        });
    }
});

// Add new user to Supabase
async function addNewUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const name = document.getElementById('newName').value.trim();
    const accessLevel = document.getElementById('newAccessLevel').value;

    if (!username || !password || !name || !accessLevel) {
        alert('Please fill in all fields');
        return;
    }

    try {
        // Check if username already exists
        const { data: existingUsers, error: checkError } = await supabaseClient
            .from('users')
            .select('id')
            .eq('username', username);

        if (existingUsers && existingUsers.length > 0) {
            alert('Username already exists');
            return;
        }

        // Insert new user
        const { data, error } = await supabaseClient
            .from('users')
            .insert([{
                username: username,
                password: password, // In production, this should be hashed!
                name: name,
                access_level: accessLevel
            }])
            .select();

        if (error) throw error;

        alert('✅ User added successfully!');
        closeAddUserModal();
        loadUsers(); // Reload the users table
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Failed to add user: ' + error.message);
    }
}

// Store original user data for comparison
let originalUserData = null;

// Open edit user modal and load user data
async function editUser(userId) {
    try {
        // Fetch user data
        const { data: user, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;

        // Store original data
        originalUserData = user;

        // Populate the edit form
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editPassword').value = ''; // Keep blank
        document.getElementById('editName').value = user.name;
        document.getElementById('editAccessLevel').value = user.access_level;

        // Open the modal
        document.getElementById('editUserModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading user:', error);
        alert('Failed to load user data: ' + error.message);
    }
}

// Close edit user modal
function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
}

// Update user in Supabase
async function updateUser() {
    const userId = document.getElementById('editUserId').value;
    const username = document.getElementById('editUsername').value.trim();
    const password = document.getElementById('editPassword').value.trim();
    const name = document.getElementById('editName').value.trim();
    const accessLevel = document.getElementById('editAccessLevel').value;

    if (!username || !name || !accessLevel) {
        alert('Please fill in all required fields');
        return;
    }

    try {
        const usernameChanged = originalUserData && username !== originalUserData.username;
        
        // Only check for duplicate username if it's actually being changed
        if (usernameChanged) {
            const { data: existingUsers, error: checkError } = await supabaseClient
                .from('users')
                .select('id, username')
                .eq('username', username);

            if (existingUsers && existingUsers.length > 0) {
                alert('Username already exists');
                return;
            }
        }

        // Prepare update data
        const updateData = {
            username: username,
            name: name,
            access_level: accessLevel
        };

        // Only update password if a new one is provided
        if (password) {
            updateData.password = password; // In production, this should be hashed!
        }

        // Update user
        const { error } = await supabaseClient
            .from('users')
            .update(updateData)
            .eq('id', userId);

        if (error) throw error;

        // If username was changed, cascade the change to items and user_lot_status tables
        if (usernameChanged) {
            const oldUsername = originalUserData.username;
            
            // Update items table
            const { error: itemsError } = await supabaseClient
                .from('items')
                .update({ username: username })
                .eq('username', oldUsername);
            
            if (itemsError) {
                console.error('Error updating items:', itemsError);
                alert('Warning: Items may not have been updated. Please check manually.');
            }
            
            // Update user_lot_status table
            const { error: statusError } = await supabaseClient
                .from('user_lot_status')
                .update({ username: username })
                .eq('username', oldUsername);
            
            if (statusError) {
                console.error('Error updating user lot status:', statusError);
                alert('Warning: User lot status may not have been updated. Please check manually.');
            }
        }

        closeEditUserModal();
        loadUsers(); // Reload the users table
    } catch (error) {
        console.error('Error updating user:', error);
        alert('Failed to update user: ' + error.message);
    }
}

// Delete user
async function deleteUser(userId, username) {
    const currentUser = getCurrentUser();
    
    // Prevent deleting yourself
    if (currentUser.id === userId) {
        alert('You cannot delete your own account!');
        return;
    }

    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) throw error;

        alert('✅ User deleted successfully!');
        loadUsers(); // Reload the users table
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user: ' + error.message);
    }
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        clearSession();
        window.location.href = 'index.html';
    }
}

// Toggle password visibility
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = event.target;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
}

// Close modals when clicking outside
window.onclick = function(event) {
    const addModal = document.getElementById('addUserModal');
    const editModal = document.getElementById('editUserModal');
    
    if (event.target === addModal) {
        closeAddUserModal();
    }
    if (event.target === editModal) {
        closeEditUserModal();
    }
};

