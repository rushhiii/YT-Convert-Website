class YouTubeConverterApp {
    constructor() {
        this.current = null;
        this.downloads = [];
        this.init();
    }

    init() {
        this.loadDownloads();
        this.bindCoreEvents();
        this.setupNav();
        this.setupScrollTop();
    }

    bindCoreEvents() {
        const getInfoBtn = document.getElementById('getInfoBtn');
        const urlInput = document.getElementById('urlInput');

        if (getInfoBtn) getInfoBtn.addEventListener('click', () => this.handleFetch());
        if (urlInput) {
            urlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleFetch();
            });
            urlInput.addEventListener('paste', () => {
                setTimeout(() => {
                    if (this.isValidYouTubeUrl(urlInput.value)) this.handleFetch();
                }, 80);
            });
        }

        const clearBtn = document.querySelector('.clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearDownloads());
    }

    setupNav() {
        const hamburger = document.getElementById('hamburgerBtn');
        const nav = document.getElementById('mainNav');
        if (hamburger && nav) {
            hamburger.addEventListener('click', () => {
                nav.classList.toggle('open');
                hamburger.classList.toggle('active');
            });
            nav.querySelectorAll('a').forEach((link) => {
                link.addEventListener('click', () => {
                    nav.classList.remove('open');
                    hamburger.classList.remove('active');
                });
            });
        }

        const header = document.querySelector('header');
        const spacer = document.querySelector('.header-spacer');
        window.addEventListener('scroll', () => {
            const scrolled = window.scrollY > 20;
            if (header) header.classList.toggle('scrolled', scrolled);
            if (spacer) spacer.style.height = scrolled ? '72px' : '80px';
        });
    }

    setupScrollTop() {
        const btn = document.getElementById('scrollTopButton');
        if (!btn) return;
        window.addEventListener('scroll', () => {
            btn.classList.toggle('visible', window.scrollY > 400);
        });
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    isValidYouTubeUrl(url) {
        return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url.trim());
    }

    async handleFetch() {
        const urlInput = document.getElementById('urlInput');
        const url = (urlInput?.value || '').trim();
        if (!url) return this.showError('Please enter a YouTube URL');
        if (!this.isValidYouTubeUrl(url)) return this.showError('Please enter a valid YouTube URL');

        this.showLoading(true);
        this.hideError();
        this.hideVideoInfo();
        this.hideFormatSection();
        this.hideEmptyState();

        try {
            const res = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch info');

            this.current = { ...data, url };
            this.renderVideoInfo(data.videoDetails);
            this.renderFormats(data.formats);
            this.showVideoInfo();
            this.showFormatSection();
            this.showSectionDownloadsIfAny();
        } catch (err) {
            this.showError(err.message || 'Failed to fetch info');
            this.showEmptyState();
        } finally {
            this.showLoading(false);
        }
    }

    renderVideoInfo(details) {
        const thumb = document.getElementById('videoThumbnail');
        const title = document.getElementById('videoTitle');
        const author = document.getElementById('videoAuthor');
        const views = document.getElementById('videoViews');
        const duration = document.getElementById('videoDuration');

        if (thumb && details.thumbnail) {
            thumb.src = details.thumbnail;
            thumb.alt = details.title;
        }
        if (title) title.textContent = details.title;
        if (author) author.textContent = details.author;
        if (views) views.textContent = this.formatNumber(details.viewCount);
        if (duration) duration.textContent = this.formatDuration(details.lengthSeconds);
    }

    renderFormats(formats) {
        this.renderFormatGroup('audioFormatGrid', formats.audio || [], 'audio');
        this.renderFormatGroup('videoFormatGrid', formats.video || [], 'video');
    }

    renderFormatGroup(containerId, formats, type) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (!formats.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-${type === 'audio' ? 'music' : 'video'}"></i>
                    <h3>No ${type} formats available</h3>
                    <p>Try another video.</p>
                </div>
            `;
            return;
        }

        const thumb = this.current?.videoDetails?.thumbnail || '';
        const title = this.current?.videoDetails?.title || 'Video';

        formats.forEach((f) => {
            const card = document.createElement('div');
            card.className = 'format-item';
            const sizeLabel = f.filesize ? this.formatFileSize(f.filesize) : 'Size unknown';
            card.innerHTML = `
                <div class="format-preview">
                    ${thumb ? `<img src="${thumb}" alt="${title}" class="format-thumbnail">` : ''}
                    <div class="format-type-icon"><i class="fas fa-${type === 'audio' ? 'music' : 'video'}"></i></div>
                </div>
                <div class="format-info">
                    <h4>${f.quality || 'Unknown'}</h4>
                    <div class="format-details">Format: ${f.container || 'n/a'}${f.fps ? ` • ${f.fps} FPS` : ''}</div>
                    <div class="format-size">${sizeLabel}</div>
                </div>
                <button class="download-btn" data-itag="${f.itag}" data-type="${type}">
                    <i class="fas fa-download"></i> Download
                </button>
            `;
            card.querySelector('.download-btn').addEventListener('click', () => this.handleDownload(f.itag, type));
            container.appendChild(card);
        });
    }

    quickDownload(type) {
        if (!this.current || !this.current.formats) return this.showError('Load a video first');
        const list = type === 'audio' ? this.current.formats.audio : this.current.formats.video;
        if (!list || !list.length) return this.showError(`No ${type} formats available`);
        this.handleDownload(list[0].itag, type);
    }

    async handleDownload(itag, type) {
        if (!this.current) return this.showError('Load a video first');
        try {
            this.showDownloadModal();
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: this.current.url, itag, type })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Download failed');
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const header = res.headers.get('content-disposition');
            const match = header ? header.match(/filename="(.+)"/) : null;
            const filename = match ? match[1] : `${this.current.videoDetails.title || 'video'}.${type === 'audio' ? 'm4a' : 'mp4'}`;
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.addDownload({
                title: this.current.videoDetails.title,
                author: this.current.videoDetails.author,
                thumbnail: this.current.videoDetails.thumbnail,
                type,
                quality: itag,
                filename,
                downloadDate: new Date().toISOString()
            });
            this.showSuccess('Download started');
        } catch (err) {
            this.showError(err.message || 'Download failed');
        } finally {
            this.hideDownloadModal();
        }
    }

    // ---------- Downloads ----------
    loadDownloads() {
        try {
            this.downloads = JSON.parse(localStorage.getItem('yt-converter-downloads') || '[]');
        } catch (e) {
            this.downloads = [];
        }
        this.renderDownloads();
    }

    addDownload(entry) {
        this.downloads.unshift(entry);
        this.downloads = this.downloads.slice(0, 50);
        localStorage.setItem('yt-converter-downloads', JSON.stringify(this.downloads));
        this.renderDownloads();
    }

    clearDownloads() {
        this.downloads = [];
        localStorage.removeItem('yt-converter-downloads');
        this.renderDownloads();
    }

    renderDownloads() {
        const grid = document.getElementById('downloadsGrid');
        const section = document.getElementById('downloads');
        if (!grid) return;

        if (!this.downloads.length) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-download"></i>
                    <h3>No Downloads Yet</h3>
                    <p>Your downloaded files will appear here.</p>
                </div>
            `;
            if (section) section.style.display = 'none';
            return;
        }

        if (section) section.style.display = 'block';
        grid.innerHTML = '';
        this.downloads.forEach((d) => {
            const item = document.createElement('div');
            item.className = 'music-item';
            const date = new Date(d.downloadDate).toLocaleDateString();
            item.innerHTML = `
                <div class="music-artwork">
                    <img src="${d.thumbnail}" alt="${d.title}">
                    <div class="play-overlay"><i class="fas fa-${d.type === 'audio' ? 'music' : 'video'}"></i></div>
                </div>
                <div class="music-info">
                    <div class="music-title">${d.title}</div>
                    <div class="music-artist">${d.author}</div>
                    <div class="music-duration">${d.type.toUpperCase()} • ${date}</div>
                </div>
            `;
            grid.appendChild(item);
        });
    }

    showSectionDownloadsIfAny() {
        const section = document.getElementById('downloads');
        if (section && this.downloads.length) section.style.display = 'block';
    }

    // ---------- UI Helpers ----------
    showLoading(show) {
        const el = document.getElementById('loading');
        if (el) el.style.display = show ? 'flex' : 'none';
    }

    showError(msg) {
        this.hideError();
        const view = document.getElementById('converterView');
        if (!view) return;
        const div = document.createElement('div');
        div.className = 'alert alert-error';
        div.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${msg}</span>`;
        view.prepend(div);
        setTimeout(() => this.hideError(), 5000);
    }

    hideError() {
        document.querySelectorAll('.alert-error').forEach((el) => el.remove());
    }

    showSuccess(msg) {
        this.hideSuccess();
        const view = document.getElementById('converterView');
        if (!view) return;
        const div = document.createElement('div');
        div.className = 'alert alert-success';
        div.innerHTML = `<i class="fas fa-check-circle"></i><span>${msg}</span>`;
        view.prepend(div);
        setTimeout(() => this.hideSuccess(), 4000);
    }

    hideSuccess() {
        document.querySelectorAll('.alert-success').forEach((el) => el.remove());
    }

    showVideoInfo() {
        const el = document.getElementById('videoInfo');
        if (el) el.style.display = 'block';
    }

    hideVideoInfo() {
        const el = document.getElementById('videoInfo');
        if (el) el.style.display = 'none';
    }

    showFormatSection() {
        const el = document.getElementById('formatSection');
        if (el) el.style.display = 'block';
    }

    hideFormatSection() {
        const el = document.getElementById('formatSection');
        if (el) el.style.display = 'none';
    }

    showEmptyState() {
        const el = document.getElementById('emptyState');
        if (el) el.style.display = 'block';
    }

    hideEmptyState() {
        const el = document.getElementById('emptyState');
        if (el) el.style.display = 'none';
    }

    showDownloadModal() {
        const modal = document.getElementById('downloadModal');
        if (modal) modal.classList.add('show');
        const progress = document.getElementById('downloadProgress');
        const status = document.getElementById('downloadStatus');
        if (progress) progress.style.width = '100%';
        if (status) status.textContent = 'Preparing download...';
    }

    hideDownloadModal() {
        const modal = document.getElementById('downloadModal');
        if (modal) modal.classList.remove('show');
        const progress = document.getElementById('downloadProgress');
        if (progress) progress.style.width = '0%';
    }

    // ---------- Utilities ----------
    formatDuration(sec = 0) {
        const s = Number(sec) || 0;
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const rem = s % 60;
        return h ? `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}` : `${m}:${String(rem).padStart(2, '0')}`;
    }

    formatNumber(n = 0) {
        const num = Number(n) || 0;
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
        if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
        return num.toString();
    }

    formatFileSize(bytes) {
        const val = Number(bytes) || 0;
        if (!val) return 'Unknown';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.min(Math.floor(Math.log(val) / Math.log(1024)), sizes.length - 1);
        return `${(val / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.app = new YouTubeConverterApp();
});
