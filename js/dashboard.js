// ============================================
// DASHBOARD PAGE LOGIC
// ============================================

let currentUser = null;
let allLots = [];
let displayedLotsCount = 7; // Will be set based on user permissions

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
    
    // Show month filter for admin/manager only
    if (hasPermission('add')) {
        document.getElementById('monthFilter').style.display = 'block';
        displayedLotsCount = 7; // Admin/Manager: 7 lots + 1 "Create New" card = 8 total
    } else {
        displayedLotsCount = 8; // Viewers: 8 lots (no "Create New" card)
    }
    
    loadLots();
    
    // Load live reviews for slider
    loadLiveReviews();
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

        // Sort lots numerically by extracting number from lot_name (descending order)
        const sortedLots = lots.sort((a, b) => {
            const numA = parseInt(a.lot_name.match(/(\d+)$/)?.[1] || '0');
            const numB = parseInt(b.lot_name.match(/(\d+)$/)?.[1] || '0');
            return numB - numA; // Descending order
        });

        allLots = sortedLots;
        populateMonthFilter(sortedLots);
        filterLotsByMonth();
    } catch (error) {
        console.error('Error loading lots:', error);
        document.getElementById('lotsContainer').innerHTML = 
            '<div class="no-lots"><h3>Error loading lots</h3></div>';
    }
}

function populateMonthFilter(lots) {
    const monthFilter = document.getElementById('monthFilter');
    if (!monthFilter) return;
    
    const months = new Set();
    lots.forEach(lot => {
        const date = new Date(lot.created_at);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(monthYear);
    });
    
    const sortedMonths = Array.from(months).sort().reverse();
    
    monthFilter.innerHTML = '<option value="all">All Months</option>';
    sortedMonths.forEach(monthYear => {
        const [year, month] = monthYear.split('-');
        const date = new Date(year, month - 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const option = document.createElement('option');
        option.value = monthYear;
        option.textContent = monthName;
        monthFilter.appendChild(option);
    });
    
    // Set default to current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (Array.from(months).includes(currentMonth)) {
        monthFilter.value = currentMonth;
    }
}

function filterLotsByMonth() {
    const monthFilter = document.getElementById('monthFilter');
    if (!monthFilter) {
        displayLots(allLots);
        return;
    }
    
    const selectedMonth = monthFilter.value;
    
    // Reset displayed count when filtering (based on user permissions)
    displayedLotsCount = hasPermission('add') ? 7 : 8;
    
    if (selectedMonth === 'all') {
        displayLots(allLots);
        return;
    }
    
    const filteredLots = allLots.filter(lot => {
        const date = new Date(lot.created_at);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return monthYear === selectedMonth;
    });
    
    displayLots(filteredLots);
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
    const gridContainer = document.createElement('div');
    gridContainer.className = 'lots-grid';

    // Add "Create New Lot" card if user has permission
    if (hasPermission('add')) {
        const createCard = document.createElement('div');
        createCard.className = 'lot-card create-lot-card';
        createCard.onclick = () => openCreateModal();
        createCard.innerHTML = `
            <div class="create-lot-content">
                <div class="create-icon">+</div>
                <div class="create-text">Create New Lot</div>
            </div>
        `;
        gridContainer.appendChild(createCard);
    }

    // Display only the first 'displayedLotsCount' lots
    const lotsToShow = lots.slice(0, displayedLotsCount);
    
    lotsToShow.forEach(lot => {
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
            <div class="lot-card-content" onclick="viewLot('${lot.id}', '${lot.lot_name.replace(/'/g, "\\'")}')">
                <div class="lot-header">
                    <div class="lot-name">${lot.lot_name}</div>
                    <div class="lot-divider"></div>
                    <div class="lot-date">${createdDate}</div>
                </div>
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
        
        gridContainer.appendChild(card);
    });
    
    container.appendChild(gridContainer);
    
    // Add "Show More" button if there are more lots to display
    if (lots.length > displayedLotsCount) {
        const showMoreBtn = document.createElement('button');
        showMoreBtn.className = 'show-more-btn';
        showMoreBtn.innerHTML = `
            Show More (${lots.length - displayedLotsCount} remaining)
            <span class="arrow-down">▼</span>
        `;
        showMoreBtn.onclick = () => {
            displayedLotsCount += 7;
            displayLots(lots);
        };
        container.appendChild(showMoreBtn);
    }
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

    try {
        const { data, error } = await supabaseClient
            .from('lots')
            .insert([{
                lot_name: lotName,
                description: lotDescription,
                status: 'Going on',
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

// Guest login - clear session and go to login page
function guestLogin() {
    clearSession();
    window.location.href = 'index.html';
}

// ==============================================================
// LIVE REVIEWS SLIDER
// ==============================================================

// Shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

async function loadLiveReviews() {
    try {
        const { data: reviews, error } = await supabaseClient
            .from('user_reviews')
            .select('*')
            .eq('status', 'visible')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!reviews || reviews.length === 0) {
            // Hide slider if no reviews
            document.getElementById('reviewsSliderContainer').style.display = 'none';
            return;
        }
        
        // Show slider
        document.getElementById('reviewsSliderContainer').style.display = 'block';
        
        const track = document.getElementById('reviewsTrack');
        track.innerHTML = '';
        
        // Randomize the order of reviews and repeat 3 times for infinite scroll effect
        const shuffledReviews = shuffleArray(reviews);
        const displayReviews = [...shuffledReviews, ...shuffledReviews, ...shuffledReviews];
        
        displayReviews.forEach(review => {
            const slide = document.createElement('div');
            slide.className = 'review-slide';
            slide.innerHTML = `
                <img src="${review.image_url}" alt="${review.username}'s review">
                <div class="review-username">${review.username}</div>
            `;
            
            // Click to view full image
            slide.onclick = () => openReviewImageModal(review.image_url, review.username);
            
            track.appendChild(slide);
        });
        
        // Start auto-scrolling after reviews are loaded
        setTimeout(() => {
            hasSetupListeners = false; // Reset before starting
            startAutoScroll();
        }, 500);
        
    } catch (error) {
        console.error('Error loading live reviews:', error);
        document.getElementById('reviewsSliderContainer').style.display = 'none';
    }
}

// Scroll reviews left or right
function scrollReviews(direction) {
    const slider = document.getElementById('reviewsSlider');
    if (!slider) return;
    
    const scrollAmount = 300; // Scroll by ~2 images
    
    // Temporarily pause auto-scroll
    stopAutoScroll();
    
    // Smooth manual scroll
    const startScroll = slider.scrollLeft;
    const targetScroll = direction === 'left' 
        ? startScroll - scrollAmount 
        : startScroll + scrollAmount;
    
    const duration = 300; // milliseconds
    const startTime = performance.now();
    
    function animateScroll(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        slider.scrollLeft = startScroll + (targetScroll - startScroll) * easeOut;
        
        if (progress < 1) {
            requestAnimationFrame(animateScroll);
        } else {
            // Resume auto-scroll after manual scroll completes
            setTimeout(() => {
                if (!isAutoScrolling) {
                    startAutoScroll();
                }
            }, 1500);
        }
    }
    
    requestAnimationFrame(animateScroll);
}

// Auto-scroll reviews
let autoScrollAnimationId = null;
let hasSetupListeners = false;
let isAutoScrolling = true;
let lastScrollTime = 0;

function startAutoScroll() {
    const slider = document.getElementById('reviewsSlider');
    if (!slider) return;
    
    // Cancel any existing animation
    if (autoScrollAnimationId) {
        cancelAnimationFrame(autoScrollAnimationId);
        autoScrollAnimationId = null;
    }
    
    isAutoScrolling = true;
    lastScrollTime = performance.now();
    
    function animate(currentTime) {
        if (!isAutoScrolling) return;
        
        const slider = document.getElementById('reviewsSlider');
        if (!slider) return;
        
        // Calculate delta time for smooth animation (60fps)
        const deltaTime = currentTime - lastScrollTime;
        lastScrollTime = currentTime;
        
        // Scroll at consistent speed (approximately 30 pixels per second)
        const scrollSpeed = 0.05; // pixels per millisecond
        const scrollAmount = scrollSpeed * deltaTime;
        
        slider.scrollLeft += scrollAmount;
        
        // Loop back to start when reaching 2/3 of the way (after 2nd set of reviews)
        // This creates seamless infinite scroll since we have 3 copies
        const maxScroll = slider.scrollWidth - slider.clientWidth;
        const twoThirdsPoint = (slider.scrollWidth * 2) / 3;
        
        if (slider.scrollLeft >= twoThirdsPoint) {
            slider.scrollLeft = 0;
        }
        
        // Continue animation
        autoScrollAnimationId = requestAnimationFrame(animate);
    }
    
    // Start animation
    autoScrollAnimationId = requestAnimationFrame(animate);
    
    // Setup event listeners only once
    if (!hasSetupListeners) {
        hasSetupListeners = true;
        
        let scrollTimeout = null;
        let isUserScrolling = false;
        
        // Pause on hover
        slider.addEventListener('mouseenter', () => {
            isAutoScrolling = false;
            if (autoScrollAnimationId) {
                cancelAnimationFrame(autoScrollAnimationId);
                autoScrollAnimationId = null;
            }
        });
        
        // Resume on mouse leave
        slider.addEventListener('mouseleave', () => {
            if (!isAutoScrolling && !isUserScrolling) {
                startAutoScroll();
            }
        });
        
        // Detect manual scrolling (mouse/trackpad drag)
        slider.addEventListener('scroll', () => {
            if (isAutoScrolling) {
                // This is auto-scroll, ignore
                return;
            }
            
            // User is manually scrolling
            isUserScrolling = true;
            
            // Clear existing timeout
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            
            // Resume auto-scroll after user stops scrolling for 2 seconds
            scrollTimeout = setTimeout(() => {
                isUserScrolling = false;
                if (!isAutoScrolling) {
                    startAutoScroll();
                }
            }, 2000);
        }, { passive: true });
    }
}

function stopAutoScroll() {
    isAutoScrolling = false;
    if (autoScrollAnimationId) {
        cancelAnimationFrame(autoScrollAnimationId);
        autoScrollAnimationId = null;
    }
}

// Open review image modal
function openReviewImageModal(imageUrl, username) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        max-width: 90%;
        max-height: 80%;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    `;
    
    const usernameLabel = document.createElement('div');
    usernameLabel.textContent = `Review by ${username}`;
    usernameLabel.style.cssText = `
        color: white;
        font-size: 1.25rem;
        font-weight: 600;
        margin-top: 16px;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.9);
        color: #000;
        border: none;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        font-size: 30px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
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
    overlay.appendChild(usernameLabel);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
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
