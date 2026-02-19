// ============================================
// CHECKLIST VIEW PAGE LOGIC
// ============================================

let currentLot = null;
let checklistItems = [];

// Get lot ID and name from URL
function getLotInfo() {
    const params = new URLSearchParams(window.location.search);
    return {
        id: parseInt(params.get('lot_id')), // Parse as integer
        name: decodeURIComponent(params.get('lot_name') || 'Unknown Lot')
    };
}

// Initialize page
window.addEventListener('DOMContentLoaded', () => {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    const user = getCurrentUser();
    const userNameElement = document.getElementById('userName');
    userNameElement.textContent = user.username;
    
    // Only admin can access checklist
    if (user.access_level.toLowerCase() !== 'admin') {
        alert('Access Denied: Admin privileges required');
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Show admin panel button in header for admin only
    if (user.access_level.toLowerCase() === 'admin') {
        document.getElementById('adminPanelHeaderBtn').style.display = 'inline-block';
    }

    const lotInfo = getLotInfo();
    if (!lotInfo.id) {
        alert('No lot selected');
        window.location.href = 'admin_panel.html';
        return;
    }

    currentLot = lotInfo;
    document.getElementById('lotNameTitle').textContent = `${decodeURIComponent(lotInfo.name)} Checklist`;
    
    loadChecklistItems();
});

// Load checklist items
async function loadChecklistItems() {
    try {
        const { data, error } = await supabaseClient
            .from('items')
            .select('id, picture_url, checked, checklist_status, created_at')
            .eq('lot_id', currentLot.id)
            .order('created_at', { ascending: true });

        if (error) throw error;

        checklistItems = data || [];
        renderChecklist();
        updateStats();
    } catch (error) {
        console.error('Error loading checklist items:', error);
        document.getElementById('checklistGallery').innerHTML = 
            '<div class="loading">Error loading items: ' + error.message + '</div>';
    }
}

// Render checklist
function renderChecklist() {
    const gallery = document.getElementById('checklistGallery');
    gallery.innerHTML = '';

    if (checklistItems.length === 0) {
        gallery.innerHTML = `
            <div class="no-items">
                <h3>No items in this lot</h3>
                <p>There are no items to check.</p>
            </div>
        `;
        return;
    }

    gallery.className = 'checklist-gallery';
    
    checklistItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'checklist-item';
        
        // Get status: use checklist_status if available, fallback to checked boolean
        const status = item.checklist_status || (item.checked ? 'checked' : 'unchecked');
        
        if (status === 'checked') {
            itemDiv.classList.add('checked');
        } else if (status === 'rejected') {
            itemDiv.classList.add('rejected');
        }
        
        // Use picture_url if available, otherwise show a placeholder message
        const imageUrl = item.picture_url || '';
        console.log(`Item ${index + 1}:`, item.id, 'Image URL:', imageUrl, 'Status:', status);
        
        itemDiv.innerHTML = `
            <div class="item-image-container">
                ${imageUrl ? `<img src="${imageUrl}" alt="Item" onerror="console.error('Failed to load image:', '${imageUrl}')">` : '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999; font-size: 0.75rem;">No Image</div>'}
            </div>
            <div class="checked-overlay">
                <div class="check-icon">✓</div>
            </div>
            <div class="rejected-overlay">
                <div class="reject-icon">✕</div>
            </div>
        `;
        
        itemDiv.onclick = () => toggleChecked(item.id);
        
        gallery.appendChild(itemDiv);
    });
}

// Toggle checked status - cycles through unchecked → checked → rejected → unchecked
async function toggleChecked(itemId) {
    try {
        const item = checklistItems.find(i => i.id === itemId);
        if (!item) return;
        
        // Get current status
        const currentStatus = item.checklist_status || (item.checked ? 'checked' : 'unchecked');
        
        // Cycle through states: unchecked → checked → rejected → unchecked
        let newStatus;
        if (currentStatus === 'unchecked' || !currentStatus) {
            newStatus = 'checked';
        } else if (currentStatus === 'checked') {
            newStatus = 'rejected';
        } else { // rejected
            newStatus = 'unchecked';
        }
        
        const { error } = await supabaseClient
            .from('items')
            .update({ 
                checklist_status: newStatus,
                checked: newStatus === 'checked' // Keep checked boolean for backward compatibility
            })
            .eq('id', itemId);
        
        if (error) throw error;
        
        // Update local data
        item.checklist_status = newStatus;
        item.checked = (newStatus === 'checked');
        
        // Re-render
        renderChecklist();
        updateStats();
        
    } catch (error) {
        console.error('Error toggling checked status:', error);
        alert('Failed to update item status: ' + error.message);
    }
}

// Update stats (removed - no longer displaying stats summary)
function updateStats() {
    // Stats display removed - no longer needed
}

// Check all items
async function checkAllItems() {
    try {
        const itemIds = checklistItems.map(item => item.id);
        
        const { error } = await supabaseClient
            .from('items')
            .update({ 
                checked: true,
                checklist_status: 'checked'
            })
            .in('id', itemIds);
        
        if (error) throw error;
        
        // Reload to reflect changes
        await loadChecklistItems();
    } catch (error) {
        console.error('Error checking all items:', error);
        alert('Failed to check all items: ' + error.message);
    }
}

// Reset all items (uncheck all)
async function resetAllItems() {
    try {
        const itemIds = checklistItems.map(item => item.id);
        
        const { error } = await supabaseClient
            .from('items')
            .update({ 
                checked: false,
                checklist_status: 'unchecked'
            })
            .in('id', itemIds);
        
        if (error) throw error;
        
        // Reload to reflect changes
        await loadChecklistItems();
    } catch (error) {
        console.error('Error resetting items:', error);
        alert('Failed to reset items: ' + error.message);
    }
}

// Go back to admin panel with checklist section selected
function goBackToAdminPanel() {
    window.location.href = 'admin_panel.html?section=checklist';
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        clearSession();
        window.location.href = 'index.html';
    }
}

