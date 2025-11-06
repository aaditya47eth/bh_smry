// ============================================
// LOT VIEW PAGE LOGIC
// ============================================

// Cloudinary Configuration
const CLOUDINARY_CLOUD_NAME = 'daye1yfzy';
const CLOUDINARY_UPLOAD_PRESET = 'bh_smry_upload';

let imageSize = 100; // 4 steps decreased from 180 (default smaller)
let priceSize = 1.0; // 4 steps decreased from 1.8
let labelSize = 0.9; // 4 steps decreased from 1.5
let totalSize = 0.9; // 4 steps decreased from 1.5
let currentLot = null;
let lotItems = [];
let pastedImage = null;
let showTotals = true; // Control total visibility

// Get lot ID and name from URL
function getLotInfo() {
    const params = new URLSearchParams(window.location.search);
    return {
        id: params.get('lot_id'),
        name: params.get('lot_name')
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
    
    // Make username clickable only for non-guest users
    if (user.id !== 'guest') {
        userNameElement.style.cursor = 'pointer';
        userNameElement.onclick = () => {
            window.location.href = 'person_view.html';
        };
    }
    
    // Show/hide login/logout buttons based on guest status
    if (user.id === 'guest') {
        document.getElementById('logoutBtn').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'inline-block';
    } else {
        document.getElementById('logoutBtn').style.display = 'inline-block';
        document.getElementById('loginBtn').style.display = 'none';
    }
    
    // Show admin panel button in header for admin only
    if (user.access_level.toLowerCase() === 'admin') {
        document.getElementById('adminPanelHeaderBtn').style.display = 'inline-block';
    }

    const lotInfo = getLotInfo();
    if (!lotInfo.id) {
        alert('No lot selected');
        window.location.href = 'dashboard.html';
        return;
    }

    currentLot = lotInfo;
    document.getElementById('lotTitle').textContent = decodeURIComponent(lotInfo.name);
    
    // Apply initial sizes (2 steps decreased)
    updateSizes();
    
    // Show add button only for admin/manager
    if (hasPermission('add')) {
        document.getElementById('addNewBtn').style.display = 'inline-block';
    }
    
    // Show lock button only for admin
    if (user.access_level.toLowerCase() === 'admin') {
        document.getElementById('lockBtn').style.display = 'inline-block';
    }

    loadLotDropdown(); // Load dropdown for switching lots
    loadLotItems();
    setupPasteArea();
});

// Load items for this lot
async function loadLotItems() {
    try {
        // Fetch lot details including created date
        const { data: lotData, error: lotError } = await supabaseClient
            .from('lots')
            .select('*')
            .eq('id', currentLot.id)
            .single();
        
        if (lotError) throw lotError;
        
        // Update current lot with full data
        currentLot = { ...currentLot, ...lotData };
        
        // Update lock button state
        updateLockButton();
        
        // Update Add New button state based on lock
        const addNewBtn = document.getElementById('addNewBtn');
        if (addNewBtn && hasPermission('add')) {
            if (currentLot.locked) {
                addNewBtn.disabled = true;
                addNewBtn.style.opacity = '0.5';
                addNewBtn.style.cursor = 'not-allowed';
            } else {
                addNewBtn.disabled = false;
                addNewBtn.style.opacity = '1';
                addNewBtn.style.cursor = 'pointer';
            }
        }
        
        // Update lot title with creation date
        const createdDate = new Date(currentLot.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        const lotTitleEl = document.getElementById('lotTitle');
        if (hasPermission('edit')) {
            // Make date editable for admin/manager (grayish color)
            lotTitleEl.innerHTML = `${decodeURIComponent(currentLot.name)} (<span style="cursor: pointer; text-decoration: underline; color: #666;" onclick="editLotDate()">${createdDate}</span>)`;
        } else {
            lotTitleEl.textContent = `${decodeURIComponent(currentLot.name)} (${createdDate})`;
        }
        
        const { data, error } = await supabaseClient
            .from('items')
            .select('*')
            .eq('lot_id', currentLot.id)
            .order('created_at', { ascending: true });

        if (error) throw error;

        lotItems = data || [];
        renderGallery();
    } catch (error) {
        console.error('Error loading lot items:', error);
        document.getElementById('gallery').innerHTML = 
            '<div class="loading">Error loading items</div>';
    }
}

// Render gallery
function renderGallery() {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '';

    if (lotItems.length === 0) {
        gallery.innerHTML = '<div class="loading">No items in this lot yet. Click "Add New" to add items.</div>';
        return;
    }

    // Group items by username
    const userGroups = {};
    lotItems.forEach(item => {
        if (!userGroups[item.username]) {
            userGroups[item.username] = [];
        }
        userGroups[item.username].push(item);
    });

    // Sort usernames in ascending order
    const sortedUsernames = Object.keys(userGroups).sort((a, b) => a.localeCompare(b));

    // Render each user's items
    sortedUsernames.forEach(username => {
        const userItems = userGroups[username];
        const userSection = document.createElement('div');
        userSection.className = 'user-section';

        const itemsGrid = document.createElement('div');
        itemsGrid.className = 'items-grid';

        // Calculate total for this user (excluding cancelled items)
        const total = userItems.reduce((sum, item) => {
            if (!item.cancelled) {
                return sum + parseFloat(item.price);
            }
            return sum;
        }, 0);

        userItems.forEach(item => {
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';
            itemCard.dataset.itemId = item.id;
            itemCard.dataset.cancelled = item.cancelled || 'false';
            
            // Create price element (hide if cancelled)
            const priceDiv = document.createElement('div');
            priceDiv.className = 'price';
            
            // Hide price if item is cancelled
            if (item.cancelled) {
                priceDiv.style.visibility = 'hidden';
            } else {
                // Only make editable for admin/manager if not cancelled
                if (hasPermission('edit')) {
                    priceDiv.contentEditable = 'true';
                    priceDiv.addEventListener('blur', function() {
                        updateItemPrice(item.id, this);
                    });
                    priceDiv.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.blur();
                        }
                        // Only allow numbers and decimal point
                        if (!/[\d.]/.test(e.key)) {
                            e.preventDefault();
                        }
                    });
                }
            }
            
            priceDiv.textContent = item.price;
            itemCard.appendChild(priceDiv);
            
            // Add image with hover menu
            const imgContainer = document.createElement('div');
            imgContainer.className = 'item-image-container';
            const img = document.createElement('img');
            img.src = item.picture_url;
            img.alt = username;
            img.className = 'item-image';
            img.loading = 'lazy';
            img.crossOrigin = 'anonymous'; // Enable CORS for PNG generation
            
            // Add cancelled overlay if item is cancelled
            if (item.cancelled) {
                const cancelOverlay = document.createElement('div');
                cancelOverlay.className = 'cancel-overlay';
                cancelOverlay.innerHTML = '❌';
                imgContainer.appendChild(cancelOverlay);
            }
            
            imgContainer.appendChild(img);
            
            // Add magnifying glass button in center for full view
            const magnifyBtn = document.createElement('button');
            magnifyBtn.className = 'magnify-btn';
            magnifyBtn.innerHTML = '<img src="https://res.cloudinary.com/daye1yfzy/image/upload/v1762330881/magnifying-glass-solid-full_vujovk.svg" alt="View" class="magnify-icon">';
            magnifyBtn.onclick = (e) => {
                e.stopPropagation();
                openImageFullView(item.picture_url);
            };
            imgContainer.appendChild(magnifyBtn);
            
            // Add three-dot menu for admin/manager
            if (hasPermission('edit')) {
                const isLocked = isLotLocked();
                const menuContainer = document.createElement('div');
                menuContainer.className = 'item-menu';
                menuContainer.innerHTML = `
                    <button class="item-menu-btn" onclick="toggleItemMenu(event, '${item.id}')">⋮</button>
                    <div class="item-menu-dropdown" id="item-menu-${item.id}">
                        <button onclick="openPassModal('${item.id}', event)" ${isLocked ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>Pass</button>
                        <button onclick="toggleCancelItem('${item.id}', event)" ${isLocked ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>${item.cancelled ? 'Restore' : 'Cancel'}</button>
                        <button class="delete-menu-item" onclick="deleteItem('${item.id}', event)" ${isLocked ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>Delete</button>
                    </div>
                `;
                imgContainer.appendChild(menuContainer);
            }
            
            itemCard.appendChild(imgContainer);

            itemsGrid.appendChild(itemCard);
        });

        userSection.appendChild(itemsGrid);
        
        // Add username and total label below the grid
        const labelDiv = document.createElement('div');
        labelDiv.className = 'item-label';
        
        // Make username clickable for everyone to view profiles
        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'username-link';
        usernameSpan.textContent = username;
        usernameSpan.style.cursor = 'pointer';
        usernameSpan.onclick = () => {
            window.location.href = `person_view.html?username=${encodeURIComponent(username)}`;
        };
        
        if (showTotals) {
            labelDiv.appendChild(usernameSpan);
            labelDiv.appendChild(document.createTextNode(` - `));
            
            // Create hoverable total span that switches to "Add new" on hover
            const totalSpan = document.createElement('span');
            totalSpan.className = 'total-hover';
            totalSpan.textContent = `Total: ${total.toFixed(0)}`;
            totalSpan.dataset.hoverText = 'Add new';
            totalSpan.onclick = () => {
                openAddModal(username);
            };
            labelDiv.appendChild(totalSpan);
        } else {
            // Without totals, just show clickable username
            labelDiv.appendChild(usernameSpan);
        }
        
        userSection.appendChild(labelDiv);
        
        gallery.appendChild(userSection);
    });
}

// Toggle show/hide totals
function toggleShowTotals() {
    showTotals = !showTotals;
    renderGallery();
}

// Update item price
async function updateItemPrice(itemId, priceElement) {
    const newPrice = parseFloat(priceElement.textContent) || 0;
    
    try {
        const { error } = await supabaseClient
            .from('items')
            .update({ price: newPrice })
            .eq('id', itemId);

        if (error) throw error;

        // Reload to recalculate totals
        await loadLotItems();
    } catch (error) {
        console.error('Error updating price:', error);
        alert('Failed to update price');
        await loadLotItems(); // Reload to reset
    }
}

// Size control functions
function updateSizes() {
    // 100% zoom = 80% of original size (0.8 scale factor)
    const scaleFactor = 0.8;
    document.documentElement.style.setProperty('--image-size', (imageSize * scaleFactor) + 'px');
    document.documentElement.style.setProperty('--price-size', (priceSize * scaleFactor) + 'em');
    document.documentElement.style.setProperty('--label-size', (labelSize * scaleFactor) + 'em');
    document.documentElement.style.setProperty('--total-size', (totalSize * scaleFactor) + 'em');
}

function decreaseSize() {
    imageSize = Math.max(50, imageSize - 10); // Allow smaller minimum
    priceSize = (imageSize / 100) * 1.0;
    labelSize = (imageSize / 100) * 0.9;
    totalSize = (imageSize / 100) * 0.9;
    updateSizes();
    updateZoomSlider();
}

function increaseSize() {
    imageSize = Math.min(150, imageSize + 10);
    priceSize = (imageSize / 100) * 1.0;
    labelSize = (imageSize / 100) * 0.9;
    totalSize = (imageSize / 100) * 0.9;
    updateSizes();
    updateZoomSlider();
}

function resetSize() {
    imageSize = 100; // 4 steps decreased from 180 (default smaller)
    priceSize = 1.0; // 4 steps decreased from 1.8
    labelSize = 0.9; // 4 steps decreased from 1.5
    totalSize = 0.9; // 4 steps decreased from 1.5
    updateSizes();
    updateZoomSlider();
}

function setZoomLevel(zoomPercent) {
    const zoom = parseInt(zoomPercent);
    // Map zoom percentage (50-250) to image size (50-250)
    imageSize = zoom;
    priceSize = (zoom / 100) * 1.0;
    labelSize = (zoom / 100) * 0.9;
    totalSize = (zoom / 100) * 0.9;
    updateSizes();
    document.getElementById('zoomLevel').textContent = zoom + '%';
}

function updateZoomSlider() {
    const zoomPercent = imageSize;
    document.getElementById('zoomSlider').value = zoomPercent;
    document.getElementById('zoomLevel').textContent = zoomPercent + '%';
}

// Generate PNG with cropped images
async function generatePNG() {
    const gallery = document.getElementById('gallery');
    const button = event.target;
    
    button.disabled = true;
    button.textContent = 'Generating...';
    
    // Get all images
    const allImages = gallery.querySelectorAll('.item-image');
    const replacements = [];
    
    try {
        // Replace each image with a canvas showing the cropped version
        for (const img of allImages) {
            const container = img.parentElement;
            const containerWidth = container.offsetWidth;
            const containerHeight = container.offsetHeight;
            
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
            replacements.push({ canvas, img, container });
            
            // Replace image with canvas
            container.replaceChild(canvas, img);
        }
        
        // Wait a moment for DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Generate PNG with html2canvas
        const finalCanvas = await html2canvas(gallery, {
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
        
        // Download the PNG
        finalCanvas.toBlob(function(blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0, 10);
            link.download = `${currentLot.name}-${timestamp}.png`;
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
        
        button.disabled = false;
        button.textContent = '📸 Generate PNG';
    }
}

// Modal functions
function openAddModal(prefilledUsername = '') {
    if (isLotLocked()) {
        alert('This lot is locked. Please unlock it first to add items.');
        return;
    }
    
    document.getElementById('addModal').style.display = 'block';
    updateUsernameDropdown();
    
    // Prefill username if provided
    if (prefilledUsername) {
        document.getElementById('newUsername').value = prefilledUsername;
    }
    
    setTimeout(() => {
        document.getElementById('pasteArea').focus();
    }, 100);
}

// Handle Enter key in collector input - select first dropdown option then move to price
function handleCollectorEnter(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        event.stopPropagation(); // Stop event from bubbling
        
        const input = document.getElementById('newUsername');
        const datalist = document.getElementById('usernames');
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
        
        // Use setTimeout to ensure focus shift happens after any validation
        setTimeout(() => {
            document.getElementById('newPrice').focus();
        }, 0);
        
        return false; // Additional prevention
    }
}

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
    document.getElementById('addItemForm').reset();
    document.getElementById('pasteArea').innerHTML = '<div class="paste-instructions">Click here and press Ctrl+V to paste image</div>';
    pastedImage = null;
}

// Update username dropdown - fetch from database
async function updateUsernameDropdown() {
    const datalist = document.getElementById('usernames');
    datalist.innerHTML = '';
    
    try {
        // Fetch all users from Supabase (username and number)
        const { data: users, error } = await supabaseClient
            .from('users')
            .select('username, number')
            .order('username');
        
        if (error) throw error;
        
        // Add users to dropdown - include number for searching but display username
        users.forEach(user => {
            // Create option with username as value
            const option = document.createElement('option');
            option.value = user.username;
            // Add number as label for searching (appears in dropdown but not in input)
            option.setAttribute('data-number', user.number || '');
            option.label = user.number ? `${user.username} (${user.number})` : user.username;
            datalist.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading users:', error);
        // Fallback to existing items' usernames if database fetch fails
        const allUsers = new Set();
        lotItems.forEach(item => allUsers.add(item.username));
        
        allUsers.forEach(username => {
            const option = document.createElement('option');
            option.value = username;
            datalist.appendChild(option);
        });
    }
}

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Update file name display
    document.getElementById('fileName').textContent = file.name;
    
    // Check if it's an image
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        event.target.value = '';
        document.getElementById('fileName').textContent = 'No file selected';
        return;
    }
    
    // Read the file and convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
        pastedImage = e.target.result;
        // Update the paste area to show the uploaded image
        const pasteArea = document.getElementById('pasteArea');
        pasteArea.innerHTML = `<img src="${pastedImage}" alt="Uploaded image" style="max-width: 100%; max-height: 200px; object-fit: contain;">`;
    };
    reader.readAsDataURL(file);
}

// Setup paste area
function setupPasteArea() {
    const pasteArea = document.getElementById('pasteArea');
    const modal = document.getElementById('addModal');
    
    pasteArea.addEventListener('paste', function(e) {
        e.preventDefault();
        const items = e.clipboardData.items;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                
                reader.onload = function(event) {
                    pastedImage = event.target.result;
                    pasteArea.innerHTML = `<img src="${pastedImage}" alt="Pasted image">`;
                };
                
                reader.readAsDataURL(blob);
                break;
            }
        }
    });
    
    pasteArea.addEventListener('click', function() {
        this.focus();
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeAddModal();
        }
    });

    // Global paste listener - auto-open modal when pasting image anywhere
    document.addEventListener('paste', function(e) {
        // Check if user has add permission
        if (!hasPermission('add')) {
            return;
        }

        // Check if paste contains an image
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                
                reader.onload = function(event) {
                    pastedImage = event.target.result;
                    
                    // If modal is already open, just update the paste area
                    if (modal.style.display === 'block') {
                        const pasteAreaElement = document.getElementById('pasteArea');
                        pasteAreaElement.innerHTML = `<img src="${pastedImage}" alt="Pasted image">`;
                        
                        // Auto-focus: if username is filled, focus price, else focus username
                        const usernameInput = document.getElementById('newUsername');
                        const priceInput = document.getElementById('newPrice');
                        if (usernameInput.value.trim()) {
                            priceInput.focus();
                        } else {
                            usernameInput.focus();
                        }
                    } else {
                        // Open the modal with the image already pasted
                        openAddModal();
                        
                        // Wait a bit for modal to fully render, then show the image and set focus
                        setTimeout(() => {
                            const pasteAreaElement = document.getElementById('pasteArea');
                            pasteAreaElement.innerHTML = `<img src="${pastedImage}" alt="Pasted image">`;
                            
                            // Auto-focus: if username is filled, focus price, else focus username
                            const usernameInput = document.getElementById('newUsername');
                            const priceInput = document.getElementById('newPrice');
                            if (usernameInput.value.trim()) {
                                priceInput.focus();
                            } else {
                                usernameInput.focus();
                            }
                        }, 100);
                    }
                };
                
                reader.readAsDataURL(blob);
                break;
            }
        }
    });
    
    // Global Enter key listener - submit add item form when modal is open
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && modal.style.display === 'block') {
            // Don't interfere with textarea or contenteditable
            if (e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }
            e.preventDefault();
            addNewItem();
        }
    });
}

// Upload to Cloudinary
async function uploadToCloudinary(base64Image) {
    try {
        console.log('🔄 Starting Cloudinary upload...');
        console.log('Cloud Name:', CLOUDINARY_CLOUD_NAME);
        console.log('Upload Preset:', CLOUDINARY_UPLOAD_PRESET);
        
        const response = await fetch(base64Image);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        
        const uploadResponse = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            console.error('❌ Cloudinary error:', errorData);
            throw new Error(`Upload failed: ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await uploadResponse.json();
        console.log('✅ Cloudinary upload successful!');
        console.log('Image URL:', data.secure_url);
        return data.secure_url;
    } catch (error) {
        console.error('❌ Cloudinary upload error:', error);
        throw error;
    }
}

// Add new item
async function addNewItem() {
    const username = document.getElementById('newUsername').value.trim();
    const price = parseFloat(document.getElementById('newPrice').value);
    const addButton = document.querySelector('.btn-add');
    
    if (!username) {
        alert('Please enter a username!');
        return;
    }
    
    if (!price || price <= 0) {
        alert('Please enter a valid price!');
        return;
    }
    
    if (!pastedImage) {
        alert('Please paste an image!');
        return;
    }
    
    // Store the image data before closing modal
    const imageToUpload = pastedImage;
    
    // Close modal immediately
    closeAddModal();
    
    // Upload and save in background
    (async () => {
        try {
            // Check if user exists in database
            const { data: existingUser, error: userCheckError } = await supabaseClient
                .from('users')
                .select('id, username')
                .eq('username', username);
            
            if (userCheckError) throw userCheckError;
            
            // If user doesn't exist, create with empty password and empty name
            if (!existingUser || existingUser.length === 0) {
                const { error: createUserError } = await supabaseClient
                    .from('users')
                    .insert([{
                        username: username,
                        password: '', // Empty password - needs to be set later
                        number: '', // Keep number empty - to be set later
                        access_level: 'viewer' // Default access level
                    }]);
                
                if (createUserError) throw createUserError;
            }
            
            // Upload image to Cloudinary
            const cloudinaryUrl = await uploadToCloudinary(imageToUpload);
            
            // Insert into Supabase
            const { error } = await supabaseClient
                .from('items')
                .insert([{
                    lot_id: currentLot.id,
                    username: username,
                    picture_url: cloudinaryUrl,
                    price: price
                }]);

            if (error) throw error;

            // Reload items to show the new item
            await loadLotItems();
            
        } catch (error) {
            console.error('Error adding item:', error);
            alert('Failed to add item: ' + error.message);
        }
    })();
}

// Toggle item menu dropdown
// Open image in full view
function openImageFullView(imageUrl) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
    `;
    
    // Create image
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    `;
    
    // Create close button
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
    
    // Close on click
    const closeModal = () => {
        document.body.removeChild(overlay);
    };
    
    overlay.onclick = closeModal;
    closeBtn.onclick = closeModal;
    img.onclick = (e) => e.stopPropagation(); // Don't close when clicking image
    
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

function toggleItemMenu(event, itemId) {
    event.stopPropagation();
    const menu = document.getElementById(`item-menu-${itemId}`);
    const allMenus = document.querySelectorAll('.item-menu-dropdown');
    
    // Close all other menus
    allMenus.forEach(m => {
        if (m.id !== `item-menu-${itemId}`) {
            m.classList.remove('show');
        }
    });
    
    // Toggle current menu
    menu.classList.toggle('show');
}

// Close item menus when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.item-menu')) {
        const allMenus = document.querySelectorAll('.item-menu-dropdown');
        allMenus.forEach(m => m.classList.remove('show'));
    }
});

// Open pass item modal
let currentPassItemId = null;

async function openPassModal(itemId, event) {
    event.stopPropagation();
    
    if (isLotLocked()) {
        alert('This lot is locked. Please unlock it first to pass items.');
        return;
    }
    
    // Close the menu
    const allMenus = document.querySelectorAll('.item-menu-dropdown');
    allMenus.forEach(m => m.classList.remove('show'));
    
    currentPassItemId = itemId;
    
    // Load users into datalist
    const datalist = document.getElementById('passUsernames');
    datalist.innerHTML = '';
    
    try {
        const { data: users, error } = await supabaseClient
            .from('users')
            .select('username')
            .order('username');
        
        if (error) throw error;
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.username;
            datalist.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
    
    document.getElementById('passModal').style.display = 'block';
    document.getElementById('passUsername').value = '';
    
    // Auto-focus on username input
    setTimeout(() => {
        document.getElementById('passUsername').focus();
    }, 100);
}

function closePassModal() {
    document.getElementById('passModal').style.display = 'none';
    currentPassItemId = null;
}

// Pass item to another user
async function passItem() {
    const newUsername = document.getElementById('passUsername').value.trim();
    
    if (!newUsername) {
        alert('Please enter a username!');
        return;
    }
    
    // Check if user exists
    try {
        const { data: existingUsers, error: checkError } = await supabaseClient
            .from('users')
            .select('username')
            .eq('username', newUsername);
        
        if (checkError) throw checkError;
        
        const isNewUser = !existingUsers || existingUsers.length === 0;
        
        if (isNewUser) {
            const confirmCreate = confirm(`User "${newUsername}" doesn't exist. Do you want to create this user and pass the item to them?`);
            if (!confirmCreate) return;
            
            // Create new user
            const { error: createError } = await supabaseClient
                .from('users')
                .insert([{
                    username: newUsername,
                    password: '',
                    number: '',
                    access_level: 'viewer'
                }]);
            
            if (createError) throw createError;
        }
        
        // Pass the item
        const { error } = await supabaseClient
            .from('items')
            .update({ username: newUsername })
            .eq('id', currentPassItemId);
        
        if (error) throw error;
        
        closePassModal();
        await loadLotItems();
    } catch (error) {
        console.error('Error passing item:', error);
        alert('Failed to pass item. Please try again.');
    }
}

// Toggle cancel/restore item
async function toggleCancelItem(itemId, event) {
    event.stopPropagation();
    
    if (isLotLocked()) {
        alert('This lot is locked. Please unlock it first to cancel/restore items.');
        return;
    }
    
    // Close the menu
    const allMenus = document.querySelectorAll('.item-menu-dropdown');
    allMenus.forEach(m => m.classList.remove('show'));
    
    try {
        // First, get the current item state from the database
        const { data: currentItem, error: fetchError } = await supabaseClient
            .from('items')
            .select('cancelled')
            .eq('id', itemId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // Toggle the cancelled state
        const newCancelledState = !currentItem.cancelled;
        
        // Update in database
        const { error } = await supabaseClient
            .from('items')
            .update({ cancelled: newCancelledState })
            .eq('id', itemId);
        
        if (error) throw error;
        
        // Reload items to reflect the change
        await loadLotItems();
    } catch (error) {
        console.error('Error toggling cancel state:', error);
        alert('Failed to update item. Please try again.');
    }
}

// Delete item
async function deleteItem(itemId, event) {
    event.stopPropagation();
    
    if (isLotLocked()) {
        alert('This lot is locked. Please unlock it first to delete items.');
        return;
    }
    
    // Close the menu
    const allMenus = document.querySelectorAll('.item-menu-dropdown');
    allMenus.forEach(m => m.classList.remove('show'));
    
    if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('items')
            .delete()
            .eq('id', itemId);
        
        if (error) throw error;
        
        await loadLotItems();
    } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item. Please try again.');
    }
}

// Load lot dropdown for switching
async function loadLotDropdown() {
    try {
        const { data: lots, error } = await supabaseClient
            .from('lots')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        if (!lots || lots.length === 0) {
            return;
        }
        
        // Sort lots numerically by extracting number from lot_name
        const sortedLots = lots.sort((a, b) => {
            const numA = parseInt(a.lot_name.match(/(\d+)$/)?.[1] || '0');
            const numB = parseInt(b.lot_name.match(/(\d+)$/)?.[1] || '0');
            return numA - numB;
        });
        
        const dropdown = document.getElementById('lotDropdown');
        dropdown.innerHTML = '';
        
        sortedLots.forEach(lot => {
            const option = document.createElement('option');
            option.value = lot.id;
            option.textContent = lot.lot_name;
            // Use string comparison to handle both string and number IDs
            if (String(lot.id) === String(currentLot.id)) {
                option.selected = true;
            }
            dropdown.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading lots:', error);
    }
}

// Switch to selected lot
function switchLot() {
    const dropdown = document.getElementById('lotDropdown');
    const selectedLotId = dropdown.value;
    const selectedLotName = dropdown.options[dropdown.selectedIndex].text;
    
    if (selectedLotId && selectedLotId !== currentLot.id) {
        window.location.href = `lot_view.html?lot_id=${selectedLotId}&lot_name=${encodeURIComponent(selectedLotName)}`;
    }
}

// Edit lot date
async function editLotDate() {
    const currentDate = new Date(currentLot.created_at);
    const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const newDate = prompt('Enter new date (YYYY-MM-DD):', dateStr);
    
    if (!newDate || newDate === dateStr) {
        return; // User cancelled or no change
    }
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        alert('Invalid date format. Please use YYYY-MM-DD');
        return;
    }
    
    try {
        // Update lot date in database
        const { error } = await supabaseClient
            .from('lots')
            .update({ created_at: newDate })
            .eq('id', currentLot.id);
        
        if (error) throw error;
        
        alert('✅ Lot date updated successfully!');
        await loadLotItems(); // Reload to show updated date
    } catch (error) {
        console.error('Error updating lot date:', error);
        alert('Failed to update lot date: ' + error.message);
    }
}

// Lock/Unlock functions
async function toggleLock() {
    if (!currentLot) return;
    
    const newLockedState = !currentLot.locked;
    
    try {
        const { error } = await supabaseClient
            .from('lots')
            .update({ locked: newLockedState })
            .eq('id', currentLot.id);
        
        if (error) throw error;
        
        currentLot.locked = newLockedState;
        updateLockButton();
        
        // Reload items to update button states
        loadLotItems();
    } catch (error) {
        console.error('Error toggling lock:', error);
        alert('Failed to toggle lock: ' + error.message);
    }
}

function updateLockButton() {
    const lockBtn = document.getElementById('lockBtn');
    const lockIcon = document.getElementById('lockIcon');
    
    if (!lockBtn || !lockIcon) return;
    
    if (currentLot.locked) {
        lockBtn.classList.add('locked');
        lockIcon.src = 'https://res.cloudinary.com/daye1yfzy/image/upload/v1762317006/lock-solid-full_uhekbc.svg';
        lockIcon.alt = 'Locked';
        lockBtn.title = 'Unlock Lot';
    } else {
        lockBtn.classList.remove('locked');
        lockIcon.src = 'https://res.cloudinary.com/daye1yfzy/image/upload/v1762317008/lock-open-solid-full_bh6f8q.svg';
        lockIcon.alt = 'Unlocked';
        lockBtn.title = 'Lock Lot';
    }
}

function isLotLocked() {
    return currentLot && currentLot.locked === true;
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        clearSession();
        window.location.href = 'index.html';
    }
}
