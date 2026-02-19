// ============================================
// ADMIN PANEL PAGE SCRIPT
// ============================================

let allUsersData = []; // Store all users for search functionality
let adminReviewPastedImage = null; // Store pasted/selected image for admin review upload
let allReviewsData = []; // Store all reviews for sorting

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
    
    const userNameElement = document.getElementById('userName');
    userNameElement.textContent = currentUser.username;
    
    // Guest mode removed: username is always clickable.
    userNameElement.style.cursor = 'pointer';
    userNameElement.onclick = () => {
        window.location.href = 'person_view.html';
    };
    
    // Show admin panel button in header (already on admin panel, but keep for consistency)
    if (currentUser.access_level.toLowerCase() === 'admin') {
        document.getElementById('adminPanelHeaderBtn').style.display = 'inline-block';
    }
    
    // Check if a specific section should be opened from URL parameter or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const sectionParam = urlParams.get('section');
    const savedSection = localStorage.getItem('adminPanelSelectedSection');
    
    if (sectionParam) {
        switchSection(sectionParam);
    } else if (savedSection) {
        switchSection(savedSection);
    }

    // Load all users
    loadUsers();
    
    // Load stats
    loadStats();
});

// Switch between sections (Users, Stats)
function switchSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Save to localStorage
    localStorage.setItem('adminPanelSelectedSection', sectionName);
    
    // Show selected section
    if (sectionName === 'users') {
        document.getElementById('usersSection').classList.add('active');
        document.querySelector('.menu-item[onclick*="users"]').classList.add('active');
    } else if (sectionName === 'stats') {
        document.getElementById('statsSection').classList.add('active');
        document.querySelector('.menu-item[onclick*="stats"]').classList.add('active');
        loadStats(); // Reload stats when switching to this section
    } else if (sectionName === 'checklist') {
        document.getElementById('checklistSection').classList.add('active');
        document.querySelector('.menu-item[onclick*="checklist"]').classList.add('active');
        loadChecklistData(); // Load checklist data when switching to this section
    } else if (sectionName === 'reviews') {
        document.getElementById('reviewsSection').classList.add('active');
        document.querySelector('.menu-item[onclick*="reviews"]').classList.add('active');
        loadReviewsForApproval(); // Load reviews for approval
    } else if (sectionName === 'payments') {
        document.getElementById('paymentsSection').classList.add('active');
        document.querySelector('.menu-item[onclick*="payments"]').classList.add('active');
        loadPayments(); // Load payment history
    } else if (sectionName === 'bidding') {
        document.getElementById('biddingSection').classList.add('active');
        document.querySelector('.menu-item[onclick*="bidding"]').classList.add('active');
        initBiddingSection(); // Initialize bidding section
    }
}

// Switch between tabs (Lot-wise, Person-wise)
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    if (tabName === 'lot') {
        document.getElementById('lotTab').classList.add('active');
        document.querySelector('.tab-btn[onclick*="lot"]').classList.add('active');
    } else if (tabName === 'person') {
        document.getElementById('personTab').classList.add('active');
        document.querySelector('.tab-btn[onclick*="person"]').classList.add('active');
    }
}

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

        allUsersData = sortedData; // Store for search functionality
        displayUsers(sortedData);
    } catch (error) {
        console.error('Error loading users:', error);
        alert('Failed to load users: ' + error.message);
    }
}

// Search users by username or number
function searchUsers() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        // If search is empty, show all users
        displayUsers(allUsersData);
        return;
    }
    
    // Filter users by username or number
    const filteredUsers = allUsersData.filter(user => {
        const username = (user.username || '').toLowerCase();
        const number = (user.number || '').toLowerCase();
        return username.includes(searchTerm) || number.includes(searchTerm);
    });
    
    displayUsers(filteredUsers);
}

// Display users in table
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #666;">No users found</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        
        // Check if password is empty
        const passwordWarning = (!user.password || user.password === '') 
            ? '<span class="password-warning">! Password Not Set</span>' 
            : '';

        tr.innerHTML = `
            <td>
                <a href="person_view.html?username=${user.username}" class="username-link" title="View ${user.username}'s items">
                    ${user.username}
                </a>
                ${passwordWarning}
            </td>
            <td>${user.number || 'N/A'}</td>
            <td><span class="access-badge ${user.access_level}">${user.access_level}</span></td>
            <td>
                <button class="action-btn edit" onclick="editUser('${user.id}')">Edit</button>
                <button class="action-btn delete" onclick="deleteUser('${user.id}', '${user.username}')">Delete</button>
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
    const password = document.getElementById('newPassword').value; // Can be empty
    const name = document.getElementById('newName').value.trim();
    const accessLevel = document.getElementById('newAccessLevel').value;

    if (!username || !name || !accessLevel) {
        alert('Please fill in required fields (Collector Name, Number, and Access Level)');
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

        // Insert new user (password can be empty)
        const { data, error } = await supabaseClient
            .from('users')
            .insert([{
                username: username,
                password: password || '', // Use empty string if password not provided
                number: name,
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
        document.getElementById('editName').value = user.number || '';
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

    if (!username || !accessLevel) {
        alert('Please fill in username and access level');
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
            access_level: accessLevel
        };
        
        // Add number field only if provided
        if (name) {
            updateData.number = name;
        }

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

// ============================================
// CHECKLIST FUNCTIONALITY
// ============================================

// Load checklist data - WITH LOT NAMES AND COMPLETION STATUS
async function loadChecklistData() {
    try {
        // Get lots table for lot names
        const { data: lots, error: lotsError } = await supabaseClient
            .from('lots')
            .select('id, lot_name');

        if (lotsError) throw lotsError;

        // Create a map of lot_id -> lot_name
        const lotNameMap = {};
        lots.forEach(lot => {
            lotNameMap[lot.id] = lot.lot_name;
        });

        // Get ALL items - fetch in batches to bypass 1000 row limit
        let allItems = [];
        let start = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: batch, error: itemsError } = await supabaseClient
                .from('items')
                .select('id, lot_id, checklist_status, checked')
                .range(start, start + batchSize - 1);

            if (itemsError) throw itemsError;

            if (batch && batch.length > 0) {
                allItems = allItems.concat(batch);
                start += batchSize;
                
                // If we got fewer items than batch size, we've reached the end
                if (batch.length < batchSize) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        const items = allItems;

        const container = document.getElementById('checklistTableBody');
        container.innerHTML = '';

        if (!items || items.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">No items available</div>';
            return;
        }

        // Group items by lot_id
        const lotGroups = {};
        let itemsWithoutLotId = 0;
        
        items.forEach(item => {
            if (!item.lot_id) {
                itemsWithoutLotId++;
                return; // Skip items without lot_id
            }
            
            if (!lotGroups[item.lot_id]) {
                lotGroups[item.lot_id] = [];
            }
            lotGroups[item.lot_id].push(item);
        });


        // Convert to array and create lot data
        const allLots = Object.entries(lotGroups).map(([lotId, lotItems]) => {
            // Get lot name from lots table, fallback to generated name
            const lotName = lotNameMap[lotId] || `Lot ${lotId}`;
            
            // Calculate completion
            const totalItems = lotItems.length;
            const completedItems = lotItems.filter(item => {
                const status = item.checklist_status || (item.checked ? 'checked' : 'unchecked');
                return status === 'checked' || status === 'rejected';
            }).length;
            const pendingItems = totalItems - completedItems;
            
            return {
                lotId: parseInt(lotId),
                lotName: lotName,
                totalItems: totalItems,
                completedItems: completedItems,
                pendingItems: pendingItems,
                percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
            };
        });

        // Sort by lot number
        allLots.sort((a, b) => a.lotId - b.lotId);

        // Categorize lots
        const completed = allLots.filter(l => l.completedItems === l.totalItems && l.totalItems > 0);
        const partial = allLots.filter(l => l.completedItems > 0 && l.completedItems < l.totalItems);
        const incomplete = allLots.filter(l => l.completedItems === 0);

        // Store data for sorting
        window.checklistData = {
            partial: partial,
            incomplete: incomplete,
            completed: completed
        };
        window.checklistSortState = {
            partial: { column: 'lot_name', direction: 'asc' },
            incomplete: { column: 'lot_name', direction: 'asc' },
            completed: { column: 'lot_name', direction: 'asc' }
        };

        // Render table with sections
        container.innerHTML = '';
        
        if (partial.length > 0) {
            renderChecklistSection(container, 'Partial', partial, 'partial', true);
        }
        if (incomplete.length > 0) {
            renderChecklistSection(container, 'Incomplete', incomplete, 'incomplete', true);
        }
        if (completed.length > 0) {
            renderChecklistSection(container, 'Completed', completed, 'completed', false);
        }
        
        // Update sort indicators
        updateChecklistSortIndicators('partial', 'lot_name', 'asc');
        updateChecklistSortIndicators('incomplete', 'lot_name', 'asc');
        updateChecklistSortIndicators('completed', 'lot_name', 'asc');

    } catch (error) {
        console.error('Error loading checklist:', error);
        alert('Failed to load checklist data: ' + error.message);
    }
}

// Render checklist section for new data structure
function renderChecklistSection(container, title, lots, sectionId, isOpen) {
    if (lots.length === 0) return; // Don't render empty sections

    const section = document.createElement('div');
    section.className = 'checklist-section';
    
    const header = document.createElement('div');
    header.className = 'checklist-section-header';
    header.onclick = () => toggleChecklistSection(sectionId);
    header.innerHTML = `
        <div class="section-title">
            <span class="section-icon" id="icon-${sectionId}">${isOpen ? '▼' : '▶'}</span>
            <strong>${title}</strong>
            <span class="section-count">(${lots.length})</span>
        </div>
    `;
    
    const content = document.createElement('div');
    content.id = `section-${sectionId}`;
    content.className = `checklist-section-content ${isOpen ? 'open' : ''}`;
    
    const table = document.createElement('table');
    table.className = 'users-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th class="sortable" onclick="sortChecklistSection('${sectionId}', 'lot_name')">
                    Lot Name <span class="sort-indicator" id="sort-${sectionId}-lot_name">↕</span>
                </th>
                <th class="sortable" onclick="sortChecklistSection('${sectionId}', 'totalItems')">
                    Total Items <span class="sort-indicator" id="sort-${sectionId}-totalItems">↕</span>
                </th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody id="tbody-${sectionId}"></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    
    lots.forEach(lotData => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.onclick = () => openChecklistView(lotData.lotId, lotData.lotName);
        tr.innerHTML = `
            <td><strong>${lotData.lotName}</strong></td>
            <td>${lotData.totalItems}</td>
            <td>
                <span class="checklist-badge ${lotData.percentage === 100 ? 'checked' : 'unchecked'}">
                    ${lotData.percentage === 100 ? 'Complete' : 'Pending'} (${lotData.completedItems}/${lotData.totalItems})
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    content.appendChild(table);
    section.appendChild(header);
    section.appendChild(content);
    container.appendChild(section);
}

function toggleChecklistSection(sectionId) {
    const content = document.getElementById(`section-${sectionId}`);
    const icon = document.getElementById(`icon-${sectionId}`);
    
    if (content.classList.contains('open')) {
        content.classList.remove('open');
        icon.textContent = '▶';
    } else {
        content.classList.add('open');
        icon.textContent = '▼';
    }
}

function sortChecklistSection(sectionId, column) {
    if (!window.checklistData || !window.checklistData[sectionId]) return;
    
    const currentState = window.checklistSortState[sectionId];
    let direction = 'asc';
    
    // Toggle direction if clicking the same column
    if (currentState.column === column) {
        direction = currentState.direction === 'asc' ? 'desc' : 'asc';
    }
    
    // Update sort state
    window.checklistSortState[sectionId] = { column, direction };
    
    // Sort the data
    const lots = window.checklistData[sectionId];
    lots.sort((a, b) => {
        let aVal, bVal;
        
        if (column === 'lot_name') {
            // Extract numbers from lot names for proper numeric sorting
            const extractNumber = (str) => {
                const match = str.match(/\d+/);
                return match ? parseInt(match[0]) : 0;
            };
            
            const numA = extractNumber(a.lotName);
            const numB = extractNumber(b.lotName);
            
            // If both have numbers, sort by number
            if (numA && numB) {
                return direction === 'asc' ? numA - numB : numB - numA;
            }
            
            // Otherwise, use string comparison
            aVal = a.lotName.toLowerCase();
            bVal = b.lotName.toLowerCase();
            const result = aVal.localeCompare(bVal);
            return direction === 'asc' ? result : -result;
        } else if (column === 'totalItems') {
            aVal = a.totalItems;
            bVal = b.totalItems;
            return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        return 0;
    });
    
    // Re-render the table body for this section
    const tbody = document.getElementById(`tbody-${sectionId}`);
    if (!tbody) return;
    
    tbody.innerHTML = '';
    lots.forEach(lotData => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.onclick = () => openChecklistView(lotData.lotId, lotData.lotName);
        tr.innerHTML = `
            <td><strong>${lotData.lotName}</strong></td>
            <td>${lotData.totalItems}</td>
            <td>
                <span class="checklist-badge ${lotData.percentage === 100 ? 'checked' : 'unchecked'}">
                    ${lotData.percentage === 100 ? 'Complete' : 'Pending'} (${lotData.completedItems}/${lotData.totalItems})
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Update sort indicators
    updateChecklistSortIndicators(sectionId, column, direction);
}

function updateChecklistSortIndicators(sectionId, activeColumn, direction) {
    // Reset all indicators for this section
    ['lot_name', 'totalItems'].forEach(col => {
        const indicator = document.getElementById(`sort-${sectionId}-${col}`);
        if (indicator) {
            const header = indicator.closest('th');
            if (col === activeColumn) {
                indicator.textContent = direction === 'asc' ? '↑' : '↓';
                if (header) header.classList.add('sort-active');
            } else {
                indicator.textContent = '↕';
                if (header) header.classList.remove('sort-active');
            }
        }
    });
}

function openChecklistView(lotId, lotName) {
    window.location.href = `checklist_view.html?lot_id=${lotId}&lot_name=${encodeURIComponent(lotName)}`;
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
    const toggleSpan = document.getElementById(inputId + 'Toggle');
    
    if (input.type === 'password') {
        input.type = 'text';
        toggleSpan.textContent = 'Hide';
    } else {
        input.type = 'password';
        toggleSpan.textContent = 'Show';
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

// ============================================
// STATS FUNCTIONALITY
// ============================================

// Load all stats data
async function loadStats() {
    await Promise.all([
        loadLotStats(),
        loadPersonStats()
    ]);
}

// Load lot-wise statistics
async function loadLotStats() {
    try {
        // Get all items with lot information
        const { data: items, error: itemsError } = await supabaseClient
            .from('items')
            .select('*, lots(id, lot_name)');

        if (itemsError) throw itemsError;

        // Filter out cancelled items
        const activeItems = items ? items.filter(item => !item.cancelled) : [];

        // Get all user lot statuses
        const { data: lotStatuses, error: lotError } = await supabaseClient
            .from('user_lot_status')
            .select('*');

        if (lotError) throw lotError;

        // Create a map for user lot statuses
        const statusMap = {};
        (lotStatuses || []).forEach(status => {
            const key = `${status.lot_id}_${status.username}`;
            statusMap[key] = status;
        });


        // Group items by lot and track user amounts
        const lotData = {};
        const uniqueParticipants = new Set();

        activeItems.forEach(item => {
            const lotName = item.lots?.lot_name || 'Unknown';
            const lotId = item.lots?.id || 'unknown';
            const username = item.username;
            
            if (!lotData[lotName]) {
                lotData[lotName] = {
                    name: lotName,
                    lotId: lotId,
                    participants: new Set(),
                    totalItems: 0,
                    deliveredUsers: new Set(),
                    totalPrice: 0,
                    paidUsers: new Set(),
                    userAmounts: {} // Track each user's total in this lot
                };
            }

            lotData[lotName].participants.add(username);
            lotData[lotName].totalItems++;
            uniqueParticipants.add(username);
            
            const price = parseFloat(item.price) || 0;
            lotData[lotName].totalPrice += price;

            // Track amount per user
            if (!lotData[lotName].userAmounts[username]) {
                lotData[lotName].userAmounts[username] = 0;
            }
            lotData[lotName].userAmounts[username] += price;

            // Check delivery and payment status for this user-lot combination
            const statusKey = `${lotId}_${username}`;
            const userStatus = statusMap[statusKey];
            
            if (userStatus) {
                if (userStatus.delivery_status === 'Delivered') {
                    lotData[lotName].deliveredUsers.add(username);
                }
                if (userStatus.payment_status === 'Paid') {
                    lotData[lotName].paidUsers.add(username);
                }
            }
        });

        // Calculate totals based on actual user amounts
        let totalRevenue = 0;
        let totalPending = 0;

        Object.values(lotData).forEach(lot => {
            let revenue = 0;
            
            // Sum up amounts only for users marked as "Paid"
            lot.paidUsers.forEach(username => {
                revenue += lot.userAmounts[username] || 0;
            });
            
            const pending = lot.totalPrice - revenue;
            
            lot.revenue = revenue;
            lot.pending = pending;
            
            totalRevenue += revenue;
            totalPending += pending;
        });

        // Update summary cards
        document.getElementById('totalLots').textContent = Object.keys(lotData).length;
        document.getElementById('totalParticipants').textContent = uniqueParticipants.size;
        document.getElementById('totalRevenue').textContent = `₹${totalRevenue.toFixed(2)}`;
        document.getElementById('pendingAmount').textContent = `₹${totalPending.toFixed(2)}`;

        // Store lot stats data for sorting
        lotStatsData = Object.values(lotData).map(lot => ({
            name: lot.name,
            lotId: lot.lotId,
            participants: lot.participants.size,
            items: lot.totalItems,
            delivered: lot.deliveredUsers.size,
            deliveredTotal: lot.participants.size,
            paid: lot.paidUsers.size,
            paidTotal: lot.participants.size,
            revenue: lot.revenue,
            pending: lot.pending
        }));

        // Initialize sort and display
        currentLotSortColumn = 'name';
        currentLotSortDirection = 'asc';
        sortLotTable('name');

    } catch (error) {
        console.error('Error loading lot stats:', error);
        alert('Failed to load lot statistics: ' + error.message);
    }
}

// Display lot stats data
function displayLotStats(lots) {
    const tbody = document.getElementById('lotStatsTableBody');
    tbody.innerHTML = '';

    if (!lots || lots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">No lot data available</td></tr>';
        return;
    }

    lots.forEach(lot => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td><strong>${lot.name}</strong></td>
            <td>${lot.participants}</td>
            <td>${lot.items}</td>
            <td>${lot.delivered} / ${lot.deliveredTotal} users</td>
            <td>${lot.paid} / ${lot.paidTotal} users</td>
            <td>₹${lot.revenue.toFixed(2)}</td>
            <td>₹${lot.pending.toFixed(2)}</td>
        `;
        
        // Make entire row clickable
        tr.onclick = () => {
            window.location.href = `lot_view.html?lot_id=${lot.lotId}&lot_name=${encodeURIComponent(lot.name)}`;
        };
        
        tbody.appendChild(tr);
    });
}

// Sort lot stats table
function sortLotTable(column) {
    // Toggle sort direction if clicking the same column
    if (currentLotSortColumn === column) {
        currentLotSortDirection = currentLotSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentLotSortColumn = column;
        currentLotSortDirection = column === 'name' ? 'asc' : 'desc'; // Default desc for numbers, asc for name
    }
    
    let sortedData = [...lotStatsData];
    
    switch (column) {
        case 'name':
            sortedData.sort((a, b) => {
                // Natural sort: extract numbers from lot names for proper numeric sorting
                const extractNumber = (str) => {
                    const match = str.match(/\d+/);
                    return match ? parseInt(match[0]) : 0;
                };
                
                const numA = extractNumber(a.name);
                const numB = extractNumber(b.name);
                
                // If both have numbers, sort by number
                if (numA && numB) {
                    const comparison = numA - numB;
                    return currentLotSortDirection === 'asc' ? comparison : -comparison;
                }
                
                // Otherwise, use string comparison
                const comparison = a.name.localeCompare(b.name);
                return currentLotSortDirection === 'asc' ? comparison : -comparison;
            });
            break;
        case 'participants':
            sortedData.sort((a, b) => {
                return currentLotSortDirection === 'asc' ? a.participants - b.participants : b.participants - a.participants;
            });
            break;
        case 'items':
            sortedData.sort((a, b) => {
                return currentLotSortDirection === 'asc' ? a.items - b.items : b.items - a.items;
            });
            break;
        case 'delivered':
            sortedData.sort((a, b) => {
                return currentLotSortDirection === 'asc' ? a.delivered - b.delivered : b.delivered - a.delivered;
            });
            break;
        case 'paid':
            sortedData.sort((a, b) => {
                return currentLotSortDirection === 'asc' ? a.paid - b.paid : b.paid - a.paid;
            });
            break;
        case 'revenue':
            sortedData.sort((a, b) => {
                return currentLotSortDirection === 'asc' ? a.revenue - b.revenue : b.revenue - a.revenue;
            });
            break;
        case 'pending':
            sortedData.sort((a, b) => {
                return currentLotSortDirection === 'asc' ? a.pending - b.pending : b.pending - a.pending;
            });
            break;
    }
    
    updateLotSortIndicators(column, currentLotSortDirection);
    displayLotStats(sortedData);
}

// Update lot sort indicators
function updateLotSortIndicators(activeColumn, direction) {
    // Reset all indicators
    ['name', 'participants', 'items', 'delivered', 'paid', 'revenue', 'pending'].forEach(col => {
        const indicator = document.getElementById(`sort-lot-${col}`);
        const th = indicator?.parentElement;
        if (indicator) {
            if (col === activeColumn) {
                indicator.textContent = direction === 'asc' ? '↑' : '↓';
                indicator.style.opacity = '1';
                if (th) th.classList.add('active');
            } else {
                indicator.textContent = '↕';
                indicator.style.opacity = '0.5';
                if (th) th.classList.remove('active');
            }
        }
    });
}

// Load person-wise statistics
async function loadPersonStats() {
    try {
        // Get all items with lot information
        const { data: items, error: itemsError } = await supabaseClient
            .from('items')
            .select('*, lots(id, lot_name)');

        if (itemsError) throw itemsError;

        // Filter out cancelled items
        const activeItems = items ? items.filter(item => !item.cancelled) : [];

        // Get all user lot statuses
        const { data: lotStatuses, error: statusError } = await supabaseClient
            .from('user_lot_status')
            .select('*');

        if (statusError) throw statusError;

        // Create a map for user lot statuses
        const statusMap = {};
        (lotStatuses || []).forEach(status => {
            const key = `${status.lot_id}_${status.username}`;
            statusMap[key] = status;
        });

        // Group items by user and track amounts per lot
        const userData = {};
        let totalPaid = 0;
        let totalPending = 0;
        let totalFigs = 0;

        activeItems.forEach(item => {
            const username = item.username || 'Unknown';
            const lotName = item.lots?.lot_name || 'Unknown';
            const lotId = item.lots?.id;
            
            if (!userData[username]) {
                userData[username] = {
                    username: username,
                    lots: new Set(),
                    totalItems: 0,
                    totalPrice: 0,
                    lotAmounts: {} // Track amount per lot
                };
            }

            userData[username].lots.add(lotName);
            userData[username].totalItems++;
            
            const price = parseFloat(item.price) || 0;
            userData[username].totalPrice += price;

            // Track amount per lot
            const lotKey = `${lotId}`;
            if (!userData[username].lotAmounts[lotKey]) {
                userData[username].lotAmounts[lotKey] = {
                    amount: 0,
                    paid: false
                };
            }
            userData[username].lotAmounts[lotKey].amount += price;

            // Check if user has paid for this lot
            const statusKey = `${lotId}_${username}`;
            const userStatus = statusMap[statusKey];
            
            if (userStatus && userStatus.payment_status === 'Paid') {
                userData[username].lotAmounts[lotKey].paid = true;
            }
        });

        // Calculate paid and pending amounts based on actual lot amounts
        Object.values(userData).forEach(user => {
            let paid = 0;
            
            // Sum up amounts only for lots marked as "Paid"
            Object.values(user.lotAmounts).forEach(lot => {
                if (lot.paid) {
                    paid += lot.amount;
                }
            });
            
            user.paid = paid;
            user.pending = user.totalPrice - paid;
            
            totalPaid += user.paid;
            totalPending += user.pending;
        });

        // Figs collected is same as total items
        totalFigs = activeItems.length;

        // Update summary cards
        document.getElementById('totalUsers').textContent = Object.keys(userData).length;
        document.getElementById('totalPaid').textContent = `₹${totalPaid.toFixed(2)}`;
        document.getElementById('totalPending').textContent = `₹${totalPending.toFixed(2)}`;
        document.getElementById('totalFigs').textContent = totalFigs;

        // Store data for sorting
        personStatsData = Object.values(userData).map(user => ({
            ...user,
            figs: user.totalItems // Figs = Total Items
        }));

        // Sort alphabetically by username (ascending) by default
        personStatsData.sort((a, b) => a.username.localeCompare(b.username));

        // Reset sort to default
        currentSortColumn = 'username';
        currentSortDirection = 'asc';
        
        // Display with default sort
        updateSortIndicators('username', 'asc');
        displayPersonStats(personStatsData);

    } catch (error) {
        console.error('Error loading person stats:', error);
        alert('Failed to load person statistics: ' + error.message);
    }
}

// Display person stats table
function displayPersonStats(users) {
    const tbody = document.getElementById('personStatsTableBody');
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #666;">No user data available</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <a href="person_view.html?username=${user.username}" style="color: var(--text-primary); text-decoration: none; font-weight: 600;">
                    ${user.username}
                </a>
            </td>
            <td>${user.lots.size}</td>
            <td>₹${user.paid.toFixed(2)}</td>
            <td>₹${user.pending.toFixed(2)}</td>
            <td>${user.figs}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Sort person stats table
function sortPersonTable(column) {
    // If clicking the same column, toggle direction
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = column === 'username' ? 'asc' : 'desc'; // Default desc for numbers, asc for username
    }
    
    let sortedData = [...personStatsData];
    
    // Sort based on column
    switch(column) {
        case 'username':
            sortedData.sort((a, b) => {
                const comparison = a.username.localeCompare(b.username);
                return currentSortDirection === 'asc' ? comparison : -comparison;
            });
            break;
        case 'lots':
            sortedData.sort((a, b) => {
                const comparison = a.lots.size - b.lots.size;
                return currentSortDirection === 'asc' ? comparison : -comparison;
            });
            break;
        case 'paid':
            sortedData.sort((a, b) => {
                const comparison = a.paid - b.paid;
                return currentSortDirection === 'asc' ? comparison : -comparison;
            });
            break;
        case 'pending':
            sortedData.sort((a, b) => {
                const comparison = a.pending - b.pending;
                return currentSortDirection === 'asc' ? comparison : -comparison;
            });
            break;
        case 'figs':
            sortedData.sort((a, b) => {
                const comparison = a.figs - b.figs;
                return currentSortDirection === 'asc' ? comparison : -comparison;
            });
            break;
    }
    
    // Update sort indicators
    updateSortIndicators(column, currentSortDirection);
    
    displayPersonStats(sortedData);
}

// Update visual sort indicators for person stats
function updateSortIndicators(activeColumn, direction) {
    // Reset all person stat indicators
    ['username', 'lots', 'paid', 'pending', 'figs'].forEach(col => {
        const indicator = document.getElementById(`sort-${col}`);
        const th = indicator?.parentElement;
        if (indicator) {
            if (col === activeColumn) {
                indicator.textContent = direction === 'asc' ? '↑' : '↓';
                indicator.style.opacity = '1';
                if (th) th.classList.add('active');
            } else {
                indicator.textContent = '↕';
                indicator.style.opacity = '0.5';
                if (th) th.classList.remove('active');
            }
        }
    });
}


// ==============================================================
// REVIEW APPROVAL FUNCTIONS
// ==============================================================

async function loadReviewsForApproval() {
    const container = document.getElementById('reviewsTableBody');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Loading reviews...</div>';
    
    try {
        const { data: reviews, error } = await supabaseClient
            .from('user_reviews')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">No reviews found</div>';
            allReviewsData = [];
            return;
        }
        
        // Store reviews data for sorting
        allReviewsData = reviews;
        
        // Apply current sort
        sortReviews();
        
    } catch (error) {
        console.error('Error loading reviews:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Failed to load reviews</div>';
    }
}

// Sort reviews based on selected option
function sortReviews() {
    const sortValue = document.getElementById('reviewsSortSelect').value;
    const container = document.getElementById('reviewsTableBody');
    
    if (!allReviewsData || allReviewsData.length === 0) {
        return;
    }
    
    let sortedReviews = [...allReviewsData];
    
    switch(sortValue) {
        case 'date-desc':
            sortedReviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
        case 'date-asc':
            sortedReviews.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'username-asc':
            sortedReviews.sort((a, b) => a.username.localeCompare(b.username));
            break;
        case 'username-desc':
            sortedReviews.sort((a, b) => b.username.localeCompare(a.username));
            break;
    }
    
    // Render sorted reviews
    displayReviews(sortedReviews);
}

// Display reviews in the container
function displayReviews(reviews) {
    const container = document.getElementById('reviewsTableBody');
    container.innerHTML = '';
    
    reviews.forEach(review => {
        const card = document.createElement('div');
        card.className = 'review-approval-card';
        
        const date = new Date(review.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        const isVisible = review.status === 'visible';
        const toggleButton = isVisible 
            ? `<button class="btn-hide" onclick="toggleReviewVisibility('${review.id}', 'hidden')">Hide</button>`
            : `<button class="btn-show" onclick="toggleReviewVisibility('${review.id}', 'visible')">Show</button>`;
        
        card.innerHTML = `
            <img src="${review.image_url}" alt="${review.username}'s review" class="review-approval-image" onclick="openReviewImagePreview('${review.image_url}', '${review.username}')">
            <div class="review-approval-content">
                <div class="review-approval-user">
                    <a href="person_view.html?username=${encodeURIComponent(review.username)}" class="username-link">${review.username}</a>
                </div>
                <div class="review-approval-date">Submitted: ${date}</div>
                <div class="review-approval-actions">
                    ${toggleButton}
                    <button class="btn-delete" onclick="deleteReviewAsAdmin('${review.id}', '${review.image_url}')">Delete</button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

// Toggle review visibility (show/hide)
async function toggleReviewVisibility(reviewId, newStatus) {
    try {
        const { error } = await supabaseClient
            .from('user_reviews')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', reviewId);
        
        if (error) throw error;
        
        loadReviewsForApproval(); // Reload reviews
        
    } catch (error) {
        console.error('Error toggling review visibility:', error);
    }
}

// Delete review as admin
async function deleteReviewAsAdmin(reviewId, imageUrl) {
    if (!confirm('Are you sure you want to delete this review?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('user_reviews')
            .delete()
            .eq('id', reviewId);
        
        if (error) throw error;
        
        // Log image URL for manual cleanup
        console.log('Review deleted. Image URL (for manual Cloudinary cleanup):', imageUrl);
        
        loadReviewsForApproval();
        
    } catch (error) {
        console.error('Error deleting review:', error);
    }
}

function openReviewImagePreview(imageUrl, username) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.9); display: flex; flex-direction: column;
        align-items: center; justify-content: center; z-index: 10000; cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        max-width: 90%; max-height: 80%; object-fit: contain;
        border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    `;
    
    const usernameLabel = document.createElement('div');
    usernameLabel.textContent = `Review by ${username}`;
    usernameLabel.style.cssText = `color: white; font-size: 1.25rem; font-weight: 600; margin-top: 16px;`;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute; top: 20px; right: 20px; background: rgba(255, 255, 255, 0.9);
        color: #000; border: none; width: 40px; height: 40px; border-radius: 50%;
        font-size: 30px; cursor: pointer; display: flex; align-items: center;
        justify-content: center; transition: all 0.2s;
    `;
    
    closeBtn.onmouseover = () => { closeBtn.style.background = 'rgba(255, 255, 255, 1)'; closeBtn.style.transform = 'scale(1.1)'; };
    closeBtn.onmouseout = () => { closeBtn.style.background = 'rgba(255, 255, 255, 0.9)'; closeBtn.style.transform = 'scale(1)'; };
    
    const closeModal = () => document.body.removeChild(overlay);
    overlay.onclick = closeModal;
    closeBtn.onclick = closeModal;
    img.onclick = (e) => e.stopPropagation();
    
    overlay.appendChild(img);
    overlay.appendChild(usernameLabel);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

// ==============================================================
// ADMIN ADD REVIEW FUNCTIONS
// ==============================================================

// Cloudinary configuration for reviews
const REVIEWS_CLOUDINARY_CLOUD_NAME = 'dt5jgkfwb';
const REVIEWS_CLOUDINARY_UPLOAD_PRESET = 'review_strg';

// Open admin add review modal
async function openAdminAddReviewModal() {
    try {
        // Fetch all users to populate datalist
        const { data: users, error } = await supabaseClient
            .from('users')
            .select('username')
            .order('username', { ascending: true });
        
        if (error) throw error;
        
        // Populate username datalist for autocomplete
        const datalist = document.getElementById('collectorsList');
        datalist.innerHTML = '';
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.username;
            datalist.appendChild(option);
        });
        
        document.getElementById('adminAddReviewModal').style.display = 'block';
        setupAdminReviewPasteArea();
        
        // Focus on the paste area after modal opens
        setTimeout(() => {
            document.getElementById('adminReviewPasteArea').focus();
        }, 100);
        
    } catch (error) {
        console.error('Error opening add review modal:', error);
    }
}

// Close admin add review modal
function closeAdminAddReviewModal() {
    document.getElementById('adminAddReviewModal').style.display = 'none';
    document.getElementById('adminAddReviewForm').reset();
    document.getElementById('adminReviewFileInput').value = '';
    const pasteArea = document.getElementById('adminReviewPasteArea');
    pasteArea.classList.remove('has-image');
    pasteArea.onclick = () => document.getElementById('adminReviewFileInput').click();
    pasteArea.innerHTML = '<div class="paste-instructions">📎 Click to select image from files<br><small style="font-size: 0.875rem; opacity: 0.7;">or press Ctrl+V to paste</small></div>';
    adminReviewPastedImage = null;
}

// Setup paste area for admin review
function setupAdminReviewPasteArea() {
    const pasteArea = document.getElementById('adminReviewPasteArea');
    
    pasteArea.addEventListener('paste', function(e) {
        e.preventDefault();
        const items = e.clipboardData.items;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                
                reader.onload = function(event) {
                    adminReviewPastedImage = event.target.result;
                    pasteArea.classList.add('has-image');
                    pasteArea.onclick = null;
                    pasteArea.innerHTML = `<img src="${adminReviewPastedImage}" alt="Pasted image" title="Click to change image" style="cursor: pointer;">`;
                    
                    pasteArea.querySelector('img').onclick = (e) => {
                        e.stopPropagation();
                        document.getElementById('adminReviewFileInput').click();
                    };
                };
                
                reader.readAsDataURL(blob);
                break;
            }
        }
    });
}

// Handle file selection for admin review
function handleAdminReviewFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        alert('Image size should be less than 10MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        adminReviewPastedImage = e.target.result;
        const pasteArea = document.getElementById('adminReviewPasteArea');
        pasteArea.classList.add('has-image');
        pasteArea.onclick = null;
        pasteArea.innerHTML = `<img src="${adminReviewPastedImage}" alt="Selected image" title="Click to change image" style="cursor: pointer;">`;
        
        pasteArea.querySelector('img').onclick = (e) => {
            e.stopPropagation();
            document.getElementById('adminReviewFileInput').click();
        };
    };
    reader.readAsDataURL(file);
}

// Submit admin add review
async function submitAdminAddReview() {
    const username = document.getElementById('reviewUsername').value.trim();
    
    if (!username) {
        alert('Please enter a collector name');
        return;
    }
    
    if (!adminReviewPastedImage) {
        alert('Please select or paste an image');
        return;
    }
    
    const submitBtn = document.querySelector('#adminAddReviewForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    
    try {
        // Check if user exists, if not create new user
        let { data: userData, error: userError } = await supabaseClient
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
        
        // If user doesn't exist, create new user
        if (userError && userError.code === 'PGRST116') {
            const { data: newUser, error: createError } = await supabaseClient
                .from('users')
                .insert([{
                    username: username,
                    number: '',
                    access_level: 'viewer',
                    password: '' // Empty password - user can set it later
                }])
                .select('id')
                .single();
            
            if (createError) throw createError;
            userData = newUser;
        } else if (userError) {
            throw userError;
        }
        
        // Check review count for this user
        const { data: existingReviews, error: countError } = await supabaseClient
            .from('user_reviews')
            .select('id')
            .eq('username', username);
        
        if (countError) throw countError;
        
        if (existingReviews && existingReviews.length >= 20) {
            alert('This collector has reached the maximum of 20 reviews');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Upload Review';
            return;
        }
        
        // Upload to Cloudinary
        const formData = new FormData();
        formData.append('file', adminReviewPastedImage);
        formData.append('upload_preset', REVIEWS_CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', 'user_reviews');
        
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${REVIEWS_CLOUDINARY_CLOUD_NAME}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) throw new Error('Cloudinary upload failed');
        
        const cloudinaryData = await response.json();
        const cloudinaryUrl = cloudinaryData.secure_url;
        
        // Insert review into database
        const { error: insertError } = await supabaseClient
            .from('user_reviews')
            .insert([{
                user_id: userData.id,
                username: username,
                image_url: cloudinaryUrl,
                status: 'hidden'
            }]);
        
        if (insertError) throw insertError;
        
        closeAdminAddReviewModal();
        loadReviewsForApproval();
        
    } catch (error) {
        console.error('Error adding review:', error);
        alert('Failed to add review: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Review';
    }
}

// ==============================================================
// PAYMENT MANAGEMENT FUNCTIONS
// ==============================================================

let allPaymentsData = []; // Store all payments for search functionality
let selectedPaymentLots = []; // Store selected lots for payment
let selectedPaymentImages = []; // Store selected images for payment

// Load all payments
async function loadPayments() {
    const container = document.getElementById('paymentsTableBody');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Loading payments...</div>';
    
    try {
        const { data: payments, error} = await supabaseClient
            .from('payment_history')
            .select('*')
            .order('payment_date', { ascending: false });
        
        if (error) throw error;
        
        allPaymentsData = payments || [];
        displayPayments(allPaymentsData);
        
    } catch (error) {
        console.error('Error loading payments:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Failed to load payments</div>';
    }
}

// Display payments in table
function displayPayments(payments) {
    const container = document.getElementById('paymentsTableBody');
    
    if (!payments || payments.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">No payments found</div>';
        return;
    }
    
    // Group payments by batch_id to show multiple lots together
    const paymentGroups = {};
    payments.forEach(payment => {
        const batchId = payment.batch_id || payment.id;
        if (!paymentGroups[batchId]) {
            paymentGroups[batchId] = [];
        }
        paymentGroups[batchId].push(payment);
    });
    
    let tableHTML = `
        <table class="users-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Collector</th>
                    <th>Lot Name(s)</th>
                    <th>Amount</th>
                    <th>Screenshots</th>
                    <th>Notes</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    Object.values(paymentGroups).forEach(group => {
        const payment = group[0]; // Use first payment for common fields
        const date = new Date(payment.payment_date).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        // Collect all lot names
        const lotNames = group.map(p => p.lot_name).join(', ');
        
        // Get images (they should be same for all in the batch)
        const imageUrls = payment.image_urls || [];
        let imagesHTML = '-';
        if (imageUrls.length > 0) {
            imagesHTML = `<div style="display: flex; gap: 4px; flex-wrap: wrap;">`;
            imageUrls.forEach(url => {
                imagesHTML += `<a href="${url}" target="_blank" style="display: block; width: 40px; height: 40px; overflow: hidden; border-radius: 4px; border: 1px solid #ddd;">
                    <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">
                </a>`;
            });
            imagesHTML += `</div>`;
        }
        
        // Store batch ID for edit
        const batchId = payment.batch_id || payment.id;
        
        tableHTML += `
            <tr>
                <td>${date}</td>
                <td>
                    <a href="person_view.html?username=${encodeURIComponent(payment.username)}" class="username-link">
                        ${payment.username}
                    </a>
                </td>
                <td><strong>${lotNames}</strong></td>
                <td style="color: #15803d; font-weight: 600;">₹${parseFloat(payment.amount).toFixed(2)}</td>
                <td>${imagesHTML}</td>
                <td>${payment.notes || '-'}</td>
                <td>
                    <button class="action-btn edit" onclick="openEditPaymentModal('${batchId}')" style="font-size: 0.85em; padding: 4px 8px; margin: 2px;">Edit</button>
                    <button class="action-btn delete" onclick="deletePaymentBatchDirect('${batchId}')" style="font-size: 0.85em; padding: 4px 8px; margin: 2px;">Delete</button>
                </td>
            </tr>
        `;
    });
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    container.innerHTML = tableHTML;
}

// Search payments
function searchPayments() {
    const searchTerm = document.getElementById('paymentSearchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        displayPayments(allPaymentsData);
        return;
    }
    
    const filteredPayments = allPaymentsData.filter(payment => {
        const username = (payment.username || '').toLowerCase();
        const lotName = (payment.lot_name || '').toLowerCase();
        return username.includes(searchTerm) || lotName.includes(searchTerm);
    });
    
    displayPayments(filteredPayments);
}

// Handle Enter key on collector name input to auto-complete
function handlePaymentCollectorEnter(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        event.stopPropagation(); // Stop event from bubbling
        
        const input = document.getElementById('paymentUsername');
        const datalist = document.getElementById('paymentCollectorsList');
        const currentValue = input.value.toLowerCase().trim();
        
        // If there's a partial match in the datalist, auto-complete with the first match
        if (currentValue && datalist.options.length > 0) {
            for (let i = 0; i < datalist.options.length; i++) {
                const option = datalist.options[i].value;
                if (option.toLowerCase().startsWith(currentValue)) {
                    input.value = option; // Auto-complete with first match
                    break;
                }
            }
        }
        
        // Move focus to lot name input
        setTimeout(() => {
            document.getElementById('paymentLotNameInput').focus();
        }, 0);
        
        return false; // Additional prevention
    }
}

// Handle Enter key on lot name input to auto-complete and add
function handlePaymentLotEnter(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        event.stopPropagation(); // Stop event from bubbling
        
        const input = document.getElementById('paymentLotNameInput');
        const datalist = document.getElementById('paymentLotsList');
        const currentValue = input.value.toLowerCase().trim();
        
        // If there's a partial match in the datalist, auto-complete with the first match
        if (currentValue && datalist.options.length > 0) {
            for (let i = 0; i < datalist.options.length; i++) {
                const option = datalist.options[i].value;
                if (option.toLowerCase().startsWith(currentValue)) {
                    input.value = option; // Auto-complete with first match
                    break;
                }
            }
        }
        
        // Add the lot to the list
        setTimeout(() => {
            autoAddLotFromDropdown();
            // Keep focus on lot name input for adding more lots
            input.focus();
        }, 0);
        
        return false; // Additional prevention
    }
}

// Open add payment modal
async function openAddPaymentModal() {
    try {
        // Reset selected lots and images
        selectedPaymentLots = [];
        selectedPaymentImages = [];
        document.getElementById('selectedLotsList').innerHTML = '';
        document.getElementById('paymentImagesPreview').innerHTML = '<span style="color: #999; font-size: 0.8rem; pointer-events: none;">Paste images anywhere in this form (Ctrl+V)</span>';
        
        // Attach global paste listener when modal opens
        document.addEventListener('paste', handlePaymentImagePaste);
        
        // Fetch all users
        const { data: users, error: usersError } = await supabaseClient
            .from('users')
            .select('username')
            .order('username', { ascending: true });
        
        if (usersError) throw usersError;
        
        // Populate collectors datalist
        const collectorsList = document.getElementById('paymentCollectorsList');
        collectorsList.innerHTML = '';
        (users || []).forEach(user => {
            const option = document.createElement('option');
            option.value = user.username;
            collectorsList.appendChild(option);
        });
        
        // Fetch all lots
        const { data: lots, error: lotsError } = await supabaseClient
            .from('lots')
            .select('lot_name');
        
        if (lotsError) throw lotsError;
        
        // Sort lots numerically
        const sortedLots = (lots || []).sort((a, b) => {
            const numA = parseInt(a.lot_name.match(/\d+/));
            const numB = parseInt(b.lot_name.match(/\d+/));
            
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a.lot_name.localeCompare(b.lot_name);
        });
        
        // Populate lots datalist with special options first
        const lotsList = document.getElementById('paymentLotsList');
        lotsList.innerHTML = '';
        
        // Add special options
        const specialOptions = ['Others', 'Old Lot', 'Shipping'];
        specialOptions.forEach(optionText => {
            const option = document.createElement('option');
            option.value = optionText;
            lotsList.appendChild(option);
        });
        
        // Add regular lots (numerically sorted)
        sortedLots.forEach(lot => {
            const option = document.createElement('option');
            option.value = lot.lot_name;
            lotsList.appendChild(option);
        });
        
        // Set default date to today
        document.getElementById('paymentDate').valueAsDate = new Date();
        
        document.getElementById('addPaymentModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error opening add payment modal:', error);
        alert('Failed to open add payment modal: ' + error.message);
    }
}

// Auto-add lot from dropdown when selected
function autoAddLotFromDropdown() {
    const input = document.getElementById('paymentLotNameInput');
    const lotName = input.value.trim();
    
    if (!lotName) return;
    
    // Check if already added
    if (selectedPaymentLots.includes(lotName)) {
        alert('This lot is already added');
        input.value = '';
        return;
    }
    
    selectedPaymentLots.push(lotName);
    input.value = '';
    
    renderSelectedLots();
}

// Add lot to payment (kept for compatibility)
function addLotToPayment() {
    autoAddLotFromDropdown();
}

// Render selected lots
function renderSelectedLots() {
    const container = document.getElementById('selectedLotsList');
    
    if (selectedPaymentLots.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = selectedPaymentLots.map((lot, index) => `
        <div style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: #e0f2fe; border-radius: 4px; border: 1px solid #0ea5e9;">
            <strong style="color: #0369a1; font-size: 0.85rem;">${lot}</strong>
            <button type="button" onclick="removeLotFromPayment(${index})" style="background: none; border: none; color: #dc2626; cursor: pointer; font-size: 1.1em; line-height: 1; padding: 0 2px;">&times;</button>
        </div>
    `).join('');
}

// Remove lot from payment
function removeLotFromPayment(index) {
    selectedPaymentLots.splice(index, 1);
    renderSelectedLots();
}

// Handle payment image paste
function handlePaymentImagePaste(event) {
    // Only handle paste if the payment modal is open
    const modal = document.getElementById('addPaymentModal');
    if (!modal || modal.style.display !== 'block') {
        return;
    }
    
    event.preventDefault();
    
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    
    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) {
                addPaymentImage(file);
                hasImage = true;
            }
        }
    }
    
    if (hasImage) {
        console.log('Image pasted successfully!');
    } else {
        console.log('No image found in clipboard');
    }
}

// Handle payment image file selection
function handlePaymentImageSelect(event) {
    const files = event.target.files;
    
    for (let file of files) {
        addPaymentImage(file);
    }
}

// Add payment image to preview
function addPaymentImage(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const imageData = {
            file: file,
            dataUrl: e.target.result
        };
        
        selectedPaymentImages.push(imageData);
        renderPaymentImagesPreview();
    };
    
    reader.readAsDataURL(file);
}

// Render payment images preview
function renderPaymentImagesPreview() {
    const container = document.getElementById('paymentImagesPreview');
    
    if (selectedPaymentImages.length === 0) {
        container.innerHTML = '<span style="color: #999; font-size: 0.8rem; pointer-events: none;">Paste images anywhere in this form (Ctrl+V)</span>';
        return;
    }
    
    container.innerHTML = selectedPaymentImages.map((img, index) => `
        <div style="position: relative; width: 60px; height: 60px;">
            <img src="${img.dataUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;">
            <button type="button" onclick="removePaymentImage(${index})" style="position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; border-radius: 50%; background: #dc2626; color: white; border: none; cursor: pointer; font-size: 0.85em; line-height: 1; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
    `).join('');
}

// Remove payment image
function removePaymentImage(index) {
    selectedPaymentImages.splice(index, 1);
    renderPaymentImagesPreview();
}

// Close add payment modal
function closeAddPaymentModal() {
    // Remove global paste listener
    document.removeEventListener('paste', handlePaymentImagePaste);
    
    document.getElementById('addPaymentModal').style.display = 'none';
    document.getElementById('addPaymentForm').reset();
    selectedPaymentLots = [];
    selectedPaymentImages = [];
    document.getElementById('selectedLotsList').innerHTML = '';
    document.getElementById('paymentImagesPreview').innerHTML = '<span style="color: #999; font-size: 0.8rem; pointer-events: none;">Paste images anywhere in this form (Ctrl+V)</span>';
}

// Submit payment
async function submitPayment() {
    const username = document.getElementById('paymentUsername').value.trim();
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const paymentDate = document.getElementById('paymentDate').value;
    const notes = document.getElementById('paymentNotes').value.trim();
    
    if (!username || selectedPaymentLots.length === 0 || !amount || !paymentDate) {
        alert('Please fill in all required fields and add at least one lot');
        return;
    }
    
    const submitBtn = document.querySelector('#addPaymentForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    
    try {
        // Get user ID
        const { data: userData, error: userError } = await supabaseClient
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
        
        if (userError) throw new Error('User not found');
        
        // Upload images to Cloudinary if any
        const imageUrls = [];
        if (selectedPaymentImages.length > 0) {
            submitBtn.textContent = `Uploading images (0/${selectedPaymentImages.length})...`;
            
            for (let i = 0; i < selectedPaymentImages.length; i++) {
                const img = selectedPaymentImages[i];
                submitBtn.textContent = `Uploading images (${i + 1}/${selectedPaymentImages.length})...`;
                
                const formData = new FormData();
                formData.append('file', img.file);
                formData.append('upload_preset', 'bh_smry_upload');
                
                const response = await fetch(`https://api.cloudinary.com/v1_1/daye1yfzy/image/upload`, {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) throw new Error('Image upload failed');
                
                const data = await response.json();
                imageUrls.push(data.secure_url);
            }
        }
        
        // Get current admin username
        const currentUser = getCurrentUser();
        
        // Generate a batch ID for this payment group
        const batchId = crypto.randomUUID();
        
        // Insert payment records for each lot
        submitBtn.textContent = 'Saving payment records...';
        const paymentRecords = [];
        
        for (const lotName of selectedPaymentLots) {
            // Check if it's a special option (Others, Old Lot, Shipping)
            const specialOptions = ['Others', 'Old Lot', 'Shipping'];
            let lotId = null;
            
            if (!specialOptions.includes(lotName)) {
                // Get lot ID for regular lots
                const { data: lotData, error: lotError } = await supabaseClient
                    .from('lots')
                    .select('id')
                    .eq('lot_name', lotName)
                    .single();
                
                if (lotError) {
                    console.warn(`Lot "${lotName}" not found, skipping...`);
                    continue;
                }
                lotId = lotData.id;
            }
            
            paymentRecords.push({
                user_id: userData.id,
                username: username,
                lot_id: lotId, // null for special options
                lot_name: lotName,
                amount: amount,
                payment_date: paymentDate,
                notes: notes || null,
                image_urls: imageUrls.length > 0 ? imageUrls : null,
                batch_id: batchId,
                created_by: currentUser.username
            });
        }
        
        if (paymentRecords.length === 0) {
            throw new Error('No valid lots found');
        }
        
        // Insert all payment records
        const { error: insertError } = await supabaseClient
            .from('payment_history')
            .insert(paymentRecords);
        
        if (insertError) throw insertError;
        
        alert(`✅ Payment added successfully for ${paymentRecords.length} lot(s)!`);
        closeAddPaymentModal();
        loadPayments();
        
    } catch (error) {
        console.error('Error adding payment:', error);
        alert('Failed to add payment: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Payment';
    }
}

let editSelectedPaymentLots = []; // Store selected lots for edit

// Open edit payment modal
async function openEditPaymentModal(batchId) {
    try {
        // Find all payments with this batch_id
        const paymentsInBatch = allPaymentsData.filter(p => (p.batch_id || p.id) === batchId);
        
        if (paymentsInBatch.length === 0) {
            alert('Payment not found');
            return;
        }
        
        const firstPayment = paymentsInBatch[0];
        
        // Populate form
        document.getElementById('editPaymentBatchId').value = batchId;
        document.getElementById('editPaymentUsername').value = firstPayment.username;
        document.getElementById('editPaymentAmount').value = firstPayment.amount;
        document.getElementById('editPaymentDate').value = firstPayment.payment_date;
        document.getElementById('editPaymentNotes').value = firstPayment.notes || '';
        
        // Display collector name (read-only)
        document.getElementById('editPaymentCollector').textContent = firstPayment.username;
        
        // Set selected lots
        editSelectedPaymentLots = paymentsInBatch.map(p => p.lot_name);
        renderEditSelectedLots();
        
        // Load lots datalist
        const { data: lots, error: lotsError } = await supabaseClient
            .from('lots')
            .select('lot_name');
        
        if (!lotsError) {
            // Sort lots numerically
            const sortedLots = (lots || []).sort((a, b) => {
                const numA = parseInt(a.lot_name.match(/\d+/));
                const numB = parseInt(b.lot_name.match(/\d+/));
                
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                return a.lot_name.localeCompare(b.lot_name);
            });
            
            const lotsList = document.getElementById('editPaymentLotsList');
            lotsList.innerHTML = '';
            
            // Add special options
            const specialOptions = ['Others', 'Old Lot', 'Shipping'];
            specialOptions.forEach(optionText => {
                const option = document.createElement('option');
                option.value = optionText;
                lotsList.appendChild(option);
            });
            
            // Add regular lots
            sortedLots.forEach(lot => {
                const option = document.createElement('option');
                option.value = lot.lot_name;
                lotsList.appendChild(option);
            });
        }
        
        document.getElementById('editPaymentModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error opening edit payment modal:', error);
        alert('Failed to open edit payment modal: ' + error.message);
    }
}

// Add lot to edit
function addLotToEdit() {
    const input = document.getElementById('editPaymentLotNameInput');
    const lotName = input.value.trim();
    
    if (!lotName) return;
    
    // Check if already added
    if (editSelectedPaymentLots.includes(lotName)) {
        alert('This lot is already added');
        input.value = '';
        return;
    }
    
    editSelectedPaymentLots.push(lotName);
    input.value = '';
    
    renderEditSelectedLots();
}

// Handle Enter key on edit lot name input
function handleEditLotEnter(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        
        const input = document.getElementById('editPaymentLotNameInput');
        const datalist = document.getElementById('editPaymentLotsList');
        const currentValue = input.value.toLowerCase().trim();
        
        // Auto-complete with the first match
        if (currentValue && datalist.options.length > 0) {
            for (let i = 0; i < datalist.options.length; i++) {
                const option = datalist.options[i].value;
                if (option.toLowerCase().startsWith(currentValue)) {
                    input.value = option;
                    break;
                }
            }
        }
        
        // Add the lot
        setTimeout(() => {
            addLotToEdit();
            input.focus();
        }, 0);
        
        return false;
    }
}

// Render edit selected lots
function renderEditSelectedLots() {
    const container = document.getElementById('editSelectedLotsList');
    
    if (editSelectedPaymentLots.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = editSelectedPaymentLots.map((lot, index) => `
        <div style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: #e0f2fe; border-radius: 4px; border: 1px solid #0ea5e9;">
            <strong style="color: #0369a1; font-size: 0.85rem;">${lot}</strong>
            <button type="button" onclick="removeLotFromEdit(${index})" style="background: none; border: none; color: #dc2626; cursor: pointer; font-size: 1.1em; line-height: 1; padding: 0 2px;">&times;</button>
        </div>
    `).join('');
}

// Remove lot from edit
function removeLotFromEdit(index) {
    editSelectedPaymentLots.splice(index, 1);
    renderEditSelectedLots();
}

// Close edit payment modal
function closeEditPaymentModal() {
    document.getElementById('editPaymentModal').style.display = 'none';
    document.getElementById('editPaymentForm').reset();
    editSelectedPaymentLots = [];
    document.getElementById('editSelectedLotsList').innerHTML = '';
}

// Update payment
async function updatePayment() {
    const batchId = document.getElementById('editPaymentBatchId').value;
    const username = document.getElementById('editPaymentUsername').value;
    const amount = parseFloat(document.getElementById('editPaymentAmount').value);
    const paymentDate = document.getElementById('editPaymentDate').value;
    const notes = document.getElementById('editPaymentNotes').value.trim();
    
    if (!batchId || !amount || !paymentDate || editSelectedPaymentLots.length === 0) {
        alert('Please fill in all required fields and add at least one lot');
        return;
    }
    
    const submitBtn = document.querySelector('#editPaymentForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';
    
    try {
        // Get user ID
        const { data: userData, error: userError } = await supabaseClient
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
        
        if (userError) throw new Error('User not found');
        
        // Delete old payment records in this batch
        const { error: deleteError } = await supabaseClient
            .from('payment_history')
            .delete()
            .eq('batch_id', batchId);
        
        if (deleteError) throw deleteError;
        
        // Get current admin username
        const currentUser = getCurrentUser();
        
        // Insert new payment records for each lot
        const paymentRecords = [];
        
        for (const lotName of editSelectedPaymentLots) {
            // Check if it's a special option
            const specialOptions = ['Others', 'Old Lot', 'Shipping'];
            let lotId = null;
            
            if (!specialOptions.includes(lotName)) {
                // Get lot ID for regular lots
                const { data: lotData, error: lotError } = await supabaseClient
                    .from('lots')
                    .select('id')
                    .eq('lot_name', lotName)
                    .single();
                
                if (lotError) {
                    console.warn(`Lot "${lotName}" not found, skipping...`);
                    continue;
                }
                lotId = lotData.id;
            }
            
            paymentRecords.push({
                user_id: userData.id,
                username: username,
                lot_id: lotId,
                lot_name: lotName,
                amount: amount,
                payment_date: paymentDate,
                notes: notes || null,
                batch_id: batchId, // Keep the same batch_id
                created_by: currentUser.username
            });
        }
        
        if (paymentRecords.length === 0) {
            throw new Error('No valid lots found');
        }
        
        // Insert updated payment records
        const { error: insertError } = await supabaseClient
            .from('payment_history')
            .insert(paymentRecords);
        
        if (insertError) throw insertError;
        
        closeEditPaymentModal();
        loadPayments();
        
    } catch (error) {
        console.error('Error updating payment:', error);
        alert('Failed to update payment: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Payment';
    }
}

// Delete payment batch (from edit modal)
async function deletePaymentBatch() {
    if (!confirm('Are you sure you want to delete this entire payment record? This cannot be undone.')) return;
    
    const batchId = document.getElementById('editPaymentBatchId').value;
    
    try {
        // Delete all payments in this batch (using only batch_id)
        const { error } = await supabaseClient
            .from('payment_history')
            .delete()
            .eq('batch_id', batchId);
        
        if (error) throw error;
        
        closeEditPaymentModal();
        loadPayments();
        
    } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Failed to delete payment: ' + error.message);
    }
}

// Delete payment batch directly from table
async function deletePaymentBatchDirect(batchId) {
    if (!confirm('Are you sure you want to delete this payment record? This cannot be undone.')) return;
    
    try {
        // Delete all payments in this batch (using only batch_id)
        const { error } = await supabaseClient
            .from('payment_history')
            .delete()
            .eq('batch_id', batchId);
        
        if (error) throw error;
        
        loadPayments();
        
    } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Failed to delete payment: ' + error.message);
    }
}

// Delete all payment history
async function deleteAllPaymentHistory() {
    const confirmMsg = 'WARNING: This will delete ALL payment records permanently!\n\nType "DELETE ALL" to confirm:';
    const userInput = prompt(confirmMsg);
    
    if (userInput !== 'DELETE ALL') {
        if (userInput !== null) {
            alert('Deletion cancelled. You must type "DELETE ALL" exactly to confirm.');
        }
        return;
    }
    
    // Double confirmation
    if (!confirm('Are you ABSOLUTELY SURE? This action CANNOT be undone!')) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('payment_history')
            .delete()
            .neq('id', 0); // Delete all records
        
        if (error) throw error;
        
        alert('✅ All payment history has been deleted');
        loadPayments();
        
    } catch (error) {
        console.error('Error deleting all payment history:', error);
        alert('Failed to delete payment history: ' + error.message);
    }
}

// Delete payment (kept for compatibility)
async function deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment record?')) return;
    
    try {
        // First, get the payment details before deleting
        const { data: payment, error: fetchError } = await supabaseClient
            .from('payment_history')
            .select('*')
            .eq('id', paymentId)
            .single();
        
        if (fetchError) throw fetchError;
        
        const { error } = await supabaseClient
            .from('payment_history')
            .delete()
            .eq('id', paymentId);
        
        if (error) throw error;
        
        alert('✅ Payment deleted successfully!');
        loadPayments();
        
    } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Failed to delete payment: ' + error.message);
    }
}

// ==============================================================
// LIVE BIDDING FUNCTIONS - SUPABASE INTEGRATION
// ==============================================================

let biddingAuctions = {}; // Local state: { postUrl: { items: {}, images: [] } }
let biddingRealtimeSubscriptions = {}; // Store Realtime subscriptions
const BIDDING_POLL_INTERVAL = 120; // 120 seconds

// Initialize bidding section
let biddingRefreshInterval = null;

function initBiddingSection() {
    loadBiddingWatchers();
    subscribeToBiddingUpdates();
    checkBiddingCookieStatus();
    
    // Auto-refresh every minute
    if (biddingRefreshInterval) {
        clearInterval(biddingRefreshInterval);
    }
    biddingRefreshInterval = setInterval(async () => {
        console.log('[Bidding] Auto-refreshing data...');
        const currentUser = getCurrentUser();
        const createdBy = currentUser ? currentUser.username : 'admin';
        
        const { data: watchers } = await supabaseClient
            .from('bidding_watchers')
            .select('post_url, my_name')
            .eq('created_by', createdBy)
            .eq('is_running', true);
        
        if (watchers) {
            for (const watcher of watchers) {
                await loadBiddingDataForPost(watcher.post_url, watcher.my_name);
            }
        }
    }, 60000); // Every 60 seconds
}

// Load existing watchers from Supabase and create panels
async function loadBiddingWatchers() {
    try {
        const currentUser = getCurrentUser();
        const createdBy = currentUser ? currentUser.username : 'admin';
        
        // Get all active watchers for current user
        const { data: watchers, error } = await supabaseClient
            .from('bidding_watchers')
            .select('post_url, my_name')
            .eq('created_by', createdBy)
            .eq('is_running', true);
        
        if (error) {
            console.error("Error loading watchers:", error);
            return;
        }
        
        if (!watchers || watchers.length === 0) {
            return; // No watchers to load
        }
        
        // Create panels and load data for each watcher
        for (const watcher of watchers) {
            createBiddingPanelIfNotExists(watcher.post_url);
            await loadBiddingDataForPost(watcher.post_url, watcher.my_name);
        }
        
    } catch (error) {
        console.error("Error in loadBiddingWatchers:", error);
    }
}

// Subscribe to real-time updates from Supabase
function subscribeToBiddingUpdates() {
    // Subscribe to bidding_posts changes
    const postsChannel = supabaseClient
        .channel('bidding_posts_changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'bidding_posts' },
            async (payload) => {
                const postUrl = payload.new?.post_url || payload.old?.post_url;
                if (postUrl) {
                    // Reload data for this post
                    const { data: watcher } = await supabaseClient
                        .from('bidding_watchers')
                        .select('my_name')
                        .eq('post_url', postUrl)
                        .eq('is_running', true)
                        .limit(1)
                        .maybeSingle();
                    
                    await loadBiddingDataForPost(postUrl, watcher?.my_name || null);
                }
            }
        )
        .subscribe();
    
    // Subscribe to bidding_bids changes
    const bidsChannel = supabaseClient
        .channel('bidding_bids_changes')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'bidding_bids' },
            async (payload) => {
                const postUrl = payload.new.post_url;
                if (postUrl) {
                    // Reload data for this post
                    const { data: watcher } = await supabaseClient
                        .from('bidding_watchers')
                        .select('my_name')
                        .eq('post_url', postUrl)
                        .eq('is_running', true)
                        .limit(1)
                        .maybeSingle();
                    
                    await loadBiddingDataForPost(postUrl, watcher?.my_name || null);
                }
            }
        )
        .subscribe();
    
    // Subscribe to bidding_watchers changes (to show/hide panels)
    const watchersChannel = supabaseClient
        .channel('bidding_watchers_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'bidding_watchers' },
            async (payload) => {
                const postUrl = payload.new?.post_url || payload.old?.post_url;
                const isRunning = payload.new?.is_running;
                
                if (postUrl) {
                    if (isRunning === false) {
                        // Remove panel if watcher stopped
                        const el = document.getElementById(`bidding-panel-${btoa(postUrl)}`);
                        if (el) el.remove();
                    } else if (isRunning === true) {
                        // Create panel if watcher started
                        createBiddingPanelIfNotExists(postUrl);
                        const watcher = payload.new;
                        await loadBiddingDataForPost(postUrl, watcher.my_name);
                    }
                }
            }
        )
        .subscribe();
    
    // Store subscriptions for cleanup if needed
    biddingRealtimeSubscriptions.posts = postsChannel;
    biddingRealtimeSubscriptions.bids = bidsChannel;
    biddingRealtimeSubscriptions.watchers = watchersChannel;
}

// Check cookie status in Supabase
async function checkBiddingCookieStatus() {
    try {
        const { data, error } = await supabaseClient
            .from('bidding_cookies')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
        
        const statusEl = document.getElementById('cookieStatusText');
        if (error && error.code === 'PGRST116') {
            // No cookies found
            statusEl.innerHTML = '<span style="color: #dc3545;">❌ No cookies set</span>';
            statusEl.style.color = '#dc3545';
        } else if (error) {
            statusEl.innerHTML = '<span style="color: #dc3545;">Error checking cookies</span>';
            statusEl.style.color = '#dc3545';
        } else if (data) {
            statusEl.innerHTML = '<span style="color: #42b72a;">✅ Cookies saved</span> <span style="color: var(--text-secondary); font-size: 0.8em;">(Updated: ' + new Date(data.updated_at).toLocaleDateString() + ')</span>';
            statusEl.style.color = '#42b72a';
        }
    } catch (e) {
        console.error("Error checking cookies:", e);
        document.getElementById('cookieStatusText').innerHTML = '<span style="color: #dc3545;">Error checking status</span>';
    }
}

// Toggle cookie input visibility
function toggleBiddingCookieInput() {
    const inputDiv = document.getElementById('biddingCookieInput');
    inputDiv.style.display = inputDiv.style.display === 'none' ? 'block' : 'none';
}

// Validate cookies JSON
function validateBiddingCookies() {
    const input = document.getElementById('cookieInput').value.trim();
    const msgEl = document.getElementById('cookieValidationMsg');
    
    if (!input) {
        msgEl.innerText = "Please paste cookie JSON";
        msgEl.style.color = '#dc3545';
        return false;
    }
    
    try {
        // Try to parse as JSON
        let json = JSON.parse(input);
        
        // If it's a single object, wrap it in an array
        if (!Array.isArray(json)) {
            json = [json];
        }
        
        // Validate cookie structure
        if (json.length === 0) {
            msgEl.innerText = "Cookie array is empty";
            msgEl.style.color = '#dc3545';
            return false;
        }
        
        // Check if it looks like a cookie object
        const firstCookie = json[0];
        if (!firstCookie.name && !firstCookie.domain) {
            msgEl.innerText = "Invalid cookie format. Expected objects with 'name' and 'domain' fields.";
            msgEl.style.color = '#dc3545';
            return false;
        }
        
        msgEl.innerText = `✅ Valid JSON (${json.length} cookies)`;
        msgEl.style.color = '#42b72a';
        return true;
        
    } catch (e) {
        msgEl.innerText = "Invalid JSON: " + e.message;
        msgEl.style.color = '#dc3545';
        return false;
    }
}

// Save cookies to Supabase
async function saveBiddingCookies() {
    const input = document.getElementById('cookieInput').value.trim();
    if (!input) {
        alert("Please paste cookie JSON");
        return;
    }
    
    try {
        // Validate first
        let json = JSON.parse(input);
        if (!Array.isArray(json)) {
            json = [json];
        }
        
        // Validate cookie structure
        if (json.length === 0) {
            alert("Cookie array is empty");
            return;
        }
        
        const currentUser = getCurrentUser();
        const updatedBy = currentUser ? currentUser.username : 'admin';
        
        // Delete existing cookies and insert new one
        await supabaseClient
            .from('bidding_cookies')
            .delete()
            .neq('id', 0); // Delete all (id is always > 0)
        
        const { error } = await supabaseClient
            .from('bidding_cookies')
            .insert([{
                cookies_json: json,
                updated_by: updatedBy
            }]);
        
        if (error) throw error;
        
        // Success
        document.getElementById('cookieInput').value = '';
        document.getElementById('cookieValidationMsg').innerText = '';
        document.getElementById('biddingCookieInput').style.display = 'none';
        checkBiddingCookieStatus();
        
        alert("✅ Cookies saved successfully!");
        
    } catch (e) {
        console.error("Error saving cookies:", e);
        alert("Error saving cookies: " + e.message);
    }
}

// Start watching auctions - Save to Supabase
async function startBiddingWatch() {
    const text = document.getElementById('biddingPostUrls').value.trim();
    if (!text) return alert("Please enter URLs");

    // Make sure we're on the bidding section
    if (!document.getElementById('biddingSection').classList.contains('active')) {
        switchSection('bidding');
    }

    // Call backend to wake it up (Render spins down free tier)
    try {
        fetch(`${BACKEND_URL}/status`).catch(() => {});
    } catch(e) {}

    const urls = text.split(/\r?\n/).filter(u => u.trim().length > 0);
    const myName = "Ken Kaneki"; // Always use Ken Kaneki
    const msg = document.getElementById('biddingMsg');
    
    document.getElementById('biddingPostUrls').value = '';
    msg.innerText = `Adding ${urls.length} auctions...`;

    const currentUser = getCurrentUser();
    const createdBy = currentUser ? currentUser.username : 'admin';

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i].trim();
        msg.innerText = `Processing ${i+1}/${urls.length}: ${url.substring(0, 30)}...`;
        
        try {
            console.log(`[Watch All] Processing URL ${i+1}/${urls.length}: ${url}`);
            
            // First, ensure post exists
            const { data: postData, error: postError } = await supabaseClient
                .from('bidding_posts')
                .upsert([{
                    post_url: url
                }], {
                    onConflict: 'post_url'
                })
                .select();
            
            if (postError) {
                console.error(`[Watch All] Post error for ${url}:`, postError);
                throw postError;
            }
            console.log(`[Watch All] Post saved:`, postData);
            
            // Create or update watcher
            const { data: watcherData, error: watcherError } = await supabaseClient
                .from('bidding_watchers')
                .upsert([{
                    post_url: url,
                    my_name: myName,
                    interval_sec: BIDDING_POLL_INTERVAL,
                    is_running: true,
                    created_by: createdBy
                }], {
                    onConflict: 'post_url,created_by'
                })
                .select();
            
            if (watcherError) {
                console.error(`[Watch All] Watcher error for ${url}:`, watcherError);
                throw watcherError;
            }
            console.log(`[Watch All] Watcher saved:`, watcherData);
            
            // Create panel first (even if data loading fails)
            createBiddingPanelIfNotExists(url);
            
            // Then try to load data
            try {
                await loadBiddingDataForPost(url, myName);
            } catch (loadError) {
                console.error("Error loading data (but panel created):", loadError);
                // Panel is already created, just show error in status
                const panelId = btoa(url);
                const statusEl = document.getElementById(`bidding-status-${panelId}`);
                if (statusEl) {
                    statusEl.innerText = `Error loading: ${loadError.message}`;
                }
            }
            
        } catch (e) {
            console.error(`[Watch All] Failed to start watcher for ${url}:`, e);
            msg.innerText = `Error for ${url.substring(0, 30)}: ${e.message}`;
            msg.style.color = '#dc3545';
            
            // Still try to create panel even on error
            try {
                createBiddingPanelIfNotExists(url);
                const panelId = btoa(url);
                const statusEl = document.getElementById(`bidding-status-${panelId}`);
                if (statusEl) {
                    statusEl.innerText = `Error: ${e.message}`;
                    statusEl.style.color = '#dc3545';
                }
            } catch (panelError) {
                console.error("Failed to create panel:", panelError);
            }
        }

        // Small delay between requests
        if (i < urls.length - 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    // Verify data was saved by checking Supabase
    try {
        const { data: savedWatchers, error: verifyError } = await supabaseClient
            .from('bidding_watchers')
            .select('post_url, is_running')
            .eq('created_by', createdBy)
            .eq('is_running', true);
        
        if (verifyError) {
            console.error("[Watch All] Verification error:", verifyError);
        } else {
            console.log(`[Watch All] Verified ${savedWatchers?.length || 0} active watchers in Supabase:`, savedWatchers);
        }
    } catch (verifyErr) {
        console.error("[Watch All] Error verifying:", verifyErr);
    }
    
    msg.innerText = `✅ ${urls.length} auction(s) added! Server will start monitoring within 10 seconds.`;
    msg.style.color = '#42b72a';
}

// Stop all auctions
async function stopAllBidding() {
    try {
        const currentUser = getCurrentUser();
        const createdBy = currentUser ? currentUser.username : 'admin';
        
        // Stop all watchers created by current user
        const { error } = await supabaseClient
            .from('bidding_watchers')
            .update({ is_running: false })
            .eq('created_by', createdBy)
            .eq('is_running', true);
        
        if (error) throw error;
        
        document.getElementById('biddingMsg').innerText = "✅ Stopped all your watchers";
        document.getElementById('biddingDashboard').innerHTML = '<div class="bidding-empty-state" id="biddingEmptyState"><p>No auctions being watched. Add Facebook post URLs to start tracking bids.</p></div>';
        biddingAuctions = {};
        
        // Reload watchers
        await loadBiddingWatchers();
    } catch (error) {
        console.error("Failed to stop all:", error);
        alert("Failed to stop watchers: " + error.message);
    }
}

// Stop one auction - Delete all data
async function stopOneBidding(postUrl) {
    if (!confirm(`Are you sure you want to stop and delete all data for this auction?`)) {
        return;
    }
    
    try {
        const currentUser = getCurrentUser();
        const createdBy = currentUser ? currentUser.username : 'admin';
        
        // Delete all bids for this post
        const { error: bidsError } = await supabaseClient
            .from('bidding_bids')
            .delete()
            .eq('post_url', postUrl);
        
        if (bidsError) console.error("Error deleting bids:", bidsError);
        
        // Delete watcher
        const { error: watcherError } = await supabaseClient
            .from('bidding_watchers')
            .delete()
            .eq('post_url', postUrl)
            .eq('created_by', createdBy);
        
        if (watcherError) throw watcherError;
        
        // Delete post (this will cascade delete bids and watchers due to foreign key)
        const { error: postError } = await supabaseClient
            .from('bidding_posts')
            .delete()
            .eq('post_url', postUrl);
        
        if (postError) console.error("Error deleting post:", postError);
        
        // Remove panel from UI
        const el = document.getElementById(`bidding-panel-${btoa(postUrl)}`);
        if (el) el.remove();
        delete biddingAuctions[postUrl];
        
        // Show empty state if no panels left
        if (document.querySelectorAll('.bidding-auction-panel').length === 0) {
            document.getElementById('biddingDashboard').innerHTML = '<div class="bidding-empty-state" id="biddingEmptyState"><p>No auctions being watched. Add Facebook post URLs to start tracking bids.</p></div>';
        }
    } catch (error) {
        console.error("Failed to stop auction:", error);
        alert("Failed to stop watcher: " + error.message);
    }
}

// Get post ID from URL
function getBiddingPostId(url) {
    const match = url.match(/\/p\/([A-Za-z0-9]+)/) || url.match(/\/posts\/(\d+)/) || url.match(/([A-Za-z0-9]+)\/?$/);
    return match ? match[1] : '???';
}

// Create auction panel
function createBiddingPanelIfNotExists(url) {
    const id = `bidding-panel-${btoa(url)}`;
    if (document.getElementById(id)) return;

    const dashboard = document.getElementById('biddingDashboard');
    if (!dashboard) {
        console.error("biddingDashboard element not found!");
        return;
    }
    
    const emptyState = document.getElementById('biddingEmptyState');
    if (emptyState) emptyState.remove();

    const div = document.createElement('div');
    div.id = id;
    div.className = 'bidding-auction-panel';
    div.innerHTML = `
        <div class="bidding-auction-header">
            <div>
                <div class="bidding-auction-title" id="bidding-title-${btoa(url)}"><a href="${url}" target="_blank">Post #${getBiddingPostId(url)}</a></div>
                <div class="bidding-auction-status" id="bidding-status-${btoa(url)}">Initializing...</div>
            </div>
            <button class="btn btn-secondary" onclick="stopOneBidding('${url}')" style="background: #dc3545; color: white; border-color: #dc3545; padding: 5px 10px; font-size: 0.8em;">Stop</button>
        </div>
        <div class="bidding-images-row" id="bidding-img-${btoa(url)}"></div>
        <div class="bidding-manual-img-control" style="margin-bottom: 10px; display: flex; gap: 5px;">
            <input type="text" id="bidding-paste-target-${btoa(url)}" placeholder="Paste Image (Ctrl+V) here..." style="flex: 1; padding: 5px; border: 1px solid var(--border-color); border-radius: 4px;" onpaste="handleBiddingPaste(event, '${url}')">
        </div>
        <div class="bidding-manual-img-control" style="margin-bottom: 10px; display: flex; gap: 5px;">
            <input type="text" id="bidding-img-url-${btoa(url)}" placeholder="Or paste Image URL..." style="flex: 1; padding: 5px; border: 1px solid var(--border-color); border-radius: 4px;">
            <button class="btn btn-primary" onclick="addBiddingImageUrl('${url}')" style="padding: 5px 15px; font-size: 0.85em;">Add URL</button>
        </div>
        <div class="bidding-grid" id="bidding-grid-${btoa(url)}"></div>
    `;
    dashboard.appendChild(div);
    
    // Scroll the new panel into view
    setTimeout(() => {
        div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// Load bidding data for a post from Supabase
async function loadBiddingDataForPost(postUrl, myName) {
    try {
        // Always use "Ken Kaneki" as the name
        const myNameFixed = "Ken Kaneki";
        
        // Get post data
        const { data: postData, error: postError } = await supabaseClient
            .from('bidding_posts')
            .select('post_number, images')
            .eq('post_url', postUrl)
            .maybeSingle();
        
        if (postError && postError.code !== 'PGRST116') {
            console.error("Error loading post:", postError);
        }
        
        const postNumber = postData?.post_number || '???';
        const images = postData?.images || [];
        
        // Get all bids for this post
        const { data: bidsData, error: bidsError } = await supabaseClient
            .from('bidding_bids')
            .select('*')
            .eq('post_url', postUrl)
            .order('timestamp', { ascending: false });
        
        if (bidsError) {
            console.error("Error loading bids:", bidsError);
            throw bidsError;
        }
        
        // Process bids: group by item_number and find highest for each
        const itemsByNumber = {};
        const bidsByItem = {};
        
        (bidsData || []).forEach(bid => {
            const itemNum = bid.item_number;
            if (!bidsByItem[itemNum]) {
                bidsByItem[itemNum] = [];
            }
            bidsByItem[itemNum].push(bid);
        });
        
        // For each item, find highest bid and build history
        Object.keys(bidsByItem).forEach(itemNum => {
            const itemBids = bidsByItem[itemNum];
            // Sort by amount descending, then by timestamp descending
            itemBids.sort((a, b) => {
                if (b.amount !== a.amount) return b.amount - a.amount;
                return new Date(b.timestamp) - new Date(a.timestamp);
            });
            
            const highestBid = itemBids[0];
            const history = itemBids.slice(1, 10); // Keep last 9 for history (excluding current)
            
            // Determine if user is winning or has bid (case-insensitive, trimmed)
            const myNameNormalized = myNameFixed.trim().toLowerCase();
            const userHasBid = itemBids.some(b => b.bidder_name?.trim().toLowerCase().includes(myNameNormalized));
            const isWinning = highestBid.bidder_name?.trim().toLowerCase().includes(myNameNormalized);
            
            itemsByNumber[itemNum] = {
                item_number: parseInt(itemNum),
                amount: highestBid.amount,
                bidder_name: highestBid.bidder_name,
                raw_comment: highestBid.raw_comment,
                relative_time: highestBid.relative_time,
                comment_images: highestBid.comment_images || [],
                timestamp: highestBid.timestamp,
                userHasBid: userHasBid,
                isWinning: isWinning,
                history: history.map(b => ({
                    amount: b.amount,
                    bidder_name: b.bidder_name,
                    comment_images: b.comment_images || []
                }))
            };
        });
        
        // Convert to array and sort by item_number
        const items = Object.values(itemsByNumber).sort((a, b) => a.item_number - b.item_number);
        
        // Call handleBiddingUpdate with processed data
        handleBiddingUpdate({
            postUrl: postUrl,
            postNumber: postNumber,
            items: items,
            images: images,
            lastUpdated: new Date().toISOString(),
            status: 'loaded',
            myName: "Ken Kaneki" // Always use Ken Kaneki
        });
        
    } catch (error) {
        console.error("Error loading bidding data:", error);
        const panelId = btoa(postUrl);
        const statusEl = document.getElementById(`bidding-status-${panelId}`);
        if (statusEl) {
            statusEl.innerText = `Error: ${error.message}`;
        }
    }
}

// Handle paste image - Upload to Cloudinary and save to Supabase
async function handleBiddingPaste(e, postUrl) {
    e.preventDefault();
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            try {
                // Upload directly to Cloudinary using blob
                const formData = new FormData();
                formData.append('file', blob);
                formData.append('upload_preset', 'bh_smry_upload');
                
                const res = await fetch('https://api.cloudinary.com/v1_1/daye1yfzy/image/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (!res.ok) throw new Error('Cloudinary upload failed');
                
                const data = await res.json();
                if (data.secure_url) {
                    // Get current images from Supabase
                    const { data: postData } = await supabaseClient
                        .from('bidding_posts')
                        .select('images')
                        .eq('post_url', postUrl)
                        .maybeSingle();
                    
                    const currentImages = postData?.images || [];
                    if (!currentImages.includes(data.secure_url)) {
                        currentImages.push(data.secure_url);
                    }
                    
                    // Update in Supabase
                    const { error } = await supabaseClient
                        .from('bidding_posts')
                        .upsert({
                            post_url: postUrl,
                            images: currentImages
                        }, {
                            onConflict: 'post_url'
                        });
                    
                    if (error) throw error;
                    
                    // Reload the panel to show new image
                    await loadBiddingDataForPost(postUrl, null);
                } else {
                    alert("Upload failed: No URL returned");
                }
            } catch (err) {
                console.error("Upload failed:", err);
                alert("Upload failed: " + err.message);
            }
        }
    }
}

// Add image URL - Save to Supabase
async function addBiddingImageUrl(postUrl) {
    const inputId = `bidding-img-url-${btoa(postUrl)}`;
    const input = document.getElementById(inputId);
    const url = input.value.trim();
    
    if (!url) return;

    try {
        // Get current images from Supabase
        const { data: postData } = await supabaseClient
            .from('bidding_posts')
            .select('images')
            .eq('post_url', postUrl)
            .single();
        
        const currentImages = postData?.images || [];
        currentImages.push(url);
        
        // Update in Supabase
        const { error } = await supabaseClient
            .from('bidding_posts')
            .update({ images: currentImages })
            .eq('post_url', postUrl);
        
        if (error) throw error;
        
        input.value = '';
    } catch (err) {
        console.error("Failed to add image URL:", err);
        alert("Failed to add image URL: " + err.message);
    }
}

// Open image modal
function openBiddingImageModal(src) {
    document.getElementById('biddingModalImg').src = src;
    document.getElementById('biddingImgModal').style.display = 'flex';
}

// Close image modal
function closeBiddingImageModal() {
    document.getElementById('biddingImgModal').style.display = 'none';
}

// Log activity
function logBiddingActivity(message, type, postUrl, postNumber) {
    const container = document.getElementById('biddingActivityFeed');
    if (container.innerText.includes("No activity yet")) container.innerHTML = "";
    
    const linkHtml = postUrl ? ` <a href="${postUrl}" target="_blank" style="color: var(--primary-color);">#${postNumber || '???'}</a>` : '';
    
    const div = document.createElement('div');
    div.className = 'bidding-activity-item';
    div.innerHTML = `
        <div class="bidding-act-time">${new Date().toLocaleTimeString()}</div>
        <div class="bidding-act-msg ${type}">${message}${linkHtml}</div>
    `;
    container.prepend(div);
    
    // Keep only last 50 items
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

// Handle bidding update (from Supabase Realtime or manual load)
function handleBiddingUpdate(data) {
    const { postUrl, postNumber, items, images, lastUpdated, status } = data;
    
    createBiddingPanelIfNotExists(postUrl);
    const panelId = btoa(postUrl);
    const statusEl = document.getElementById(`bidding-status-${panelId}`);
    if (statusEl) {
        statusEl.innerText = `Updated: ${new Date(lastUpdated).toLocaleTimeString()}`;
    }

    // Update Post Number Title
    if (postNumber && postNumber !== '???') {
        const titleEl = document.getElementById(`bidding-title-${panelId}`);
        if (titleEl && (titleEl.innerText.includes('Post #???') || !titleEl.innerText.includes(postNumber))) {
            titleEl.innerHTML = `<a href="${postUrl}" target="_blank">Post #${postNumber}</a>`;
        }
    }

    // Images
    const imgContainer = document.getElementById(`bidding-img-${panelId}`);
    if (images && images.length > 0) {
        if (!biddingAuctions[postUrl]) biddingAuctions[postUrl] = {};
        biddingAuctions[postUrl].images = images;
        
        imgContainer.innerHTML = images.map(src => `<img src="${src}" onclick="openBiddingImageModal('${src}')" style="height: 100px; border-radius: 4px; border: 1px solid var(--border-color); cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />`).join('');
    }

    // Items Grid
    const grid = document.getElementById(`bidding-grid-${panelId}`);
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // State Logic
    if (!biddingAuctions[postUrl]) biddingAuctions[postUrl] = {};
    const oldItems = biddingAuctions[postUrl].items || {};

    items.forEach(item => {
        const oldItem = oldItems[item.item_number];

        // Detect Notifications
        if (oldItem) {
            // Outbid: Was winning, now not winning, and I have bid on it
            if (oldItem.isWinning && !item.isWinning && item.userHasBid) {
                logBiddingActivity(`Outbid on #${item.item_number} by ${item.bidder_name}`, 'bidding-act-outbid', postUrl, postNumber);
            }
            // Winning: Was not winning, now winning
            if (!oldItem.isWinning && item.isWinning) {
                logBiddingActivity(`You are winning #${item.item_number} (${item.amount})`, 'bidding-act-bid', postUrl, postNumber);
            }
        } else if (item.isWinning) {
            // Initial load or new item winning
            if (Object.keys(oldItems).length > 0) {
                logBiddingActivity(`You took lead on #${item.item_number} (${item.amount})`, 'bidding-act-bid', postUrl, postNumber);
            }
        }

        // Determine Status Logic
        let statusClass = 'bidding-neutral';
        let statusText = 'CURRENT';
        
        if (item.isWinning) {
            statusClass = 'bidding-winning';
            statusText = 'WINNING';
        } else if (item.userHasBid) {
            statusClass = 'bidding-outbid';
            statusText = 'OUTBID';
        }

        let timeStr = "";
        try {
            const date = new Date(item.timestamp);
            timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch(e) {}

        // Build history HTML
        let historyHtml = '';
        if (item.history && item.history.length > 0) {
            historyHtml = item.history.map(h => {
                let imgIcon = '';
                if (h.comment_images && h.comment_images.length > 0) {
                    imgIcon = ` <a href="${h.comment_images[0]}" target="_blank" style="color: #4db6ac; text-decoration: none;">📷</a>`;
                }
                return `<div>${h.amount.toLocaleString()} - ${h.bidder_name}${imgIcon}</div>`;
            }).join('');
        }

        const card = document.createElement('div');
        card.className = `bidding-item-card ${statusClass}`;
        
        // Check for images in current leader
        let leaderImgIcon = '';
        if (item.comment_images && item.comment_images.length > 0) {
            leaderImgIcon = `<a href="${item.comment_images[0]}" target="_blank" style="color: inherit; text-decoration: none; margin-left: 5px;">📷</a>`;
        }

        card.innerHTML = `
            <div class="bidding-item-header">
                <div class="bidding-item-num">#${item.item_number}</div>
                <div class="bidding-status-badge">${statusText}</div>
            </div>
            <div class="bidding-price">${item.amount.toLocaleString()}</div>
            <div class="bidding-details-overlay">
                <strong>Current Leader:</strong><br>
                ${item.bidder_name} ${leaderImgIcon} (${timeStr})
                <hr style="margin: 5px 0; border-color: rgba(255,255,255,0.2);">
                <strong>History:</strong><br>
                ${historyHtml || 'No history'}
            </div>
        `;
        grid.appendChild(card);

        if (!biddingAuctions[postUrl].items) biddingAuctions[postUrl].items = {};
        biddingAuctions[postUrl].items[item.item_number] = item;
    });
}

