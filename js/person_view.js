// ============================================
// PERSON VIEW PAGE SCRIPT
// ============================================

// Cloudinary configuration for main items (used by lot_view.js)
const CLOUDINARY_CLOUD_NAME = 'daye1yfzy';
const CLOUDINARY_UPLOAD_PRESET = 'bh_smry_upload';

// Separate Cloudinary account for reviews (to avoid storage limits)
const REVIEWS_CLOUDINARY_CLOUD_NAME = 'dt5jgkfwb'; // Reviews account
const REVIEWS_CLOUDINARY_UPLOAD_PRESET = 'review_strg'; // Reviews upload preset

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
    
    // Anyone can view any user's profile (for reviews)
    if (usernameParam) {
        targetUsername = usernameParam;
    } else {
        targetUsername = currentUser.username;
    }
    
    const isOwnProfile = targetUsername === currentUser.username;
    const isAdmin = currentUser.access_level.toLowerCase() === 'admin';
    
    document.getElementById('personTitle').textContent =
        isOwnProfile ? 'My Items' : `${targetUsername}'s Items`;
    document.getElementById('displayUsername').textContent = targetUsername;
    
    // Hide Payment History tab for viewers looking at other profiles
    const paymentTab = document.getElementById('paymentHistoryTab');
    if (paymentTab) {
        if (!isOwnProfile && !hasPermission('manage')) {
            paymentTab.style.display = 'none';
        } else {
            paymentTab.style.display = 'inline-block';
        }
    }
    
    // Hide lot details tab and stats if viewing someone else's profile (unless admin)
    if (!isOwnProfile && !isAdmin) {
        // Hide lot details tab
        document.getElementById('lotsTab').style.display = 'none';
        document.querySelector('.tab-btn[onclick="switchPersonTab(\'lots\')"]').style.display = 'none';
        
        // Hide only the stats summary (Total Items, Total Amount, Lots), keep the username visible
        const totalSummary = document.getElementById('totalSummary');
        if (totalSummary) {
            totalSummary.style.display = 'none';
        }
        
        // Auto-switch to reviews tab
        switchPersonTab('reviews');
    } else {
        // Show stats summary for own profile or admin
        const totalSummary = document.getElementById('totalSummary');
        if (totalSummary) {
            totalSummary.style.display = 'flex';
        }
    }
    
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
    
    // Get selected quality level
    const qualitySelector = document.getElementById('pngQuality');
    const canvasScale = parseInt(qualitySelector.value); // User-selected resolution scale factor
    
    try {
        // Replace each image with a canvas showing the cropped version
        
        for (const img of allImages) {
            const imgContainer = img.parentElement;
            const containerWidth = imgContainer.offsetWidth;
            const containerHeight = imgContainer.offsetHeight;
            
            // Create high-resolution canvas
            const canvas = document.createElement('canvas');
            canvas.width = containerWidth * canvasScale;
            canvas.height = containerHeight * canvasScale;
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
                drawHeight = containerHeight * canvasScale;
                drawWidth = drawHeight * imgAspect;
                offsetX = (containerWidth * canvasScale - drawWidth) / 2;
                offsetY = 0;
            } else {
                // Image is taller than container
                drawWidth = containerWidth * canvasScale;
                drawHeight = drawWidth / imgAspect;
                offsetX = 0;
                offsetY = (containerHeight * canvasScale - drawHeight) / 2;
            }
            
            // Draw the cropped image at high resolution
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
            scale: canvasScale,
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

// ==============================================================
// TAB SWITCHING & REVIEWS FUNCTIONALITY
// ==============================================================

let reviewPastedImage = null;

// Switch between tabs
function switchPersonTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        // Check if this button is for the target tab
        if ((tabName === 'lots' && btn.textContent.includes('Lot Details')) ||
            (tabName === 'reviews' && btn.textContent.includes('User Reviews')) ||
            (tabName === 'payments' && btn.textContent.includes('Payment History'))) {
            btn.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tabName === 'lots') {
        document.getElementById('lotsTab').classList.add('active');
    } else if (tabName === 'reviews') {
        document.getElementById('reviewsTab').classList.add('active');
        loadUserReviews();
    } else if (tabName === 'payments') {
        document.getElementById('paymentsTab').classList.add('active');
        loadPaymentHistory();
    }
}

// Load user reviews
async function loadUserReviews() {
    const container = document.getElementById('userReviewsContainer');
    container.innerHTML = '<div class="loading">Loading reviews...</div>';
    
    // Hide/show upload button based on whether viewing own profile
    const isOwnProfile = targetUsername === currentUser.username;
    const uploadBtn = document.querySelector('.btn-upload-review');
    
    try {
        // Show only visible reviews if viewing someone else's profile
        let query = supabaseClient
            .from('user_reviews')
            .select('*')
            .eq('username', targetUsername);
        
        // Non-admins viewing others can only see visible reviews
        if (!isOwnProfile && currentUser.access_level.toLowerCase() !== 'admin') {
            query = query.eq('status', 'visible');
        }
        
        const { data: reviews, error } = await query.order('created_at', { ascending: false });
        
        // Check review count and disable upload button if at limit
        if (uploadBtn && isOwnProfile) {
            const reviewCount = reviews ? reviews.length : 0;
            if (reviewCount >= 20) {
                uploadBtn.disabled = true;
                uploadBtn.style.opacity = '0.5';
                uploadBtn.style.cursor = 'not-allowed';
                uploadBtn.title = 'Maximum 20 reviews reached';
            } else {
                uploadBtn.disabled = false;
                uploadBtn.style.opacity = '1';
                uploadBtn.style.cursor = 'pointer';
                uploadBtn.title = 'Add Review Image';
                uploadBtn.style.display = 'inline-block';
            }
        } else if (uploadBtn) {
            uploadBtn.style.display = 'none';
        }
        
        if (error) throw error;
        
        if (!reviews || reviews.length === 0) {
            const emptyMessage = isOwnProfile 
                ? 'No reviews yet. Click "Add Review Image" to upload your first review!'
                : 'No reviews yet.';
            container.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">${emptyMessage}</div>`;
            return;
        }
        
        container.innerHTML = '';
        reviews.forEach(review => {
            const card = document.createElement('div');
            card.className = 'review-card';
            
            // Show delist/list and delete buttons only for own profile or admin
            const canManage = isOwnProfile || currentUser.access_level.toLowerCase() === 'admin';
            const isVisible = review.status === 'visible';
            
            let actionButtons = '';
            if (canManage) {
                const delistButton = isVisible 
                    ? `<button class="btn-delist-review" onclick="delistReview('${review.id}')">Delist</button>`
                    : `<button class="btn-list-review" onclick="listReview('${review.id}')">List</button>`;
                
                actionButtons = `<div class="review-actions">
                    ${delistButton}
                    <button class="btn-delete-review" onclick="deleteReview('${review.id}', '${review.image_url}')">Delete</button>
                   </div>`;
            }
            
            // Show status dot only for own profile
            const statusDot = isOwnProfile 
                ? `<span class="review-status-dot ${isVisible ? 'green' : 'red'}" title="${isVisible ? 'Visible' : 'Hidden'}"></span>`
                : '';
            
            card.innerHTML = `
                <img src="${review.image_url}" alt="Review" class="review-image" onclick="openReviewFullView('${review.image_url}')">
                ${statusDot}
                ${actionButtons}
            `;
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading reviews:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Failed to load reviews</div>';
    }
}

// Open upload review modal
async function openUploadReviewModal() {
    // Check review count before opening modal
    try {
        const { data: existingReviews, error } = await supabaseClient
            .from('user_reviews')
            .select('id')
            .eq('username', targetUsername);
        
        if (error) throw error;
        
        if (existingReviews && existingReviews.length >= 20) {
            alert('Maximum 20 reviews reached. Please delete some reviews before uploading new ones.');
            return;
        }
        
        document.getElementById('uploadReviewModal').style.display = 'block';
        setupReviewPasteArea();
        setTimeout(() => {
            document.getElementById('reviewPasteArea').focus();
        }, 100);
    } catch (error) {
        console.error('Error checking review count:', error);
        alert('Failed to open upload modal: ' + error.message);
    }
}

// Close upload review modal
function closeUploadReviewModal() {
    document.getElementById('uploadReviewModal').style.display = 'none';
    document.getElementById('uploadReviewForm').reset();
    document.getElementById('reviewFileInput').value = '';
    const pasteArea = document.getElementById('reviewPasteArea');
    pasteArea.classList.remove('has-image');
    pasteArea.onclick = () => document.getElementById('reviewFileInput').click(); // Restore onclick
    pasteArea.innerHTML = '<div class="paste-instructions">📎 Click to select image from files<br><small style="font-size: 0.875rem; opacity: 0.7;">or press Ctrl+V to paste</small></div>';
    reviewPastedImage = null;
}

// Setup paste area for reviews
function setupReviewPasteArea() {
    const pasteArea = document.getElementById('reviewPasteArea');
    
    pasteArea.addEventListener('paste', function(e) {
        e.preventDefault();
        const items = e.clipboardData.items;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                
                reader.onload = function(event) {
                    reviewPastedImage = event.target.result;
                    pasteArea.classList.add('has-image');
                    pasteArea.onclick = null; // Remove onclick to prevent re-triggering file picker
                    pasteArea.innerHTML = `<img src="${reviewPastedImage}" alt="Pasted image" title="Click to change image" style="cursor: pointer;">`;
                    
                    // Allow clicking the image to select a new one
                    pasteArea.querySelector('img').onclick = (e) => {
                        e.stopPropagation();
                        document.getElementById('reviewFileInput').click();
                    };
                };
                
                reader.readAsDataURL(blob);
                break;
            }
        }
    });
}

// Handle file selection for review image
function handleReviewFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('Image size should be less than 10MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        reviewPastedImage = e.target.result;
        const pasteArea = document.getElementById('reviewPasteArea');
        pasteArea.classList.add('has-image');
        pasteArea.onclick = null; // Remove onclick to prevent re-triggering file picker
        pasteArea.innerHTML = `<img src="${reviewPastedImage}" alt="Selected image" title="Click to change image" style="cursor: pointer;">`;
        
        // Allow clicking the image to select a new one
        pasteArea.querySelector('img').onclick = (e) => {
            e.stopPropagation();
            document.getElementById('reviewFileInput').click();
        };
    };
    reader.readAsDataURL(file);
}

// Upload review image
async function uploadReviewImage() {
    if (!reviewPastedImage) {
        alert('Please select or paste an image first!');
        return;
    }
    
    const uploadBtn = document.querySelector('#uploadReviewForm button[type="submit"]');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    try {
        // Check existing reviews count
        const { data: existingReviews, error: countError } = await supabaseClient
            .from('user_reviews')
            .select('id')
            .eq('username', targetUsername);
        
        if (countError) throw countError;
        
        // Check if user has reached the limit of 20 reviews
        if (existingReviews && existingReviews.length >= 20) {
            alert('Maximum 20 reviews reached. Please delete some reviews before uploading new ones.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload Review';
            return;
        }
        
        // Upload to Cloudinary
        const cloudinaryUrl = await uploadToCloudinaryFromPersonView(reviewPastedImage);
        
        // Insert new review (hidden by default)
        const { error } = await supabaseClient
            .from('user_reviews')
            .insert([{
                user_id: currentUser.id,
                username: targetUsername,
                image_url: cloudinaryUrl,
                status: 'hidden'
            }]);
        
        if (error) throw error;
        
        closeUploadReviewModal();
        loadUserReviews();
        
    } catch (error) {
        console.error('Error uploading review:', error);
        alert('Failed to upload review: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Review';
    }
}

// Upload to Cloudinary (from person view)
async function uploadToCloudinaryFromPersonView(base64Image) {
    const formData = new FormData();
    formData.append('file', base64Image);
    formData.append('upload_preset', REVIEWS_CLOUDINARY_UPLOAD_PRESET); // Use reviews account
    formData.append('folder', 'user_reviews');
    
    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${REVIEWS_CLOUDINARY_CLOUD_NAME}/image/upload`, // Use reviews account
        {
            method: 'POST',
            body: formData
        }
    );
    
    if (!response.ok) {
        throw new Error('Cloudinary upload failed');
    }
    
    const data = await response.json();
    return data.secure_url;
}

// Delete image from Cloudinary
// ==============================================================
// CLOUDINARY IMAGE CLEANUP (Manual Process)
// ==============================================================
// NOTE: Automatic image deletion from Cloudinary requires server-side implementation
// with your API secret for security reasons. This cannot be done safely from client-side.
//
// To manually clean up unused images:
// 1. Go to your Cloudinary dashboard: https://cloudinary.com/console
// 2. Navigate to Media Library > user_reviews folder
// 3. Delete images that are logged in the browser console
// 4. Or use Cloudinary's API from your server/backend
//
// For production, implement a server-side endpoint that:
// - Receives the image public_id
// - Uses cloudinary.uploader.destroy(public_id, options)
// - Returns success/failure status
// ==============================================================

// Open review image in full view
function openReviewFullView(imageUrl) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.9); display: flex; align-items: center;
        justify-content: center; z-index: 10000; cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        max-width: 90%; max-height: 90%; object-fit: contain;
        border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute; top: 20px; right: 20px;
        background: rgba(255, 255, 255, 0.9); color: #000;
        border: none; width: 40px; height: 40px; border-radius: 50%;
        font-size: 30px; cursor: pointer; display: flex;
        align-items: center; justify-content: center; transition: all 0.2s;
    `;
    
    closeBtn.onmouseover = () => {
        closeBtn.style.background = 'rgba(255, 255, 255, 1)';
        closeBtn.style.transform = 'scale(1.1)';
    };
    closeBtn.onmouseout = () => {
        closeBtn.style.background = 'rgba(255, 255, 255, 0.9)';
        closeBtn.style.transform = 'scale(1)';
    };
    
    const closeModal = () => document.body.removeChild(overlay);
    overlay.onclick = closeModal;
    closeBtn.onclick = closeModal;
    img.onclick = (e) => e.stopPropagation();
    
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

// Delete review
async function deleteReview(reviewId, imageUrl) {
    if (!confirm('Are you sure you want to delete this review?')) return;
    
    try {
        // Delete from database
        const { error } = await supabaseClient
            .from('user_reviews')
            .delete()
            .eq('id', reviewId);
        
        if (error) throw error;
        
        // Log image URL for manual cleanup
        console.log('Review deleted. Image URL (for manual Cloudinary cleanup):', imageUrl);
        
        loadUserReviews();
        
    } catch (error) {
        console.error('Error deleting review:', error);
    }
}

// Delist review (set status to hidden)
async function delistReview(reviewId) {
    if (!confirm('Are you sure you want to delist this review? It will no longer be visible on the homepage.')) return;
    
    try {
        const { error } = await supabaseClient
            .from('user_reviews')
            .update({ status: 'hidden', updated_at: new Date().toISOString() })
            .eq('id', reviewId);
        
        if (error) throw error;
        
        loadUserReviews();
        
    } catch (error) {
        console.error('Error delisting review:', error);
        alert('Failed to delist review: ' + error.message);
    }
}

// List review (set status to visible)
async function listReview(reviewId) {
    if (!confirm('Are you sure you want to list this review? It will be visible on the homepage.')) return;
    
    try {
        const { error } = await supabaseClient
            .from('user_reviews')
            .update({ status: 'visible', updated_at: new Date().toISOString() })
            .eq('id', reviewId);
        
        if (error) throw error;
        
        loadUserReviews();
        
    } catch (error) {
        console.error('Error listing review:', error);
        alert('Failed to list review: ' + error.message);
    }
}

// ==============================================================
// PAYMENT HISTORY FUNCTIONS
// ==============================================================

// Load payment history
async function loadPaymentHistory() {
    const container = document.getElementById('paymentHistoryContainer');
    
    // Check if user has permission to view this payment history
    const currentUser = getCurrentUser();
    const isOwnProfile = targetUsername === currentUser.username;
    
    if (!isOwnProfile && !hasPermission('manage')) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">You do not have permission to view this payment history</div>';
        return;
    }
    
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Loading payment history...</div>';
    
    try {
        const { data: payments, error } = await supabaseClient
            .from('payment_history')
            .select('*')
            .eq('username', targetUsername)
            .order('payment_date', { ascending: false });
        
        if (error) throw error;
        
        if (!payments || payments.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">No payment history found</div>';
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
        
        // Calculate total paid (count each batch only once, not per lot)
        const totalPaid = Object.values(paymentGroups).reduce((sum, group) => {
            return sum + parseFloat(group[0].amount || 0);
        }, 0);
        
        // Create table
        let tableHTML = `
            <div style="margin-bottom: 20px; padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #86efac;">
                <strong style="font-size: 1.1rem; color: #15803d;">Total Paid: ₹${totalPaid.toFixed(2)}</strong>
            </div>
            <table class="payment-history-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Lot Name(s)</th>
                        <th>Amount</th>
                        <th>Screenshots</th>
                        <th>Notes</th>
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
                imagesHTML = `<div style="display: flex; gap: 6px; flex-wrap: wrap;">`;
                imageUrls.forEach(url => {
                    imagesHTML += `<a href="${url}" target="_blank" style="display: block; width: 50px; height: 50px; overflow: hidden; border-radius: 6px; border: 2px solid #ddd; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">
                    </a>`;
                });
                imagesHTML += `</div>`;
            }
            
            tableHTML += `
                <tr>
                    <td>${date}</td>
                    <td><strong>${lotNames}</strong></td>
                    <td style="color: #15803d; font-weight: 600;">₹${parseFloat(payment.amount).toFixed(2)}</td>
                    <td>${imagesHTML}</td>
                    <td>${payment.notes || '-'}</td>
                </tr>
            `;
        });
        
        tableHTML += `
                </tbody>
            </table>
        `;
        
        container.innerHTML = tableHTML;
        
    } catch (error) {
        console.error('Error loading payment history:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Failed to load payment history</div>';
    }
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        clearSession();
        window.location.href = 'index.html';
    }
}
