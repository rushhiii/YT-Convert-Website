// YouTube Converter - JavaScript

class YouTubeConverter {
    constructor() {
        this.currentVideoData = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupTabs();
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
    }

    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.format-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                // Remove active from all tabs
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // Add active to clicked tab
                btn.classList.add('active');
                document.getElementById(`${targetTab}Formats`).classList.add('active');
            });
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

            const response = await fetch('/api/info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to get video information');
            }

            this.currentVideoData = data;
            this.displayVideoInfo(data);
            this.displayFormats(data.formats);
            
        } catch (error) {
            console.error('Error:', error);
            this.showError(error.message || 'Failed to get video information');
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
        const length = document.getElementById('videoLength');
        const formattedDuration = this.formatDuration(videoDetails.lengthSeconds);
        
        if (duration) duration.textContent = formattedDuration;
        if (length) length.textContent = formattedDuration;

        // Update video description
        const description = document.getElementById('videoDescription');
        if (description) {
            description.textContent = videoDetails.description || 'No description available';
        }

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
                    <p>No ${type} formats available</p>
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
                        <span>Container: ${containerText}</span>
                        ${format.fps ? `<span>• ${format.fps} FPS</span>` : ''}
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
            this.showDownloadProgress();

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
            let filename = `video.${type === 'audio' ? 'mp3' : 'mp4'}`;
            
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

            this.hideDownloadProgress();
            this.showSuccess('Download started successfully!');

        } catch (error) {
            console.error('Download error:', error);
            this.hideDownloadProgress();
            this.showError(error.message || 'Download failed');
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
        const errorDiv = document.getElementById('error');
        if (!errorDiv) {
            // Create error div if it doesn't exist
            const inputSection = document.querySelector('.input-section');
            const errorHtml = `
                <div id="error" class="alert alert-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>${message}</span>
                </div>
            `;
            inputSection.insertAdjacentHTML('afterend', errorHtml);
        } else {
            errorDiv.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>${message}</span>
            `;
            errorDiv.style.display = 'flex';
        }
    }

    hideError() {
        const error = document.getElementById('error');
        if (error) {
            error.style.display = 'none';
        }
    }

    showSuccess(message) {
        // Remove existing success message
        const existingSuccess = document.querySelector('.alert-success');
        if (existingSuccess) {
            existingSuccess.remove();
        }

        const inputSection = document.querySelector('.input-section');
        const successHtml = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            </div>
        `;
        inputSection.insertAdjacentHTML('afterend', successHtml);

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

    showDownloadProgress() {
        const downloadSection = document.getElementById('downloadSection');
        if (downloadSection) {
            downloadSection.style.display = 'block';
        }
    }

    hideDownloadProgress() {
        const downloadSection = document.getElementById('downloadSection');
        if (downloadSection) {
            downloadSection.style.display = 'none';
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
        window.app.hideDownloadProgress();
    }
});
