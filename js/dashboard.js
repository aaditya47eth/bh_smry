// ============================================
// DASHBOARD PAGE LOGIC
// ============================================

let currentUser = null;

// Check authentication
window.addEventListener('DOMContentLoaded', () => {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    userNameElement.textContent = currentUser.username;
    
    // Make username clickable only for non-guest users
    if (currentUser.id !== 'guest') {
        userNameElement.style.cursor = 'pointer';
        userNameElement.onclick = () => {
            window.location.href = 'person_view.html';
        };
    }
    
    // Show admin panel button for admin only
    if (currentUser.access_level.toLowerCase() === 'admin') {
        document.getElementById('adminPanelBtn').style.display = 'flex';
    }
    
    // Show create button for admin/manager only
    if (hasPermission('add')) {
        document.getElementById('createLotBtn').style.display = 'flex';
    }
    
    loadLots();
});

async function loadLots() {
    try {
        let query = supabaseClient
            .from('lots')
            .select('*');
        
        // If viewer, only show lots that are NOT "Going on"
        const user = getCurrentUser();
        if (user && user.access_level.toLowerCase() === 'viewer') {
            query = query.neq('status', 'Going on');
        }

        const { data: lots, error } = await query;

        if (error) throw error;

        // Sort lots numerically by extracting number from lot_name
        const sortedLots = lots.sort((a, b) => {
            const numA = parseInt(a.lot_name.match(/(\d+)$/)?.[1] || '0');
            const numB = parseInt(b.lot_name.match(/(\d+)$/)?.[1] || '0');
            return numA - numB;
        });

        displayLots(sortedLots);
    } catch (error) {
        console.error('Error loading lots:', error);
        document.getElementById('lotsContainer').innerHTML = 
            '<div class="no-lots"><h3>Error loading lots</h3></div>';
    }
}

function displayLots(lots) {
    const container = document.getElementById('lotsContainer');

    if (!lots || lots.length === 0) {
        container.innerHTML = `
            <div class="no-lots">
                <h3>No lots yet</h3>
                <p>Create your first lot to get started!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    container.className = 'lots-grid';

    lots.forEach(lot => {
        const card = document.createElement('div');
        card.className = 'lot-card';
        
        // Format date
        const createdDate = new Date(lot.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        // Check if user can delete (admin/manager only)
        const canDelete = hasPermission('delete');
        
        const statusDropdown = canDelete ? `
            <select class="lot-status-dropdown" onchange="updateLotStatus('${lot.id}', this.value)" onclick="event.stopPropagation()">
                <option value="Going on" ${(lot.status || 'Going on') === 'Going on' ? 'selected' : ''}>Going on</option>
                <option value="Yet to arrive" ${lot.status === 'Yet to arrive' ? 'selected' : ''}>Yet to arrive</option>
                <option value="Arrived" ${lot.status === 'Arrived' ? 'selected' : ''}>Arrived</option>
            </select>
        ` : `<div class="lot-status-badge ${lot.status ? lot.status.replace(/\s+/g, '-').toLowerCase() : 'going-on'}">${lot.status || 'Going on'}</div>`;
        
        card.innerHTML = `
            <div class="lot-card-image">
                <img src="https://res.cloudinary.com/daye1yfzy/image/upload/v1761836036/5d44bf3a-5835-4861-a545-4062a1d845e6.png" alt="Lot Icon">
            </div>
            <div class="lot-card-content" onclick="viewLot('${lot.id}', '${lot.lot_name.replace(/'/g, "\\'")}')">
                <div class="lot-name">${lot.lot_name}</div>
                <div class="lot-date">${createdDate}</div>
                ${statusDropdown}
            </div>
            ${canDelete ? `
                <div class="lot-menu">
                    <button class="menu-btn" onclick="event.stopPropagation(); toggleMenu(event, '${lot.id}')">⋮</button>
                    <div class="menu-dropdown" id="menu-${lot.id}">
                        <button onclick="event.stopPropagation(); openRenameLot('${lot.id}', '${lot.lot_name.replace(/'/g, "\\'")}')">Rename</button>
                        <button class="delete-menu-item" onclick="event.stopPropagation(); deleteLot('${lot.id}', '${lot.lot_name.replace(/'/g, "\\'")}')">Delete</button>
                    </div>
                </div>
            ` : ''}
        `;
        
        container.appendChild(card);
    });
}

function viewLot(lotId, lotName) {
    window.location.href = `lot_view.html?lot_id=${lotId}&lot_name=${encodeURIComponent(lotName)}`;
}

// Toggle three-dot menu
function toggleMenu(event, lotId) {
    event.stopPropagation();
    const menu = document.getElementById(`menu-${lotId}`);
    const allMenus = document.querySelectorAll('.menu-dropdown');
    
    // Close all other menus
    allMenus.forEach(m => {
        if (m.id !== `menu-${lotId}`) {
            m.classList.remove('show');
        }
    });
    
    // Toggle current menu
    menu.classList.toggle('show');
}

// Close menu when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.lot-menu')) {
        const allMenus = document.querySelectorAll('.menu-dropdown');
        allMenus.forEach(m => m.classList.remove('show'));
    }
});

async function openCreateModal() {
    document.getElementById('createLotModal').style.display = 'block';
    
    // Auto-generate next lot name based on highest lot number (not most recent date)
    try {
        const { data: lots, error } = await supabaseClient
            .from('lots')
            .select('lot_name');
        
        if (!error && lots && lots.length > 0) {
            // Extract all numbers from lot names
            let maxNumber = 0;
            let baseName = 'Lot ';
            
            lots.forEach(lot => {
                const match = lot.lot_name.match(/(\d+)$/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > maxNumber) {
                        maxNumber = num;
                        baseName = lot.lot_name.replace(/\d+$/, '');
                    }
                }
            });
            
            if (maxNumber > 0) {
                const nextNumber = maxNumber + 1;
                document.getElementById('lotName').value = baseName + nextNumber;
                console.log(`Highest lot number found: ${maxNumber}, suggesting: ${baseName}${nextNumber}`);
            } else {
                // No numbers found in any lot names
                document.getElementById('lotName').value = 'Lot 1';
            }
        } else {
            // First lot
            document.getElementById('lotName').value = 'Lot 1';
        }
    } catch (error) {
        console.error('Error generating lot name:', error);
        document.getElementById('lotName').value = 'Lot 1';
    }
}

function closeCreateModal() {
    document.getElementById('createLotModal').style.display = 'none';
    document.getElementById('createLotForm').reset();
}

document.getElementById('createLotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const lotName = document.getElementById('lotName').value.trim();
    const lotDescription = document.getElementById('lotDescription').value.trim();
    const lotStatus = document.getElementById('lotStatus').value;

    try {
        const { data, error } = await supabaseClient
            .from('lots')
            .insert([{
                lot_name: lotName,
                description: lotDescription,
                status: lotStatus,
                created_by_user_id: currentUser.id
            }])
            .select();

        if (error) throw error;

        closeCreateModal();
        loadLots(); // Reload lots
        alert('Lot created successfully!');
    } catch (error) {
        console.error('Error creating lot:', error);
        alert('Failed to create lot. Maybe the name already exists?');
    }
});

// Open rename lot modal
function openRenameLot(lotId, currentName) {
    document.getElementById('renameLotId').value = lotId;
    document.getElementById('renameLotInput').value = currentName;
    document.getElementById('renameLotModal').style.display = 'block';
    
    // Close the three-dot menu
    const allMenus = document.querySelectorAll('.menu-dropdown');
    allMenus.forEach(m => m.classList.remove('show'));
}

// Close rename lot modal
function closeRenameLotModal() {
    document.getElementById('renameLotModal').style.display = 'none';
    document.getElementById('renameLotForm').reset();
}

// Update lot status directly from dropdown
async function updateLotStatus(lotId, newStatus) {
    try {
        const { error } = await supabaseClient
            .from('lots')
            .update({ status: newStatus })
            .eq('id', lotId);
        
        if (error) throw error;
        
        loadLots(); // Reload lots
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Failed to update status: ' + error.message);
        loadLots(); // Reload to reset the dropdown
    }
}

// Rename lot form handler
document.addEventListener('DOMContentLoaded', () => {
    const renameForm = document.getElementById('renameLotForm');
    if (renameForm) {
        renameForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const lotId = document.getElementById('renameLotId').value;
            const newName = document.getElementById('renameLotInput').value.trim();
            
            if (!newName) {
                alert('Please enter a lot name');
                return;
            }
            
            try {
                const { error } = await supabaseClient
                    .from('lots')
                    .update({ lot_name: newName })
                    .eq('id', lotId);
                
                if (error) throw error;
                
                closeRenameLotModal();
                loadLots(); // Reload lots
            } catch (error) {
                console.error('Error renaming lot:', error);
                alert('Failed to rename lot. Maybe the name already exists?');
            }
        });
    }
});

// Delete lot
async function deleteLot(lotId, lotName) {
    if (!confirm(`Are you sure you want to delete the lot "${lotName}"?\n\nThis will also delete all items in this lot.`)) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('lots')
            .delete()
            .eq('id', lotId);
        
        if (error) throw error;
        
        loadLots(); // Reload lots
    } catch (error) {
        console.error('Error deleting lot:', error);
        alert('Failed to delete lot: ' + error.message);
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        clearSession();
        window.location.href = 'index.html';
    }
}

// Close modals when clicking outside
window.onclick = function(event) {
    const createModal = document.getElementById('createLotModal');
    const renameModal = document.getElementById('renameLotModal');
    
    if (event.target === createModal) {
        closeCreateModal();
    }
    if (event.target === renameModal) {
        closeRenameLotModal();
    }
}
