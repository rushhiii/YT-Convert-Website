const express = require('express');
const cors = require('cors');
const path = require('path');
const ytdl = require('@distube/ytdl-core');

process.env.YTDL_NO_UPDATE = '1';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 120000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 8);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 600000);

const rateLimitMap = new Map();
const infoCache = new Map();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('.', { extensions: ['html'] }));

// ---------- Helpers ----------
function extractVideoId(rawUrl) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    for (const pattern of patterns) {
        const match = rawUrl.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function isValidYouTubeUrl(rawUrl) {
    const patterns = [
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/
    ];
    return patterns.some((p) => p.test(rawUrl));
}

function bestThumbnail(thumbnails = []) {
    if (!thumbnails.length) return '';
    const maxRes = thumbnails.find((t) => t.url.includes('maxresdefault'));
    const hq = thumbnails.find((t) => t.url.includes('hqdefault'));
    return maxRes?.url || hq?.url || thumbnails[thumbnails.length - 1].url || '';
}

function toFormats(info) {
    const all = info.formats || [];

    const progressive = all
        .filter((f) => !f.isLive && f.hasVideo && f.hasAudio && f.container === 'mp4')
        .map((f) => ({
            itag: f.itag,
            quality: f.qualityLabel || (f.height ? `${f.height}p` : 'Video'),
            container: f.container || 'mp4',
            filesize: Number(f.contentLength || f.approxDurationMs) || null,
            fps: f.fps,
            width: f.width,
            height: f.height,
            type: 'video'
        }));

    const audioOnly = all
        .filter((f) => !f.isLive && f.hasAudio && !f.hasVideo)
        .map((f) => ({
            itag: f.itag,
            quality: f.audioBitrate ? `${f.audioBitrate}kbps` : 'Audio',
            container: f.container || 'm4a',
            filesize: Number(f.contentLength || f.approxDurationMs) || null,
            audioBitrate: f.audioBitrate,
            type: 'audio'
        }));

    const sortVideo = (list) => list
        .sort((a, b) => (Number(b.height || 0) - Number(a.height || 0)) || (Number(b.fps || 0) - Number(a.fps || 0)))
        .filter((f, idx, arr) => idx === arr.findIndex((x) => x.quality === f.quality && x.container === f.container))
        .slice(0, 8);

    const sortAudio = (list) => list
        .sort((a, b) => Number(b.audioBitrate || 0) - Number(a.audioBitrate || 0))
        .filter((f, idx, arr) => idx === arr.findIndex((x) => x.quality === f.quality && x.container === f.container))
        .slice(0, 6);

    const video = sortVideo(progressive);
    const audio = sortAudio(audioOnly);

    return { video, audio };
}

function cleanFileName(name) {
    return name.replace(/[\/:*?"<>|]/g, '').trim() || 'video';
}

function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimitMap.get(ip) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };

    if (now > record.reset) {
        record.count = 0;
        record.reset = now + RATE_LIMIT_WINDOW_MS;
    }

    record.count += 1;
    rateLimitMap.set(ip, record);

    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(RATE_LIMIT_MAX - record.count, 0));
    res.setHeader('X-RateLimit-Reset', record.reset);

    if (record.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
    }

    next();
}

// ---------- Routes ----------
app.post('/api/info', rateLimit, async (req, res) => {
    try {
        const { url } = req.body || {};
        if (!url || !isValidYouTubeUrl(url)) {
            return res.status(400).json({ error: 'Please provide a valid YouTube URL.' });
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Could not extract video ID from URL.' });
        }

        const cached = infoCache.get(videoId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return res.json(cached.data);
        }
        const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

        const fetchInfo = async () => ytdl.getInfo(cleanUrl, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                }
            }
        });

        // Try full info, fallback to basic info if throttled
        let info;
        try {
            info = await fetchInfo();
        } catch (primaryErr) {
            console.warn('Primary info fetch failed, trying basicInfo:', primaryErr.message);
            info = await ytdl.getBasicInfo(cleanUrl);
        }

        const formats = toFormats(info);
        if (!formats.video.length && !formats.audio.length) {
            return res.status(503).json({ error: 'No downloadable formats were found for this video. Try another video.' });
        }

        const videoDetails = {
            title: info.videoDetails.title || 'Unknown Title',
            author: info.videoDetails.author?.name || 'Unknown Author',
            lengthSeconds: Number(info.videoDetails.lengthSeconds || 0),
            viewCount: Number(info.videoDetails.viewCount || 0),
            thumbnail: bestThumbnail(info.videoDetails.thumbnails),
            description: info.videoDetails.description ? `${info.videoDetails.description.slice(0, 200)}...` : '',
            uploadDate: info.videoDetails.uploadDate || ''
        };

        const payload = { success: true, videoDetails, formats };
        infoCache.set(videoId, { data: payload, timestamp: Date.now() });
        res.json(payload);
    } catch (err) {
        console.error('Info error:', err.message);
        if (err.message?.includes('429')) {
            return res.status(429).json({ error: 'YouTube is rate limiting right now. Please wait a few minutes and retry.' });
        }
        if (err.message?.toLowerCase().includes('unavailable')) {
            return res.status(404).json({ error: 'This video is unavailable or restricted.' });
        }
        res.status(500).json({ error: 'Failed to fetch video info. Please try again in a bit.' });
    }
});

app.post('/api/download', rateLimit, async (req, res) => {
    try {
        const { url, itag, type } = req.body || {};
        if (!url || !itag || !type) {
            return res.status(400).json({ error: 'url, itag, and type are required.' });
        }
        if (!isValidYouTubeUrl(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL.' });
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Could not extract video ID.' });
        }

        const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const info = await ytdl.getInfo(cleanUrl);
        const format = info.formats.find((f) => String(f.itag) === String(itag));
        if (!format) {
            return res.status(400).json({ error: 'Requested format not available.' });
        }

        const baseName = cleanFileName(info.videoDetails.title || 'video');
        const extension = format.container || (type === 'audio' ? 'mp3' : 'mp4');
        const filename = `${baseName}.${extension}`;

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', type === 'audio' ? 'audio/mpeg' : 'video/mp4');

        const stream = ytdl(cleanUrl, { quality: itag });
        stream.on('error', (e) => {
            console.error('Stream error:', e.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed during streaming.' });
            }
        });
        stream.pipe(res);
    } catch (err) {
        console.error('Download error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed. Please retry.' });
        }
    }
});

// Health checks
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback handler
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
