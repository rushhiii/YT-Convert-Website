// Samsung Music Clone - JavaScript
// Main Application Class

class SamsungMusicApp {
    constructor() {
        this.currentUser = null;
        this.musicLibrary = [];
        this.playlists = [];
        this.currentTrack = null;
        this.currentPlaylist = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.isShuffled = false;
        this.repeatMode = 'none'; // none, one, all
        this.volume = 100;
        this.currentView = 'library';
        
        // Audio context for Web Audio API
        this.audioContext = null;
        this.audioElement = null;
        this.analyser = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupAudioPlayer();
        this.loadUserData();
        this.checkAuthStatus();
        this.setupServiceWorker();
    }
    
    // Authentication Methods
    checkAuthStatus() {
        const token = localStorage.getItem('auth_token');
        if (token) {
            this.validateToken(token);
        } else {
            this.showLoginModal();
        }
    }
    
    async validateToken(token) {
        try {
            const response = await fetch('/api/auth/validate', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const user = await response.json();
                this.currentUser = user;
                this.hideLoginModal();
                this.loadUserData();
            } else {
                localStorage.removeItem('auth_token');
                this.showLoginModal();
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            this.showLoginModal();
        }
    }
    
    async login(email, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            if (response.ok) {
                const { token, user } = await response.json();
                localStorage.setItem('auth_token', token);
                this.currentUser = user;
                this.hideLoginModal();
                this.loadUserData();
                this.showNotification('Welcome back!', 'success');
            } else {
                const error = await response.json();
                this.showNotification(error.message, 'error');
            }
        } catch (error) {
            console.error('Login failed:', error);
            this.showNotification('Login failed. Please try again.', 'error');
        }
    }
    
    async register(userData) {
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });
            
            if (response.ok) {
                const { token, user } = await response.json();
                localStorage.setItem('auth_token', token);
                this.currentUser = user;
                this.hideLoginModal();
                this.loadUserData();
                this.showNotification('Account created successfully!', 'success');
            } else {
                const error = await response.json();
                this.showNotification(error.message, 'error');
            }
        } catch (error) {
            console.error('Registration failed:', error);
            this.showNotification('Registration failed. Please try again.', 'error');
        }
    }
    
    logout() {
        localStorage.removeItem('auth_token');
        this.currentUser = null;
        this.musicLibrary = [];
        this.playlists = [];
        this.currentTrack = null;
        this.currentPlaylist = [];
        this.stopMusic();
        this.showLoginModal();
        this.showNotification('Logged out successfully', 'success');
    }
    
    // Data Loading Methods
    async loadUserData() {
        if (!this.currentUser) return;
        
        try {
            await Promise.all([
                this.loadMusicLibrary(),
                this.loadPlaylists(),
                this.loadUserPreferences()
            ]);
            
            this.renderCurrentView();
        } catch (error) {
            console.error('Failed to load user data:', error);
            this.showNotification('Failed to load your music library', 'error');
        }
    }
    
    async loadMusicLibrary() {
        try {
            const response = await fetch('/api/music/library', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            
            if (response.ok) {
                this.musicLibrary = await response.json();
                this.renderMusicLibrary();
            }
        } catch (error) {
            console.error('Failed to load music library:', error);
        }
    }
    
    async loadPlaylists() {
        try {
            const response = await fetch('/api/playlists', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            
            if (response.ok) {
                this.playlists = await response.json();
                this.renderPlaylists();
            }
        } catch (error) {
            console.error('Failed to load playlists:', error);
        }
    }
    
    async loadUserPreferences() {
        try {
            const response = await fetch('/api/user/preferences', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            
            if (response.ok) {
                const preferences = await response.json();
                this.applyUserPreferences(preferences);
            }
        } catch (error) {
            console.error('Failed to load user preferences:', error);
        }
    }
    
    // Audio Player Setup
    setupAudioPlayer() {
        this.audioElement = document.getElementById('audioPlayer');
        
        this.audioElement.addEventListener('loadedmetadata', () => {
            this.updateTrackDuration();
        });
        
        this.audioElement.addEventListener('timeupdate', () => {
            this.updatePlaybackProgress();
        });
        
        this.audioElement.addEventListener('ended', () => {
            this.handleTrackEnd();
        });
        
        this.audioElement.addEventListener('error', (error) => {
            console.error('Audio playback error:', error);
            this.showNotification('Playback error occurred', 'error');
        });
        
        // Initialize Web Audio API for visualizations
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaElementSource(this.audioElement);
            this.analyser = this.audioContext.createAnalyser();
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }
    
    // Music Playback Methods
    async playTrack(track, playlist = null) {
        try {
            this.currentTrack = track;
            this.currentPlaylist = playlist || [track];
            this.currentIndex = playlist ? playlist.findIndex(t => t.id === track.id) : 0;
            
            this.audioElement.src = track.url;
            await this.audioElement.play();
            
            this.isPlaying = true;
            this.updatePlayerUI();
            this.updatePlayPauseButton();
            
            // Update recently played
            this.addToRecentlyPlayed(track);
            
            // Scrobble to last.fm or similar service
            this.scrobbleTrack(track);
            
        } catch (error) {
            console.error('Failed to play track:', error);
            this.showNotification('Failed to play track', 'error');
        }
    }
    
    pauseMusic() {
        this.audioElement.pause();
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }
    
    resumeMusic() {
        this.audioElement.play();
        this.isPlaying = true;
        this.updatePlayPauseButton();
    }
    
    stopMusic() {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }
    
    nextTrack() {
        if (this.currentPlaylist.length === 0) return;
        
        let nextIndex;
        if (this.isShuffled) {
            nextIndex = Math.floor(Math.random() * this.currentPlaylist.length);
        } else {
            nextIndex = (this.currentIndex + 1) % this.currentPlaylist.length;
        }
        
        const nextTrack = this.currentPlaylist[nextIndex];
        this.playTrack(nextTrack, this.currentPlaylist);
    }
    
    previousTrack() {
        if (this.currentPlaylist.length === 0) return;
        
        let prevIndex;
        if (this.isShuffled) {
            prevIndex = Math.floor(Math.random() * this.currentPlaylist.length);
        } else {
            prevIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.currentPlaylist.length - 1;
        }
        
        const prevTrack = this.currentPlaylist[prevIndex];
        this.playTrack(prevTrack, this.currentPlaylist);
    }
    
    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        document.getElementById('shuffleBtn').classList.toggle('active', this.isShuffled);
        this.showNotification(`Shuffle ${this.isShuffled ? 'enabled' : 'disabled'}`, 'info');
    }
    
    toggleRepeat() {
        const modes = ['none', 'one', 'all'];
        const currentModeIndex = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(currentModeIndex + 1) % modes.length];
        
        const repeatBtn = document.getElementById('repeatBtn');
        repeatBtn.classList.remove('active', 'repeat-one');
        
        if (this.repeatMode === 'one') {
            repeatBtn.classList.add('active', 'repeat-one');
            repeatBtn.innerHTML = '<i class="fas fa-redo-alt"></i>';
        } else if (this.repeatMode === 'all') {
            repeatBtn.classList.add('active');
            repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
        } else {
            repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
        }
        
        this.showNotification(`Repeat: ${this.repeatMode}`, 'info');
    }
    
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(100, volume));
        this.audioElement.volume = this.volume / 100;
        
        const volumeBtn = document.getElementById('volumeBtn');
        const volumeSlider = document.getElementById('volumeSlider');
        
        volumeSlider.value = this.volume;
        
        if (this.volume === 0) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else if (this.volume < 50) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        } else {
            volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }
    
    seekTo(percentage) {
        if (!this.audioElement.duration) return;
        this.audioElement.currentTime = (percentage / 100) * this.audioElement.duration;
    }
    
    handleTrackEnd() {
        if (this.repeatMode === 'one') {
            this.audioElement.currentTime = 0;
            this.audioElement.play();
        } else if (this.repeatMode === 'all' || this.currentIndex < this.currentPlaylist.length - 1) {
            this.nextTrack();
        } else {
            this.isPlaying = false;
            this.updatePlayPauseButton();
        }
    }
    
    // UI Update Methods
    updatePlayerUI() {
        if (!this.currentTrack) return;
        
        document.getElementById('currentTitle').textContent = this.currentTrack.title;
        document.getElementById('currentArtist').textContent = this.currentTrack.artist;
        document.getElementById('currentArtwork').src = this.currentTrack.artwork || './assets/images/default-artwork.jpg';
        
        // Update favorite button
        const favoriteBtn = document.getElementById('favoriteBtn');
        favoriteBtn.classList.toggle('active', this.currentTrack.isFavorite);
    }
    
    updatePlayPauseButton() {
        const playPauseBtn = document.getElementById('playPauseBtn');
        const icon = playPauseBtn.querySelector('i');
        
        if (this.isPlaying) {
            icon.className = 'fas fa-pause';
        } else {
            icon.className = 'fas fa-play';
        }
    }
    
    updateTrackDuration() {
        const totalTime = document.getElementById('totalTime');
        if (this.audioElement.duration) {
            totalTime.textContent = this.formatTime(this.audioElement.duration);
        }
    }
    
    updatePlaybackProgress() {
        if (!this.audioElement.duration) return;
        
        const currentTime = document.getElementById('currentTime');
        const progressFill = document.getElementById('progressFill');
        
        const progress = (this.audioElement.currentTime / this.audioElement.duration) * 100;
        
        currentTime.textContent = this.formatTime(this.audioElement.currentTime);
        progressFill.style.width = `${progress}%`;
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    // Library Management Methods
    async uploadMusic(files) {
        const uploadModal = document.getElementById('uploadModal');
        const uploadProgress = document.getElementById('uploadProgress');
        
        uploadProgress.innerHTML = '';
        
        for (let file of files) {
            const uploadItem = this.createUploadItem(file);
            uploadProgress.appendChild(uploadItem);
            
            try {
                await this.uploadSingleFile(file, uploadItem);
            } catch (error) {
                console.error('Upload failed for:', file.name, error);
                this.updateUploadStatus(uploadItem, 'Failed', 'error');
            }
        }
        
        // Reload music library after uploads
        await this.loadMusicLibrary();
        this.showNotification('Music uploaded successfully!', 'success');
    }
    
    async uploadSingleFile(file, uploadItem) {
        const formData = new FormData();
        formData.append('music', file);
        
        const xhr = new XMLHttpRequest();
        
        return new Promise((resolve, reject) => {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const progress = (e.loaded / e.total) * 100;
                    this.updateUploadProgress(uploadItem, progress);
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    this.updateUploadStatus(uploadItem, 'Completed', 'success');
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(new Error('Upload failed'));
            });
            
            xhr.open('POST', '/api/music/upload');
            xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('auth_token')}`);
            xhr.send(formData);
        });
    }
    
    createUploadItem(file) {
        const item = document.createElement('div');
        item.className = 'upload-item';
        item.innerHTML = `
            <div class="upload-info">
                <div class="upload-name">${file.name}</div>
                <div class="upload-status">Uploading...</div>
            </div>
            <div class="upload-progress-bar">
                <div class="upload-progress-fill" style="width: 0%"></div>
            </div>
        `;
        return item;
    }
    
    updateUploadProgress(uploadItem, progress) {
        const progressFill = uploadItem.querySelector('.upload-progress-fill');
        progressFill.style.width = `${progress}%`;
    }
    
    updateUploadStatus(uploadItem, status, type) {
        const statusElement = uploadItem.querySelector('.upload-status');
        statusElement.textContent = status;
        statusElement.className = `upload-status ${type}`;
    }
    
    // Search Functionality
    async searchMusic(query) {
        if (!query.trim()) {
            this.hideSuggestions();
            return;
        }
        
        try {
            const response = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            
            if (response.ok) {
                const results = await response.json();
                this.showSuggestions(results);
            }
        } catch (error) {
            console.error('Search failed:', error);
        }
    }
    
    showSuggestions(results) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        suggestionsContainer.innerHTML = '';
        
        if (results.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        
        results.forEach(result => {
            const suggestion = document.createElement('div');
            suggestion.className = 'search-suggestion';
            suggestion.innerHTML = `
                <div class="suggestion-title">${result.title}</div>
                <div class="suggestion-artist">${result.artist}</div>
            `;
            
            suggestion.addEventListener('click', () => {
                this.playTrack(result);
                this.hideSuggestions();
                document.getElementById('searchInput').value = '';
            });
            
            suggestionsContainer.appendChild(suggestion);
        });
        
        suggestionsContainer.style.display = 'block';
    }
    
    hideSuggestions() {
        document.getElementById('searchSuggestions').style.display = 'none';
    }
    
    // Playlist Management
    async createPlaylist(name, description, isPublic) {
        try {
            const response = await fetch('/api/playlists', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({
                    name,
                    description,
                    isPublic
                })
            });
            
            if (response.ok) {
                const playlist = await response.json();
                this.playlists.push(playlist);
                this.renderPlaylists();
                this.showNotification('Playlist created successfully!', 'success');
                this.hidePlaylistModal();
            } else {
                const error = await response.json();
                this.showNotification(error.message, 'error');
            }
        } catch (error) {
            console.error('Failed to create playlist:', error);
            this.showNotification('Failed to create playlist', 'error');
        }
    }
    
    async addToPlaylist(playlistId, trackId) {
        try {
            const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ trackId })
            });
            
            if (response.ok) {
                this.showNotification('Track added to playlist!', 'success');
            } else {
                const error = await response.json();
                this.showNotification(error.message, 'error');
            }
        } catch (error) {
            console.error('Failed to add track to playlist:', error);
            this.showNotification('Failed to add track to playlist', 'error');
        }
    }
    
    // Rendering Methods
    renderMusicLibrary() {
        const musicGrid = document.getElementById('musicGrid');
        const viewMode = document.querySelector('.view-btn.active').id === 'listViewBtn' ? 'list' : 'grid';
        
        musicGrid.className = `music-grid ${viewMode === 'list' ? 'list-view' : ''}`;
        musicGrid.innerHTML = '';
        
        if (this.musicLibrary.length === 0) {
            musicGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-music"></i>
                    <h3>No music found</h3>
                    <p>Upload your first track to get started!</p>
                </div>
            `;
            return;
        }
        
        const sortedLibrary = this.sortMusicLibrary();
        
        sortedLibrary.forEach(track => {
            const musicItem = this.createMusicItem(track, viewMode === 'list');
            musicGrid.appendChild(musicItem);
        });
    }
    
    createMusicItem(track, isListView) {
        const item = document.createElement('div');
        item.className = `music-item ${isListView ? 'list-view' : ''}`;
        
        item.innerHTML = `
            <div class="music-artwork">
                <img src="${track.artwork || './assets/images/default-artwork.jpg'}" alt="${track.title}" />
                <div class="play-overlay">
                    <i class="fas fa-play"></i>
                </div>
            </div>
            <div class="music-info">
                <div class="music-title">${track.title}</div>
                <div class="music-artist">${track.artist}</div>
                <div class="music-duration">${this.formatTime(track.duration)}</div>
            </div>
            <div class="music-actions">
                <button class="action-btn favorite-btn" data-track-id="${track.id}">
                    <i class="far fa-heart"></i>
                </button>
                <button class="action-btn playlist-btn" data-track-id="${track.id}">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="action-btn menu-btn" data-track-id="${track.id}">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const playOverlay = item.querySelector('.play-overlay');
        playOverlay.addEventListener('click', () => {
            this.playTrack(track, this.musicLibrary);
        });
        
        const favoriteBtn = item.querySelector('.favorite-btn');
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFavorite(track.id);
        });
        
        const playlistBtn = item.querySelector('.playlist-btn');
        playlistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showAddToPlaylistMenu(track.id);
        });
        
        return item;
    }
    
    renderPlaylists() {
        const playlistsGrid = document.getElementById('playlistsGrid');
        playlistsGrid.innerHTML = '';
        
        if (this.playlists.length === 0) {
            playlistsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-list-music"></i>
                    <h3>No playlists yet</h3>
                    <p>Create your first playlist to organize your music!</p>
                </div>
            `;
            return;
        }
        
        this.playlists.forEach(playlist => {
            const playlistItem = this.createPlaylistItem(playlist);
            playlistsGrid.appendChild(playlistItem);
        });
    }
    
    createPlaylistItem(playlist) {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        
        item.innerHTML = `
            <div class="playlist-cover">
                <i class="fas fa-music"></i>
            </div>
            <div class="playlist-name">${playlist.name}</div>
            <div class="playlist-meta">${playlist.tracks?.length || 0} songs</div>
        `;
        
        item.addEventListener('click', () => {
            this.openPlaylist(playlist);
        });
        
        return item;
    }
    
    sortMusicLibrary() {
        const sortBy = document.getElementById('sortSelect').value;
        
        return [...this.musicLibrary].sort((a, b) => {
            switch (sortBy) {
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'artist':
                    return a.artist.localeCompare(b.artist);
                case 'album':
                    return a.album.localeCompare(b.album);
                case 'genre':
                    return a.genre.localeCompare(b.genre);
                case 'duration':
                    return a.duration - b.duration;
                case 'dateAdded':
                    return new Date(b.dateAdded) - new Date(a.dateAdded);
                default:
                    return 0;
            }
        });
    }
    
    // Event Listeners Setup
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchView(tab.dataset.view);
            });
        });
        
        // Auth modals
        this.setupAuthEventListeners();
        
        // Music player controls
        this.setupPlayerEventListeners();
        
        // Upload functionality
        this.setupUploadEventListeners();
        
        // Search functionality
        this.setupSearchEventListeners();
        
        // Playlist functionality
        this.setupPlaylistEventListeners();
        
        // View controls
        document.getElementById('gridViewBtn').addEventListener('click', () => {
            this.switchViewMode('grid');
        });
        
        document.getElementById('listViewBtn').addEventListener('click', () => {
            this.switchViewMode('list');
        });
        
        // Sort controls
        document.getElementById('sortSelect').addEventListener('change', () => {
            this.renderMusicLibrary();
        });
        
        // User menu
        document.getElementById('userMenuBtn').addEventListener('click', () => {
            document.getElementById('userDropdown').style.display = 
                document.getElementById('userDropdown').style.display === 'block' ? 'none' : 'block';
        });
        
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu')) {
                document.getElementById('userDropdown').style.display = 'none';
            }
            
            if (!e.target.closest('.search-container')) {
                this.hideSuggestions();
            }
        });
    }
    
    setupAuthEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(`${tab}Form`).classList.add('active');
            });
        });
        
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const email = e.target.querySelector('input[type="email"]').value;
            const password = e.target.querySelector('input[type="password"]').value;
            this.login(email, password);
        });
        
        // Register form
        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const userData = {
                name: formData.get('name'),
                email: formData.get('email'),
                password: formData.get('password'),
                confirmPassword: formData.get('confirmPassword')
            };
            
            if (userData.password !== userData.confirmPassword) {
                this.showNotification('Passwords do not match', 'error');
                return;
            }
            
            this.register(userData);
        });
        
        // Modal close buttons
        document.querySelectorAll('.modal .close').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('show');
            });
        });
    }
    
    setupPlayerEventListeners() {
        // Play/Pause button
        document.getElementById('playPauseBtn').addEventListener('click', () => {
            if (this.isPlaying) {
                this.pauseMusic();
            } else if (this.currentTrack) {
                this.resumeMusic();
            }
        });
        
        // Previous/Next buttons
        document.getElementById('prevBtn').addEventListener('click', () => {
            this.previousTrack();
        });
        
        document.getElementById('nextBtn').addEventListener('click', () => {
            this.nextTrack();
        });
        
        // Shuffle button
        document.getElementById('shuffleBtn').addEventListener('click', () => {
            this.toggleShuffle();
        });
        
        // Repeat button
        document.getElementById('repeatBtn').addEventListener('click', () => {
            this.toggleRepeat();
        });
        
        // Volume control
        document.getElementById('volumeSlider').addEventListener('input', (e) => {
            this.setVolume(parseInt(e.target.value));
        });
        
        document.getElementById('volumeBtn').addEventListener('click', () => {
            if (this.volume > 0) {
                this.lastVolume = this.volume;
                this.setVolume(0);
            } else {
                this.setVolume(this.lastVolume || 50);
            }
        });
        
        // Progress bar
        document.getElementById('progressTrack').addEventListener('click', (e) => {
            const rect = e.target.getBoundingClientRect();
            const percentage = ((e.clientX - rect.left) / rect.width) * 100;
            this.seekTo(percentage);
        });
        
        // Queue controls
        document.getElementById('queueBtn').addEventListener('click', () => {
            document.getElementById('queueSidebar').classList.toggle('open');
        });
        
        document.getElementById('closeQueue').addEventListener('click', () => {
            document.getElementById('queueSidebar').classList.remove('open');
        });
        
        // Favorite button
        document.getElementById('favoriteBtn').addEventListener('click', () => {
            if (this.currentTrack) {
                this.toggleFavorite(this.currentTrack.id);
            }
        });
    }
    
    setupUploadEventListeners() {
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadModal = document.getElementById('uploadModal');
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        uploadBtn.addEventListener('click', () => {
            uploadModal.classList.add('show');
        });
        
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files);
            this.uploadMusic(files);
        });
        
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.uploadMusic(files);
        });
    }
    
    setupSearchEventListeners() {
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchMusic(e.target.value);
            }, 300);
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSuggestions();
                searchInput.blur();
            }
        });
    }
    
    setupPlaylistEventListeners() {
        const createPlaylistBtn = document.getElementById('createPlaylistBtn');
        const playlistModal = document.getElementById('playlistModal');
        const playlistForm = document.getElementById('playlistForm');
        
        createPlaylistBtn.addEventListener('click', () => {
            playlistModal.classList.add('show');
        });
        
        playlistForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            this.createPlaylist(
                formData.get('name'),
                formData.get('description'),
                formData.get('privacy') === 'public'
            );
        });
    }
    
    // View Management
    switchView(viewName) {
        this.currentView = viewName;
        
        // Update nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });
        
        // Update view content
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}View`);
        });
        
        this.renderCurrentView();
    }
    
    switchViewMode(mode) {
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.getElementById(`${mode}ViewBtn`).classList.add('active');
        this.renderMusicLibrary();
    }
    
    renderCurrentView() {
        switch (this.currentView) {
            case 'library':
                this.renderMusicLibrary();
                break;
            case 'playlists':
                this.renderPlaylists();
                break;
            case 'explore':
                this.renderExploreView();
                break;
        }
    }
    
    renderExploreView() {
        // Load featured artists and genres
        this.loadFeaturedContent();
    }
    
    async loadFeaturedContent() {
        try {
            const [artistsResponse, genresResponse] = await Promise.all([
                fetch('/api/explore/artists'),
                fetch('/api/explore/genres')
            ]);
            
            if (artistsResponse.ok && genresResponse.ok) {
                const artists = await artistsResponse.json();
                const genres = await genresResponse.json();
                
                this.renderFeaturedArtists(artists);
                this.renderGenres(genres);
            }
        } catch (error) {
            console.error('Failed to load featured content:', error);
        }
    }
    
    renderFeaturedArtists(artists) {
        const container = document.getElementById('featuredArtists');
        container.innerHTML = '';
        
        artists.forEach(artist => {
            const artistCard = document.createElement('div');
            artistCard.className = 'artist-card';
            artistCard.innerHTML = `
                <div class="artist-avatar">
                    <img src="${artist.avatar || './assets/images/default-artist.jpg'}" alt="${artist.name}" />
                </div>
                <div class="artist-name">${artist.name}</div>
            `;
            
            artistCard.addEventListener('click', () => {
                this.showArtistDetails(artist);
            });
            
            container.appendChild(artistCard);
        });
    }
    
    renderGenres(genres) {
        const container = document.getElementById('genresGrid');
        container.innerHTML = '';
        
        genres.forEach(genre => {
            const genreCard = document.createElement('div');
            genreCard.className = 'genre-card';
            genreCard.innerHTML = `
                <div class="genre-name">${genre.name}</div>
            `;
            
            genreCard.addEventListener('click', () => {
                this.browseGenre(genre);
            });
            
            container.appendChild(genreCard);
        });
    }
    
    // Utility Methods
    showLoginModal() {
        document.getElementById('loginModal').classList.add('show');
    }
    
    hideLoginModal() {
        document.getElementById('loginModal').classList.remove('show');
    }
    
    hidePlaylistModal() {
        document.getElementById('playlistModal').classList.remove('show');
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
        
        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
    }
    
    async toggleFavorite(trackId) {
        try {
            const response = await fetch(`/api/music/${trackId}/favorite`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Update local data
                const track = this.musicLibrary.find(t => t.id === trackId);
                if (track) {
                    track.isFavorite = result.isFavorite;
                }
                
                // Update UI
                this.updateFavoriteButtons(trackId, result.isFavorite);
                
                this.showNotification(
                    result.isFavorite ? 'Added to favorites' : 'Removed from favorites',
                    'success'
                );
            }
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
            this.showNotification('Failed to update favorite', 'error');
        }
    }
    
    updateFavoriteButtons(trackId, isFavorite) {
        document.querySelectorAll(`[data-track-id="${trackId}"] .favorite-btn i`).forEach(icon => {
            icon.className = isFavorite ? 'fas fa-heart' : 'far fa-heart';
        });
        
        if (this.currentTrack && this.currentTrack.id === trackId) {
            document.getElementById('favoriteBtn').classList.toggle('active', isFavorite);
        }
    }
    
    // Service Worker Setup for PWA
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration);
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        }
    }
    
    // Offline Support
    async cacheTrack(track) {
        if ('caches' in window) {
            try {
                const cache = await caches.open('music-cache-v1');
                await cache.add(track.url);
                track.isCached = true;
                this.showNotification('Track cached for offline playback', 'success');
            } catch (error) {
                console.error('Failed to cache track:', error);
            }
        }
    }
    
    // Analytics and Tracking
    scrobbleTrack(track) {
        // Send listening data to analytics service
        if (window.gtag) {
            window.gtag('event', 'play_track', {
                track_id: track.id,
                track_title: track.title,
                track_artist: track.artist
            });
        }
    }
    
    addToRecentlyPlayed(track) {
        let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
        
        // Remove track if it already exists
        recentlyPlayed = recentlyPlayed.filter(t => t.id !== track.id);
        
        // Add to beginning of array
        recentlyPlayed.unshift(track);
        
        // Keep only last 50 tracks
        recentlyPlayed = recentlyPlayed.slice(0, 50);
        
        localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
    }
    
    applyUserPreferences(preferences) {
        if (preferences.volume !== undefined) {
            this.setVolume(preferences.volume);
        }
        
        if (preferences.theme) {
            document.body.className = preferences.theme;
        }
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.musicApp = new SamsungMusicApp();
});

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--background-secondary);
        color: var(--text-primary);
        padding: var(--spacing-md);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        z-index: 2001;
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        min-width: 300px;
        animation: slideIn 0.3s ease;
        border-left: 4px solid var(--primary-color);
    }
    
    .notification.success {
        border-left-color: var(--success-color);
    }
    
    .notification.error {
        border-left-color: var(--error-color);
    }
    
    .notification.warning {
        border-left-color: var(--warning-color);
    }
    
    .notification-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: var(--font-size-lg);
        cursor: pointer;
        padding: 0;
        margin-left: auto;
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;

document.head.appendChild(notificationStyles);