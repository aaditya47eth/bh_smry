// ============================================
// PERSON VIEW PAGE SCRIPT
// ============================================

let currentUser = null;
let targetUsername = null;
let allLotsData = [];
let currentFilters = {
    status: 'all',
    paymentStatus: 'all'
};
let zoomLevel = 100; // Default zoom level (80% of original = new 100%)

// Check authentication on page load
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
    
    // Show/hide login/logout buttons based on guest status
    if (currentUser.id === 'guest') {
        document.getElementById('logoutBtn').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'inline-block';
    } else {
        document.getElementById('logoutBtn').style.display = 'inline-block';
        document.getElementById('loginBtn').style.display = 'none';
    }
    
    // Show admin panel button in header for admin only
    if (currentUser.access_level.toLowerCase() === 'admin') {
        document.getElementById('adminPanelHeaderBtn').style.display = 'inline-block';
    }
    
    // Get username from URL parameter or use current user
    const urlParams = new URLSearchParams(window.location.search);
    const usernameParam = urlParams.get('username');
    
    // Admin can view any user, others can only view themselves
    if (usernameParam && currentUser.access_level === 'admin') {
        targetUsername = usernameParam;
    } else {
        targetUsername = currentUser.username;
    }
    
    document.getElementById('personTitle').textContent = 
        targetUsername === currentUser.username ? 'My Items' : `${targetUsername}'s Items`;
    document.getElementById('displayUsername').textContent = targetUsername;
    
    // Apply initial zoom
    applyZoom();
    updateZoomSlider();
    
    loadUserItems();
});

// Load all items for the user across all lots
async function loadUserItems() {
    const container = document.getElementById('lotsContainer');
    
    try {
        // Fetch items for this user with lot information
        const { data: allItems, error } = await supabaseClient
            .from('items')
            .select('*, lots(id, lot_name)')
            .eq('username', targetUsername)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        // Filter out cancelled items
        const items = allItems ? allItems.filter(item => !item.cancelled) : [];
        
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="no-items">
                    <h3>No items yet</h3>
                    <p>This user hasn't added any items yet.</p>
                </div>
            `;
            return;
        }
        
        // Get unique lot IDs
        const lotIds = [...new Set(items.map(item => item.lot_id))];
        
        // Fetch user-specific status for each lot
        const { data: statusData, error: statusError } = await supabaseClient
            .from('user_lot_status')
            .select('*')
            .eq('username', targetUsername)
            .in('lot_id', lotIds);
        
        if (statusError) throw statusError;
        
        // Create a map of lot statuses
        const statusMap = {};
        (statusData || []).forEach(status => {
            statusMap[status.lot_id] = {
                deliveryStatus: status.delivery_status || 'Yet to arrive',
                paymentStatus: status.payment_status || 'Unpaid'
            };
        });
        
        // Group items by lot
        const lotGroups = {};
        
        items.forEach(item => {
            const lotId = item.lots?.id || 'unknown';
            const lotName = item.lots?.lot_name || 'Unknown Lot';
            const userStatus = statusMap[lotId] || { deliveryStatus: 'Yet to arrive', paymentStatus: 'Unpaid' };
            
            if (!lotGroups[lotId]) {
                lotGroups[lotId] = {
                    id: lotId,
                    name: lotName,
                    status: userStatus.deliveryStatus,
                    paymentStatus: userStatus.paymentStatus,
                    items: []
                };
            }
            lotGroups[lotId].items.push(item);
        });
        
        allLotsData = Object.values(lotGroups);
        filterAndDisplayLots();
        
    } catch (error) {
        console.error('Error loading user items:', error);
        container.innerHTML = `
            <div class="no-items">
                <h3>Error loading items</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Filter and display lots based on current filters
function filterAndDisplayLots() {
    const container = document.getElementById('lotsContainer');
    
    // Apply filters
    const filteredLots = allLotsData.filter(lot => {
        const statusMatch = currentFilters.status === 'all' || lot.status === currentFilters.status;
        const paymentMatch = currentFilters.paymentStatus === 'all' || lot.paymentStatus === currentFilters.paymentStatus;
        return statusMatch && paymentMatch;
    });
    
    if (filteredLots.length === 0) {
        container.innerHTML = `
            <div class="no-items">
                <h3>No lots match the selected filters</h3>
                <p>Try adjusting your filters.</p>
            </div>
        `;
        return;
    }
    
    // Calculate totals
    let totalItems = 0;
    let totalAmount = 0;
    
    filteredLots.forEach(lot => {
        totalItems += lot.items.length;
        lot.items.forEach(item => {
            totalAmount += parseFloat(item.price);
        });
    });
    
    // Display summary
    document.getElementById('totalSummary').innerHTML = `
        <div class="summary-item">
            <span class="summary-label">Total Items</span>
            <span class="summary-value">${totalItems}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Total Amount</span>
            <span class="summary-value">${totalAmount.toFixed(0)}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Lots</span>
            <span class="summary-value">${filteredLots.length}</span>
        </div>
    `;
    
    // Display items
    container.innerHTML = '';
    container.className = 'items-main-container';
    
    const lotsWrapper = document.createElement('div');
    lotsWrapper.className = 'lots-wrapper';
    
    filteredLots.forEach(lot => {
        const lotTotal = lot.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
        
        const lotContainer = document.createElement('div');
        lotContainer.className = 'lot-container';
        lotContainer.style.cursor = 'pointer';
        lotContainer.onclick = () => {
            window.location.href = `lot_view.html?lot_id=${lot.id}&lot_name=${encodeURIComponent(lot.name)}`;
        };
        
        // Add lot header with badges
        const lotHeader = document.createElement('div');
        lotHeader.className = 'lot-header';
        
        const statusClass = lot.status.replace(/\s+/g, '-').toLowerCase();
        const paymentClass = lot.paymentStatus.toLowerCase();
        
        // Create badges as dropdowns for admin/manager, regular badges for viewers
        const canEdit = currentUser && (currentUser.access_level === 'admin' || currentUser.access_level === 'manager');
        
        let statusBadgeHTML, paymentBadgeHTML;
        
        if (canEdit) {
            // Editable dropdowns for admin/manager
            statusBadgeHTML = `
                <select class="status-badge-select ${statusClass}" onchange="updateLotStatus('${lot.id}', this.value, this)" onclick="event.stopPropagation()">
                    <option value="Yet to arrive" ${lot.status === 'Yet to arrive' ? 'selected' : ''}>Yet to arrive</option>
                    <option value="Arrived" ${lot.status === 'Arrived' ? 'selected' : ''}>Arrived</option>
                    <option value="Delivered" ${lot.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                </select>
            `;
            paymentBadgeHTML = `
                <select class="payment-badge-select ${paymentClass}" onchange="updateLotPaymentStatus('${lot.id}', this.value, this)" onclick="event.stopPropagation()">
                    <option value="Paid" ${lot.paymentStatus === 'Paid' ? 'selected' : ''}>Paid</option>
                    <option value="Unpaid" ${lot.paymentStatus === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
                </select>
            `;
        } else {
            // Regular badges for viewers
            statusBadgeHTML = `<span class="status-badge ${statusClass}">${lot.status}</span>`;
            paymentBadgeHTML = `<span class="payment-badge ${paymentClass}">${lot.paymentStatus}</span>`;
        }
        
        lotHeader.innerHTML = `
            <div class="lot-header-left">
                <span class="lot-name">${lot.name}</span>
                <div class="lot-badges">
                    ${statusBadgeHTML}
                    ${paymentBadgeHTML}
                </div>
            </div>
            <span class="lot-total">${lotTotal.toFixed(0)}</span>
        `;
        lotContainer.appendChild(lotHeader);
        
        // Add items grid
        const itemsGrid = document.createElement('div');
        itemsGrid.className = 'lot-items-grid';
        
        lot.items.forEach(item => {
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';
            
            itemCard.innerHTML = `
                <div class="price">${item.price}</div>
                <div class="item-image-container">
                    <img src="${item.picture_url}" alt="${targetUsername}" class="item-image" crossorigin="anonymous">
                </div>
            `;
            
            itemsGrid.appendChild(itemCard);
        });
        
        lotContainer.appendChild(itemsGrid);
        lotsWrapper.appendChild(lotContainer);
    });
    
    container.appendChild(lotsWrapper);
}

// Apply filters
function applyFilters() {
    const statusFilter = document.getElementById('statusFilter').value;
    const paymentFilter = document.getElementById('paymentFilter').value;
    
    currentFilters.status = statusFilter;
    currentFilters.paymentStatus = paymentFilter;
    
    filterAndDisplayLots();
}

// Update lot status (user-specific delivery status)
async function updateLotStatus(lotId, newStatus, selectElement) {
    try {
        // Upsert user-specific delivery status and mark as manually set
        const { error } = await supabaseClient
            .from('user_lot_status')
            .upsert({ 
                lot_id: lotId, 
                username: targetUsername, 
                delivery_status: newStatus,
                is_manually_set: true // Mark that this was manually changed by user
            }, {
                onConflict: 'lot_id,username'
            });
        
        if (error) throw error;
        
        // Update the select element's class immediately
        if (selectElement) {
            const newClass = newStatus.replace(/\s+/g, '-').toLowerCase();
            selectElement.className = `status-badge-select ${newClass}`;
        }
        
        // Update local data
        const lot = allLotsData.find(l => l.id === lotId);
        if (lot) {
            lot.status = newStatus;
            filterAndDisplayLots();
        }
    } catch (error) {
        console.error('Error updating delivery status:', error);
        alert('Failed to update delivery status: ' + error.message);
        // Reload to reset
        loadUserItems();
    }
}

// Update lot payment status (user-specific)
async function updateLotPaymentStatus(lotId, newPaymentStatus, selectElement) {
    try {
        // Upsert user-specific payment status
        const { error } = await supabaseClient
            .from('user_lot_status')
            .upsert({ 
                lot_id: lotId, 
                username: targetUsername, 
                payment_status: newPaymentStatus 
            }, {
                onConflict: 'lot_id,username'
            });
        
        if (error) throw error;
        
        // Update the select element's class immediately
        if (selectElement) {
            const newClass = newPaymentStatus.toLowerCase();
            selectElement.className = `payment-badge-select ${newClass}`;
        }
        
        // Update local data
        const lot = allLotsData.find(l => l.id === lotId);
        if (lot) {
            lot.paymentStatus = newPaymentStatus;
            filterAndDisplayLots();
        }
    } catch (error) {
        console.error('Error updating payment status:', error);
        alert('Failed to update payment status: ' + error.message);
        // Reload to reset
        loadUserItems();
    }
}

// Generate PNG with proper image cropping
async function generatePersonViewPNG() {
    const mainContainer = document.querySelector('.container');
    const button = event.target;
    
    button.disabled = true;
    button.textContent = 'Generating...';
    
    // Hide the generate PNG button temporarily
    button.style.display = 'none';
    
    // Get all images
    const allImages = mainContainer.querySelectorAll('.item-image');
    const replacements = [];
    
    try {
        // Replace each image with a canvas showing the cropped version
        for (const img of allImages) {
            const imgContainer = img.parentElement;
            const containerWidth = imgContainer.offsetWidth;
            const containerHeight = imgContainer.offsetHeight;
            
            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = containerWidth;
            canvas.height = containerHeight;
            canvas.style.width = containerWidth + 'px';
            canvas.style.height = containerHeight + 'px';
            canvas.style.borderRadius = '8px';
            
            const ctx = canvas.getContext('2d');
            
            // Calculate scaling to cover (same as object-fit: cover)
            const imgAspect = img.naturalWidth / img.naturalHeight;
            const containerAspect = containerWidth / containerHeight;
            
            let drawWidth, drawHeight, offsetX, offsetY;
            
            if (imgAspect > containerAspect) {
                // Image is wider than container
                drawHeight = containerHeight;
                drawWidth = drawHeight * imgAspect;
                offsetX = (containerWidth - drawWidth) / 2;
                offsetY = 0;
            } else {
                // Image is taller than container
                drawWidth = containerWidth;
                drawHeight = drawWidth / imgAspect;
                offsetX = 0;
                offsetY = (containerHeight - drawHeight) / 2;
            }
            
            // Draw the cropped image
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
            
            // Store original for restoration
            replacements.push({ canvas, img, container: imgContainer });
            
            // Replace image with canvas
            imgContainer.replaceChild(canvas, img);
        }
        
        // Wait a moment for DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Generate PNG with html2canvas - capturing the entire container including user info and filters
        const finalCanvas = await html2canvas(mainContainer, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: false,
            imageTimeout: 0
        });
        
        // Restore original images
        replacements.forEach(({ canvas, img, container }) => {
            container.replaceChild(img, canvas);
        });
        
        // Show the button again
        button.style.display = 'inline-block';
        
        // Download the PNG
        finalCanvas.toBlob(function(blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0, 10);
            link.download = `${targetUsername}-items-${timestamp}.png`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            
            button.disabled = false;
            button.textContent = 'Generate PNG';
        });
    } catch (error) {
        console.error('Error generating PNG:', error);
        alert('Error generating PNG: ' + error.message);
        
        // Restore images in case of error
        replacements.forEach(({ canvas, img, container }) => {
            if (canvas.parentElement === container) {
                container.replaceChild(img, canvas);
            }
        });
        
        // Show the button again
        button.style.display = 'inline-block';
        
        button.disabled = false;
        button.textContent = '📸 Generate PNG';
    }
}

// Zoom control functions
function setZoomLevel(zoom) {
    zoomLevel = parseInt(zoom);
    applyZoom();
    document.getElementById('zoomLevel').textContent = zoomLevel + '%';
}

function increaseZoom() {
    zoomLevel = Math.min(150, zoomLevel + 10);
    applyZoom();
    updateZoomSlider();
}

function decreaseZoom() {
    zoomLevel = Math.max(50, zoomLevel - 10);
    applyZoom();
    updateZoomSlider();
}

function resetZoom() {
    zoomLevel = 100;
    applyZoom();
    updateZoomSlider();
}

function applyZoom() {
    const container = document.getElementById('lotsContainer');
    if (container) {
        // 100% zoom = 80% of original size (0.8 scale factor)
        const scaleFactor = (zoomLevel * 0.8) / 100;
        container.style.transform = `scale(${scaleFactor})`;
        container.style.transformOrigin = 'top left';
        container.style.width = `${100 / scaleFactor}%`;
    }
}

function updateZoomSlider() {
    document.getElementById('zoomSlider').value = zoomLevel;
    document.getElementById('zoomLevel').textContent = zoomLevel + '%';
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        clearSession();
        window.location.href = 'index.html';
    }
}
