// YouTube Converter - JavaScript with Samsung Music Clone UI

class YouTubeConverter {
    constructor() {
        this.currentVideoData = null;
        this.currentView = 'grid';
        this.downloads = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupTabs();
        this.setupViewSwitching();
        this.loadDownloads();
    }

    bindEvents() {
        // Get info button
        const getInfoBtn = document.getElementById('getInfoBtn');
        const urlInput = document.getElementById('urlInput');

        if (getInfoBtn) {
            getInfoBtn.addEventListener('click', () => this.getVideoInfo());
        }

        if (urlInput) {
            urlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.getVideoInfo();
                }
            });

            // Auto-fetch when URL is pasted
            urlInput.addEventListener('paste', () => {
                setTimeout(() => {
                    if (this.isValidYouTubeUrl(urlInput.value)) {
                        this.getVideoInfo();
                    }
                }, 100);
            });
        }

        // View controls
        const viewBtns = document.querySelectorAll('.view-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const viewType = btn.dataset.view;
                this.switchViewMode(viewType);
            });
        });

        // Quality sort
        const qualitySort = document.getElementById('qualitySort');
        if (qualitySort) {
            qualitySort.addEventListener('change', () => {
                this.sortFormats();
            });
        }
    }

    setupTabs() {
        // Navigation tabs
        const navTabs = document.querySelectorAll('.nav-tab[data-view]');
        navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetView = tab.dataset.view;
                this.switchMainView(targetView);
            });
        });

        // Format tabs
        const formatTabs = document.querySelectorAll('.nav-tab[data-tab]');
        const tabContents = document.querySelectorAll('.format-content');

        formatTabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                // Remove active from all tabs
                formatTabs.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // Add active to clicked tab
                btn.classList.add('active');
                document.getElementById(`${targetTab}Formats`).classList.add('active');
            });
        });
    }

    setupViewSwitching() {
        // This handles grid/list view switching for formats
    }

    switchMainView(viewName) {
        // Remove active from all nav tabs
        const navTabs = document.querySelectorAll('.nav-tab[data-view]');
        navTabs.forEach(tab => tab.classList.remove('active'));
        
        // Add active to clicked tab
        const activeTab = document.querySelector(`.nav-tab[data-view="${viewName}"]`);
        if (activeTab) activeTab.classList.add('active');
        
        // Switch views
        const views = document.querySelectorAll('.view');
        views.forEach(view => view.classList.remove('active'));
        
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) targetView.classList.add('active');
    }

    switchViewMode(mode) {
        this.currentView = mode;
        
        // Update view buttons
        const viewBtns = document.querySelectorAll('.view-btn');
        viewBtns.forEach(btn => btn.classList.remove('active'));
        
        const activeBtn = document.querySelector(`.view-btn[data-view="${mode}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        // Update grid classes
        const grids = document.querySelectorAll('.music-grid');
        grids.forEach(grid => {
            if (mode === 'list') {
                grid.classList.add('list-view');
            } else {
                grid.classList.remove('list-view');
            }
        });
    }

    isValidYouTubeUrl(url) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        return youtubeRegex.test(url);
    }

    async getVideoInfo() {
        const urlInput = document.getElementById('urlInput');
        const url = urlInput.value.trim();

        if (!url) {
            this.showError('Please enter a YouTube URL');
            return;
        }

        if (!this.isValidYouTubeUrl(url)) {
            this.showError('Please enter a valid YouTube URL');
            return;
        }

        try {
            this.showLoading(true);
            this.hideError();
            this.hideVideoInfo();
            this.hideFormatSection();
            this.hideEmptyState();

            const response = await fetch('/api/info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!response.ok) {
                // Handle specific error types
                if (response.status === 429) {
                    const retryAfter = data.retryAfter ? ` Please try again in ${data.retryAfter} seconds.` : ' Please wait a few minutes before trying again.';
                    throw new Error((data.error || 'Rate limit exceeded.') + retryAfter);
                } else if (response.status === 404) {
                    throw new Error(data.error || 'Video not found or unavailable.');
                } else if (response.status === 410) {
                    throw new Error(data.error || 'Video has been removed or is no longer available.');
                } else {
                    throw new Error(data.error || 'Failed to get video information');
                }
            }

            this.currentVideoData = data;
            this.displayVideoInfo(data);
            this.displayFormats(data.formats);
            
        } catch (error) {
            console.error('Error:', error);
            this.showError(error.message || 'Failed to get video information');
            this.showEmptyState();
        } finally {
            this.showLoading(false);
        }
    }

    displayVideoInfo(data) {
        const videoInfo = document.getElementById('videoInfo');
        const videoDetails = data.videoDetails;

        // Update video thumbnail
        const thumbnail = document.getElementById('videoThumbnail');
        if (thumbnail && videoDetails.thumbnail) {
            thumbnail.src = videoDetails.thumbnail;
            thumbnail.alt = videoDetails.title;
        }

        // Update video title
        const title = document.getElementById('videoTitle');
        if (title) {
            title.textContent = videoDetails.title;
        }

        // Update video author
        const author = document.getElementById('videoAuthor');
        if (author) {
            author.textContent = videoDetails.author;
        }

        // Update video views
        const views = document.getElementById('videoViews');
        if (views) {
            views.textContent = this.formatNumber(videoDetails.viewCount);
        }

        // Update video duration
        const duration = document.getElementById('videoDuration');
        const formattedDuration = this.formatDuration(videoDetails.lengthSeconds);
        
        if (duration) duration.textContent = formattedDuration;

        this.showVideoInfo();
    }

    displayFormats(formats) {
        const videoFormats = formats.video || [];
        const audioFormats = formats.audio || [];

        this.renderFormats('videoFormatGrid', videoFormats, 'video');
        this.renderFormats('audioFormatGrid', audioFormats, 'audio');
        
        this.showFormatSection();
    }

    renderFormats(containerId, formats, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (formats.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-${type === 'audio' ? 'music' : 'video'}"></i>
                    <h3>No ${type} formats available</h3>
                    <p>This video doesn't have ${type} formats available for download.</p>
                </div>
            `;
            return;
        }

        formats.forEach(format => {
            const formatItem = document.createElement('div');
            formatItem.className = 'format-item';
            
            const qualityText = format.quality || 'Unknown';
            const containerText = format.container || 'Unknown';
            const sizeText = format.filesize ? this.formatFileSize(format.filesize) : 'Unknown size';
            
            // Get video thumbnail from current video data
            const thumbnailUrl = this.currentVideoData?.videoDetails?.thumbnail || '';
            const videoTitle = this.currentVideoData?.videoDetails?.title || 'Video';
            
            formatItem.innerHTML = `
                <div class="format-preview">
                    ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="${videoTitle}" class="format-thumbnail">` : ''}
                    <div class="format-type-icon">
                        <i class="fas fa-${type === 'audio' ? 'music' : 'video'}"></i>
                    </div>
                </div>
                <div class="format-info">
                    <h4>${qualityText}</h4>
                    <div class="format-details">
                        <span>Format: ${containerText}</span>
                        ${format.fps ? ` • ${format.fps} FPS` : ''}
                    </div>
                    <div class="format-size">${sizeText}</div>
                </div>
                <button class="download-btn" onclick="app.downloadFormat('${format.itag}', '${type}')">
                    <i class="fas fa-download"></i>
                    Download
                </button>
            `;

            container.appendChild(formatItem);
        });
    }

    async downloadFormat(itag, type) {
        if (!this.currentVideoData) {
            this.showError('No video data available');
            return;
        }

        try {
            this.showDownloadModal();

            const url = document.getElementById('urlInput').value;
            
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url, 
                    itag, 
                    type 
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Download failed');
            }

            // Create download link
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            
            // Get filename from content-disposition header or create one
            const contentDisposition = response.headers.get('content-disposition');
            let filename = `video.${type === 'audio' ? 'mp4' : 'mp4'}`;
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            // Add to downloads history
            this.addToDownloads({
                title: this.currentVideoData.videoDetails.title,
                author: this.currentVideoData.videoDetails.author,
                thumbnail: this.currentVideoData.videoDetails.thumbnail,
                type: type,
                quality: itag,
                filename: filename,
                downloadDate: new Date().toISOString()
            });

            this.hideDownloadModal();
            this.showSuccess('Download completed successfully!');

        } catch (error) {
            console.error('Download error:', error);
            this.hideDownloadModal();
            this.showError(error.message || 'Download failed');
        }
    }

    addToDownloads(downloadInfo) {
        this.downloads.unshift(downloadInfo);
        // Keep only last 50 downloads
        if (this.downloads.length > 50) {
            this.downloads = this.downloads.slice(0, 50);
        }
        this.saveDownloads();
        this.renderDownloads();
    }

    loadDownloads() {
        const stored = localStorage.getItem('yt-converter-downloads');
        if (stored) {
            try {
                this.downloads = JSON.parse(stored);
            } catch (e) {
                this.downloads = [];
            }
        }
        this.renderDownloads();
    }

    saveDownloads() {
        localStorage.setItem('yt-converter-downloads', JSON.stringify(this.downloads));
    }

    renderDownloads() {
        const container = document.getElementById('downloadsGrid');
        if (!container) return;

        if (this.downloads.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-download"></i>
                    <h3>No Downloads Yet</h3>
                    <p>Your downloaded files will appear here.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.downloads.forEach(download => {
            const downloadItem = document.createElement('div');
            downloadItem.className = 'music-item';
            
            const downloadDate = new Date(download.downloadDate).toLocaleDateString();
            
            downloadItem.innerHTML = `
                <div class="music-artwork">
                    <img src="${download.thumbnail}" alt="${download.title}">
                    <div class="play-overlay">
                        <i class="fas fa-${download.type === 'audio' ? 'music' : 'video'}"></i>
                    </div>
                </div>
                <div class="music-info">
                    <div class="music-title">${download.title}</div>
                    <div class="music-artist">${download.author}</div>
                    <div class="music-duration">${download.type.toUpperCase()} • ${downloadDate}</div>
                </div>
            `;
            
            container.appendChild(downloadItem);
        });
    }

    clearDownloads() {
        this.downloads = [];
        this.saveDownloads();
        this.renderDownloads();
    }

    sortFormats() {
        // Implementation for sorting formats
        if (this.currentVideoData && this.currentVideoData.formats) {
            this.displayFormats(this.currentVideoData.formats);
        }
    }

    // Utility functions
    formatDuration(seconds) {
        if (!seconds) return 'Unknown';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    formatNumber(num) {
        if (!num) return '0';
        
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        } else {
            return num.toString();
        }
    }

    formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    // UI State Management
    showLoading(show = true) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    showError(message) {
        // Remove existing error
        const existingError = document.querySelector('.alert-error');
        if (existingError) {
            existingError.remove();
        }

        const converterView = document.getElementById('converterView');
        const errorHtml = `
            <div class="alert alert-error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${message}</span>
            </div>
        `;
        converterView.insertAdjacentHTML('afterbegin', errorHtml);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideError();
        }, 5000);
    }

    hideError() {
        const error = document.querySelector('.alert-error');
        if (error) {
            error.remove();
        }
    }

    showSuccess(message) {
        // Remove existing success message
        const existingSuccess = document.querySelector('.alert-success');
        if (existingSuccess) {
            existingSuccess.remove();
        }

        const converterView = document.getElementById('converterView');
        const successHtml = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            </div>
        `;
        converterView.insertAdjacentHTML('afterbegin', successHtml);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            const successDiv = document.querySelector('.alert-success');
            if (successDiv) {
                successDiv.remove();
            }
        }, 5000);
    }

    showVideoInfo() {
        const videoInfo = document.getElementById('videoInfo');
        if (videoInfo) {
            videoInfo.style.display = 'block';
        }
    }

    hideVideoInfo() {
        const videoInfo = document.getElementById('videoInfo');
        if (videoInfo) {
            videoInfo.style.display = 'none';
        }
    }

    showFormatSection() {
        const formatSection = document.getElementById('formatSection');
        if (formatSection) {
            formatSection.style.display = 'block';
        }
    }

    hideFormatSection() {
        const formatSection = document.getElementById('formatSection');
        if (formatSection) {
            formatSection.style.display = 'none';
        }
    }

    showEmptyState() {
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            emptyState.style.display = 'block';
        }
    }

    hideEmptyState() {
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    showDownloadModal() {
        const modal = document.getElementById('downloadModal');
        if (modal) {
            modal.classList.add('show');
            
            // Update status
            const status = document.getElementById('downloadStatus');
            if (status) {
                status.textContent = 'Preparing download...';
            }
            
            // Animate progress
            const progress = document.getElementById('downloadProgress');
            if (progress) {
                progress.style.width = '0%';
                setTimeout(() => {
                    progress.style.width = '100%';
                }, 100);
            }
        }
    }

    hideDownloadModal() {
        const modal = document.getElementById('downloadModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new YouTubeConverter();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    // Clean up any ongoing operations
    if (window.app) {
        window.app.hideDownloadModal();
    }
});
