// State Management
let videos = [];
let token = localStorage.getItem('lust_token');
let currentUploadedFiles = []; 
let currentPreviewImages = []; 

// Pagination State
let currentPage = 1;
let hasMore = true;
let isLoading = false;

// DOM Elements
const landingPage = document.getElementById('landingPage');
const dashboardPage = document.getElementById('dashboardPage');
const videoGrid = document.getElementById('videoGrid');
const emptyState = document.getElementById('emptyState');
const showLoginBtn = document.getElementById('showLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const adminAddBtn = document.getElementById('adminAddBtn');
const loadingIndicator = document.getElementById('loadingIndicator');

// Modals
const authModal = document.getElementById('authModal');
const videoModal = document.getElementById('videoModal');

// Infinite Scroll Sentinel
const loadMoreSentinel = document.createElement('div');
loadMoreSentinel.className = 'loading-more hidden';
loadMoreSentinel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading more...';
document.querySelector('.gallery-container').appendChild(loadMoreSentinel);

const observer = new IntersectionObserver((entries) => {
    if(entries[0].isIntersecting && hasMore && !isLoading && token) {
        currentPage++;
        fetchVideos(false);
    }
}, { threshold: 1.0 });
observer.observe(loadMoreSentinel);


// Init
document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
    setupEventListeners();
});

// Setup Listeners
function setupEventListeners() {
    // Auth
    showLoginBtn.addEventListener('click', () => {
        authModal.classList.add('active');
        document.getElementById('authError').style.display = 'none';
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('lust_token');
        token = null;
        checkAuthState();
    });

    document.getElementById('closeAuth').addEventListener('click', () => {
        authModal.classList.remove('active');
    });

    document.getElementById('authForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('authSubmitBtn');
        
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
        
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                token = data.token;
                localStorage.setItem('lust_token', token);
                authModal.classList.remove('active');
                e.target.reset();
                checkAuthState();
            } else {
                document.getElementById('authError').style.display = 'block';
                document.getElementById('authError').innerText = data.message;
            }
        } catch(err) {
            document.getElementById('authError').style.display = 'block';
            document.getElementById('authError').innerText = 'Server error. Is the backend running?';
        }
        btn.innerHTML = 'Login';
    });

    // Video Modal Triggers
    adminAddBtn.addEventListener('click', () => {
        document.getElementById('videoForm').reset();
        document.getElementById('videoId').value = '';
        currentUploadedFiles = [];
        currentPreviewImages = [];
        renderImagePreviews();
        document.getElementById('videoModalTitle').innerText = 'Add New Video';
        videoModal.classList.add('active');
    });

    document.getElementById('closeVideoModal').addEventListener('click', () => {
        videoModal.classList.remove('active');
    });

    // File Uploads
    const fileInput = document.getElementById('videoImages');
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                currentUploadedFiles.push(file);
                const reader = new FileReader();
                reader.onload = (ev) => {
                    currentPreviewImages.push(ev.target.result);
                    renderImagePreviews();
                };
                reader.readAsDataURL(file);
            }
        }
        fileInput.value = ''; 
    });

    // Form Submit
    document.getElementById('videoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('videoId').value;
        const saveBtn = document.getElementById('saveVideoBtn');
        const saveBtnText = document.getElementById('saveBtnText');
        const saveBtnSpinner = document.getElementById('saveBtnSpinner');

        saveBtn.disabled = true;
        saveBtnText.innerText = 'Uploading...';
        saveBtnSpinner.classList.remove('hidden');

        const formData = new FormData();
        formData.append('title', document.getElementById('videoTitle').value);
        formData.append('link', document.getElementById('videoLink').value);
        formData.append('category', document.getElementById('videoCategory').value);
        formData.append('rating', document.getElementById('videoRating').value);
        formData.append('description', document.getElementById('videoDescription').value);
        
        currentUploadedFiles.forEach(file => {
            formData.append('images', file);
        });

        if(id) {
            const existingImages = currentPreviewImages.filter(img => img.startsWith('http'));
            formData.append('existingImages', JSON.stringify(existingImages));
        }

        try {
            const url = id ? `/api/videos/${id}` : '/api/videos';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (res.ok) {
                videoModal.classList.remove('active');
                fetchVideos(true); // Reload from page 1 to see the new/updated video
            } else {
                const data = await res.json();
                alert('Error: ' + data.message);
            }
        } catch(err) {
            alert('Error communicating with server.');
        }

        saveBtn.disabled = false;
        saveBtnText.innerText = 'Save Video';
        saveBtnSpinner.classList.add('hidden');
    });

    // Filters & Sorting triggers (Reset to page 1)
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => fetchVideos(true), 500); // Debounce search
    });
    document.getElementById('sortSelect').addEventListener('change', () => fetchVideos(true));
    document.getElementById('categoryFilter').addEventListener('change', () => fetchVideos(true));
    document.getElementById('favoriteFilter').addEventListener('change', () => fetchVideos(true));
}

function checkAuthState() {
    if (token) {
        landingPage.classList.add('hidden');
        dashboardPage.classList.remove('hidden');
        fetchVideos(true);
    } else {
        landingPage.classList.remove('hidden');
        dashboardPage.classList.add('hidden');
        videoGrid.innerHTML = ''; 
    }
}

function renderImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    container.innerHTML = '';
    currentPreviewImages.forEach((imgSrc, index) => {
        const div = document.createElement('div');
        div.className = 'preview-img-wrapper';
        div.innerHTML = `
            <img src="${imgSrc}" class="preview-img">
            <div class="preview-remove" onclick="removeImage(${index})"><i class="fa-solid fa-times"></i></div>
        `;
        container.appendChild(div);
    });
}

window.removeImage = function(index) {
    currentPreviewImages.splice(index, 1);
    currentUploadedFiles = []; 
    renderImagePreviews();
};

// --- API Calls ---

async function fetchVideos(reset = false) {
    if (isLoading) return;
    
    if (reset) {
        currentPage = 1;
        videos = [];
        videoGrid.innerHTML = '';
        emptyState.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');
    } else {
        loadMoreSentinel.classList.remove('hidden');
    }

    isLoading = true;

    const search = document.getElementById('searchInput').value;
    const sort = document.getElementById('sortSelect').value;
    const category = document.getElementById('categoryFilter').value;
    const isFavorite = document.getElementById('favoriteFilter').checked;

    try {
        const url = `/api/videos?page=${currentPage}&limit=20&search=${encodeURIComponent(search)}&sort=${sort}&category=${category}&isFavorite=${isFavorite}`;
        
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if(res.status === 401) {
            localStorage.removeItem('lust_token');
            token = null;
            checkAuthState();
            return;
        }

        const data = await res.json();
        if(data.videos) {
            hasMore = data.hasMore;
            videos = reset ? data.videos : [...videos, ...data.videos];
            renderVideos(data.videos, reset); // Render only new batch
        }
    } catch(err) {
        console.error(err);
        if(reset) alert("Make sure the backend is running and MongoDB is connected.");
    }
    
    isLoading = false;
    loadingIndicator.classList.add('hidden');
    
    if(!hasMore) {
        loadMoreSentinel.classList.add('hidden');
    }
}

window.toggleFavorite = async function(id) {
    const btn = document.querySelector(`.heart-btn[data-id="${id}"]`);
    try {
        const res = await fetch(`/api/videos/${id}/favorite`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if(res.ok) {
            const data = await res.json();
            if (data.isFavorite) {
                btn.classList.add('is-favorite');
                btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
            } else {
                btn.classList.remove('is-favorite');
                btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
                // If we are currently in "Favorites Only" view, maybe remove the card or just let it stay until refresh.
                // Leaving it is a better UX so it doesn't just disappear instantly.
            }
            
            // update local state
            const v = videos.find(vid => vid._id === id);
            if(v) v.isFavorite = data.isFavorite;
        }
    } catch (err) {
        console.error(err);
    }
};

window.deleteVideo = async function(id) {
    if(confirm('Are you sure you want to delete this video?')) {
        try {
            await fetch(`/api/videos/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            fetchVideos(true);
        } catch(err) {
            console.error(err);
        }
    }
};

window.editVideo = function(id) {
    const video = videos.find(v => v._id === id || v.id === id); 
    if (!video) return;

    document.getElementById('videoId').value = video._id || video.id;
    document.getElementById('videoTitle').value = video.title;
    document.getElementById('videoLink').value = video.link;
    document.getElementById('videoCategory').value = video.category;
    document.getElementById('videoRating').value = video.rating;
    document.getElementById('videoDescription').value = video.description;
    
    currentUploadedFiles = [];
    currentPreviewImages = video.images || [];
    renderImagePreviews();

    document.getElementById('videoModalTitle').innerText = 'Edit Video';
    videoModal.classList.add('active');
};

// --- Rendering ---
// Renders only a batch of videos to prevent DOM freeze
function renderVideos(newBatch, reset) {
    if (reset && newBatch.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    videoGrid.classList.remove('hidden');
    
    newBatch.forEach((video, index) => {
        const card = document.createElement('div');
        card.className = 'video-card tilt-card';
        card.style.animationDelay = `${(index % 20) * 0.05}s`; 
        card.setAttribute('data-tilt', ''); 
        
        let stars = '';
        for(let i=1; i<=5; i++) {
            if(i <= video.rating) stars += '<i class="fa-solid fa-star"></i>';
            else if(i - 0.5 <= video.rating) stars += '<i class="fa-solid fa-star-half-stroke"></i>';
            else stars += '<i class="fa-regular fa-star"></i>';
        }

        const id = video._id || video.id;

        const adminControlsHTML = `
            <div class="admin-controls">
                <button class="btn outline-btn" onclick="editVideo('${id}')"><i class="fa-solid fa-edit"></i> Edit</button>
                <button class="btn danger-btn" onclick="deleteVideo('${id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;

        const imagesArray = video.images && video.images.length > 0 ? video.images : ['https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&w=600&q=80'];
        
        let imagesHTML = '';
        let indicatorsHTML = '';
        imagesArray.forEach((img, i) => {
            imagesHTML += `<img src="${img}" class="carousel-image ${i === 0 ? 'active' : ''}" data-index="${i}">`;
            if(imagesArray.length > 1) {
                indicatorsHTML += `<div class="indicator ${i === 0 ? 'active' : ''}"></div>`;
            }
        });

        const favClass = video.isFavorite ? 'is-favorite' : '';
        const favIcon = video.isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';

        card.innerHTML = `
            <div class="card-img-wrapper" id="carousel-${id}">
                ${imagesHTML}
                <div class="carousel-indicators">${indicatorsHTML}</div>
                <a href="${video.link}" target="_blank" class="play-overlay">
                    <i class="fa-solid fa-circle-play"></i>
                </a>
            </div>
            <div class="card-content">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:start;">
                    <h3 class="card-title" style="flex:1;">${video.title}</h3>
                    <button class="heart-btn ${favClass}" data-id="${id}" onclick="toggleFavorite('${id}')">
                        <i class="${favIcon}"></i>
                    </button>
                </div>
                <div class="card-meta">
                    <span class="category"><i class="fa-solid fa-tag"></i> ${video.category.charAt(0).toUpperCase() + video.category.slice(1)}</span>
                    <span class="rating">${stars} (${video.rating})</span>
                </div>
                <p class="card-desc">${video.description}</p>
                ${adminControlsHTML}
            </div>
        `;
        videoGrid.appendChild(card);
        
        if(imagesArray.length > 1) {
            const wrapper = card.querySelector(`#carousel-${id}`);
            const imgs = wrapper.querySelectorAll('.carousel-image');
            const inds = wrapper.querySelectorAll('.indicator');
            let activeIndex = 0;
            let interval;
            
            const showImage = (idx) => {
                imgs.forEach(i => i.classList.remove('active'));
                inds.forEach(i => i.classList.remove('active'));
                imgs[idx].classList.add('active');
                inds[idx].classList.add('active');
            };
            
            card.addEventListener('mouseenter', () => {
                interval = setInterval(() => {
                    activeIndex = (activeIndex + 1) % imgs.length;
                    showImage(activeIndex);
                }, 1200); 
            });
            
            card.addEventListener('mouseleave', () => {
                clearInterval(interval);
                activeIndex = 0;
                showImage(activeIndex);
            });
        }
    });

    if (window.VanillaTilt) {
        VanillaTilt.init(document.querySelectorAll(".tilt-card"), {
            max: 5,
            speed: 400,
            glare: true,
            "max-glare": 0.2
        });
    }
}
