const express = require('express');
const cors = require('cors');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const https = require('https');
const http = require('http');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variable to disable update checks
process.env.YTDL_NO_UPDATE = '1';

// Rate limiting variables
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 120000; // 2 minutes
const MAX_REQUESTS_PER_WINDOW = 3; // Max 3 requests per 2 minutes per IP

// Simple cache to reduce YouTube requests
const videoCache = new Map();
const CACHE_DURATION = 300000; // 5 minutes

// Request deduplication to prevent multiple concurrent requests for same video
const pendingRequests = new Map();

// Helper functions for disguising requests
function getRandomUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getRandomMobileUserAgent() {
    const mobileUserAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1'
    ];
    return mobileUserAgents[Math.floor(Math.random() * mobileUserAgents.length)];
}

function getRandomIP() {
    // Generate random residential-looking IP addresses
    const ranges = [
        () => `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        () => `172.${16 + Math.floor(Math.random() * 15)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
    ];
    return ranges[Math.floor(Math.random() * ranges.length)]();
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Rate limiting middleware
const rateLimit = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitMap.has(clientIP)) {
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    const clientData = rateLimitMap.get(clientIP);
    
    if (now > clientData.resetTime) {
        // Reset the rate limit window
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).json({
            error: 'Too many requests. Please wait a minute before trying again.',
            suggestion: 'Our service is rate-limited to prevent overuse. Please be patient.',
            retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        });
    }
    
    clientData.count++;
    next();
};

// Apply rate limiting to API endpoints
app.use('/api/info', rateLimit);
app.use('/api/download', rateLimit);

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get video info with better error handling and fallback
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log('Attempting to get info for URL:', url);

        // Extract video ID and create clean URL
        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Could not extract video ID from URL' });
        }
        
        const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log('Extracted video ID:', videoId);
        console.log('Clean URL:', cleanUrl);

        // Validate YouTube URL
        if (!ytdl.validateURL(cleanUrl)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        // Check cache first to reduce YouTube requests
        const cacheKey = videoId;
        const cachedData = videoCache.get(cacheKey);
        if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
            console.log(`✅ Cache hit for video: ${videoId}`);
            return res.json(cachedData.data);
        }

        // Check if there's already a pending request for this video
        if (pendingRequests.has(cacheKey)) {
            console.log(`⏳ Waiting for pending request for video: ${videoId}`);
            try {
                const result = await pendingRequests.get(cacheKey);
                return res.json(result);
            } catch (error) {
                console.log(`❌ Pending request failed for video: ${videoId}`);
                // Continue to make our own request
            }
        }

        // Try different approaches to get video info with hosting-optimized settings
        let info;
        const attempts = [
            // Attempt 1: Residential-like headers with random elements
            () => Promise.race([
                ytdl.getInfo(cleanUrl, {
                    requestOptions: {
                        headers: {
                            'User-Agent': getRandomUserAgent(),
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Accept-Encoding': 'gzip, deflate',
                            'DNT': '1',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1',
                            'Sec-Fetch-Dest': 'document',
                            'Sec-Fetch-Mode': 'navigate',
                            'Sec-Fetch-Site': 'none',
                            'Cache-Control': 'max-age=0',
                            'X-Forwarded-For': getRandomIP(),
                            'X-Real-IP': getRandomIP()
                        }
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 25 seconds')), 25000))
            ]),
            
            // Attempt 2: Try with basic info only (less suspicious)
            () => Promise.race([
                ytdl.getBasicInfo(cleanUrl, {
                    requestOptions: {
                        headers: {
                            'User-Agent': getRandomUserAgent(),
                            'Accept': '*/*',
                            'X-Forwarded-For': getRandomIP()
                        }
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 20 seconds')), 20000))
            ]),
            
            // Attempt 3: Mobile user agent (often less restricted)
            () => Promise.race([
                ytdl.getInfo(cleanUrl, {
                    requestOptions: {
                        headers: {
                            'User-Agent': getRandomMobileUserAgent(),
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'X-Forwarded-For': getRandomIP()
                        }
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 15 seconds')), 15000))
            ]),

            // Attempt 4: Last resort with minimal headers
            () => Promise.race([
                ytdl.getBasicInfo(cleanUrl, {
                    requestOptions: {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2)'
                        }
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000))
            ])
        ];

        let lastError;
        for (let i = 0; i < attempts.length; i++) {
            try {
                console.log(`Attempt ${i + 1} to get video info...`);
                info = await attempts[i]();
                console.log(`✅ Success on attempt ${i + 1}`);
                break;
            } catch (error) {
                console.log(`❌ Attempt ${i + 1} failed:`, error.message);
                lastError = error;
                
                // Add exponential backoff delays for hosting environments
                if (i < attempts.length - 1) {
                    const baseDelay = 8000; // Start with 8 seconds
                    const delay = Math.min(baseDelay * Math.pow(2, i), 30000); // Exponential backoff, max 30s
                    const jitter = Math.random() * 2000; // Add random jitter to avoid patterns
                    const totalDelay = delay + jitter;
                    
                    console.log(`⏳ Waiting ${Math.round(totalDelay/1000)} seconds before next attempt (hosting optimization)...`);
                    await new Promise(resolve => setTimeout(resolve, totalDelay));
                }
            }
        }

        if (!info) {
            console.error('💥 All attempts failed. Last error:', lastError?.message);
            
            // Provide specific error messages based on the type of error
            let errorMessage = 'Failed to get video information. ';
            let suggestion = 'Please try again in a few minutes or try a different video.';
            let statusCode = 503;
            
            if (lastError?.message.includes('Status code: 429')) {
                errorMessage = 'YouTube is currently rate limiting our service.';
                suggestion = 'Please wait 5-10 minutes before trying again. This is a temporary restriction from YouTube.';
                statusCode = 429;
            } else if (lastError?.message.includes('Could not extract functions')) {
                errorMessage += 'YouTube has updated their system and our current method needs updating.';
                suggestion = 'This is a temporary issue. Please try again later or contact support if the problem persists.';
            } else if (lastError?.message.includes('410') || lastError?.message.includes('Status code: 410')) {
                errorMessage += 'This video is no longer available or has been removed.';
                suggestion = 'Please check if the video still exists on YouTube and try a different URL.';
                statusCode = 410;
            } else if (lastError?.message.includes('Video unavailable')) {
                errorMessage += 'This video is private, deleted, or restricted in your region.';
                suggestion = 'Try a different public video that is available in your region.';
                statusCode = 404;
            } else if (lastError?.message.includes('Timeout')) {
                errorMessage += 'Request timed out. YouTube servers might be slow.';
                suggestion = 'Try again in a few minutes when YouTube servers are more responsive.';
                statusCode = 408;
            } else {
                errorMessage += 'YouTube API temporarily unavailable.';
            }
            
            return res.status(statusCode).json({ 
                error: errorMessage,
                suggestion: suggestion,
                details: statusCode === 429 ? 'Rate limit from YouTube. This will reset automatically.' : 'Our service is experiencing connectivity issues with YouTube. This is usually temporary.'
            });
        }

        // Filter and process formats
        const allFormats = info.formats || [];
        console.log(`Found ${allFormats.length} total formats`);

        // Video formats (with both video and audio)
        const videoFormats = allFormats
            .filter(format => format.hasVideo && format.hasAudio && format.container !== 'webm')
            .map(format => ({
                itag: format.itag,
                quality: format.qualityLabel || format.quality || 'Unknown',
                container: format.container || 'mp4',
                filesize: format.contentLength,
                fps: format.fps,
                type: 'video'
            }))
            .filter((format, index, self) => 
                index === self.findIndex(f => f.quality === format.quality)
            )
            .sort((a, b) => {
                const qualityA = parseInt(a.quality) || 0;
                const qualityB = parseInt(b.quality) || 0;
                return qualityB - qualityA;
            })
            .slice(0, 6); // Limit to top 6 video formats

        // Audio formats
        const audioFormats = allFormats
            .filter(format => format.hasAudio && !format.hasVideo)
            .map(format => ({
                itag: format.itag,
                quality: format.audioBitrate ? `${format.audioBitrate}kbps` : 'Audio',
                container: format.container || 'mp4',
                filesize: format.contentLength,
                type: 'audio'
            }))
            .filter((format, index, self) => 
                index === self.findIndex(f => f.quality === format.quality)
            )
            .sort((a, b) => {
                const bitrateA = parseInt(a.quality) || 0;
                const bitrateB = parseInt(b.quality) || 0;
                return bitrateB - bitrateA;
            })
            .slice(0, 4); // Limit to top 4 audio formats

        // Add default formats if none found
        if (videoFormats.length === 0 && audioFormats.length === 0) {
            // Try to get any available format
            const anyFormats = allFormats.slice(0, 5).map(format => ({
                itag: format.itag,
                quality: format.qualityLabel || format.quality || 'Default',
                container: format.container || 'mp4',
                filesize: format.contentLength,
                fps: format.fps,
                type: format.hasVideo ? 'video' : 'audio'
            }));
            
            anyFormats.forEach(format => {
                if (format.type === 'video') {
                    videoFormats.push(format);
                } else {
                    audioFormats.push(format);
                }
            });
        }

        // Get the best quality thumbnail available
        let thumbnailUrl = '';
        if (info.videoDetails.thumbnails && info.videoDetails.thumbnails.length > 0) {
            // Try to get maxresdefault first, then hqdefault, then the highest resolution available
            const thumbnails = info.videoDetails.thumbnails;
            const maxRes = thumbnails.find(t => t.url.includes('maxresdefault'));
            const hqDefault = thumbnails.find(t => t.url.includes('hqdefault'));
            const highest = thumbnails[thumbnails.length - 1];
            
            thumbnailUrl = maxRes?.url || hqDefault?.url || highest?.url || '';
        }

        const videoDetails = {
            title: info.videoDetails.title || 'Unknown Title',
            author: info.videoDetails.author?.name || 'Unknown Author',
            lengthSeconds: info.videoDetails.lengthSeconds || 0,
            viewCount: info.videoDetails.viewCount || 0,
            thumbnail: thumbnailUrl,
            description: info.videoDetails.description ? 
                info.videoDetails.description.slice(0, 200) + '...' : 
                'No description available',
            uploadDate: info.videoDetails.uploadDate || 'Unknown'
        };

        console.log('Successfully extracted video info for:', videoDetails.title);
        console.log(`Found ${videoFormats.length} video formats and ${audioFormats.length} audio formats`);

        const responseData = {
            success: true,
            videoDetails,
            formats: {
                audio: audioFormats,  // Show audio formats first as default
                video: videoFormats
            }
        };

        // Cache the successful response
        videoCache.set(cacheKey, {
            data: responseData,
            timestamp: Date.now()
        });

        // Clean old cache entries periodically
        if (videoCache.size > 100) {
            const now = Date.now();
            for (const [key, value] of videoCache.entries()) {
                if (now - value.timestamp > CACHE_DURATION) {
                    videoCache.delete(key);
                }
            }
        }

        res.json(responseData);

    } catch (error) {
        console.error('Error getting video info:', error.message);
        
        // More specific error messages
        let errorMessage = 'Failed to get video information. ';
        if (error.message.includes('Video unavailable')) {
            errorMessage += 'Video is unavailable or private.';
        } else if (error.message.includes('Sign in to confirm')) {
            errorMessage += 'Video requires sign-in or is age-restricted.';
        } else if (error.message.includes('Video not found')) {
            errorMessage += 'Video not found - please check the URL.';
        } else if (error.message.includes('functions') || error.message.includes('extract')) {
            errorMessage += 'YouTube API temporarily unavailable. Please try again in a few minutes.';
        } else if (error.message.includes('private')) {
            errorMessage += 'This video is private.';
        } else {
            errorMessage += 'Please check the URL and try again.';
        }
        
        res.status(500).json({ error: errorMessage });
    }
});

// Helper function to download thumbnail
function downloadThumbnail(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https:') ? https : http;
        const file = fs.createWriteStream(filepath);
        
        protocol.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(filepath);
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {}); // Delete the file on error
            reject(err);
        });
    });
}

// Helper function to extract video ID from various YouTube URL formats
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

// Improved YouTube URL validation
function isValidYouTubeUrl(url) {
    const patterns = [
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/
    ];
    
    return patterns.some(pattern => pattern.test(url));
}

// Download video/audio with thumbnail embedding
app.post('/api/download', async (req, res) => {
    try {
        const { url, itag, type } = req.body;

        if (!url || !itag) {
            return res.status(400).json({ error: 'URL and format are required' });
        }

        console.log('Download request:', { url, itag, type });

        // Extract video ID and create clean URL
        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Could not extract video ID from URL' });
        }
        
        const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

        if (!ytdl.validateURL(cleanUrl)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        // Get video info first to validate
        const info = await ytdl.getInfo(cleanUrl, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        });
        
        // Keep the exact original title without character replacement
        const originalTitle = info.videoDetails.title || 'Unknown_Video';
        
        // Find the requested format
        const format = info.formats.find(f => f.itag == itag);
        if (!format) {
            return res.status(400).json({ error: 'Requested format not available' });
        }

        // Get thumbnail URL
        const thumbnails = info.videoDetails.thumbnails || [];
        const maxRes = thumbnails.find(t => t.url.includes('maxresdefault'));
        const hqDefault = thumbnails.find(t => t.url.includes('hqdefault'));
        const highest = thumbnails[thumbnails.length - 1];
        const thumbnailUrl = maxRes?.url || hqDefault?.url || highest?.url || '';

        // Check if we have a thumbnail for video downloads (include as separate file)
        if (thumbnailUrl && type === 'video') {
            console.log('🖼️ Will include thumbnail with video file');
            await handleDownloadWithThumbnail(res, cleanUrl, itag, type, originalTitle, thumbnailUrl, videoId, info.videoDetails);
        } else {
            console.log('📥 Starting standard download');
            await handleStandardDownload(res, cleanUrl, itag, type, originalTitle);
        }

    } catch (error) {
        console.error('Download error:', error.message);
        if (!res.headersSent) {
            let errorMessage = 'Download failed';
            if (error.message.includes('Video unavailable')) {
                errorMessage = 'Video is unavailable for download';
            } else if (error.message.includes('format')) {
                errorMessage = 'Selected format is not available';
            }
            res.status(500).json({ error: errorMessage });
        }
    }
});

// Handle download with thumbnail as separate file in ZIP
async function handleDownloadWithThumbnail(res, cleanUrl, itag, type, originalTitle, thumbnailUrl, videoId, videoDetails) {
    const tempDir = path.join(__dirname, 'temp');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const extension = type === 'audio' ? 'mp4' : 'mp4'; // Keep as mp4 for better compatibility
    const tempMediaFile = path.join(tempDir, `${originalTitle}.${extension}`);
    const tempThumbnailFile = path.join(tempDir, `${originalTitle}_thumbnail.jpg`);
    
    try {
        // Download the video/audio file
        console.log('📥 Downloading media file...');
        const stream = ytdl(cleanUrl, { 
            quality: itag,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        });

        const writeStream = fs.createWriteStream(tempMediaFile);
        stream.pipe(writeStream);

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            stream.on('error', reject);
        });

        // Download thumbnail
        console.log('🖼️ Downloading thumbnail...');
        await downloadThumbnail(thumbnailUrl, tempThumbnailFile);

        // Create ZIP file containing both media and thumbnail
        console.log('� Creating ZIP file with media and thumbnail...');
        
        const zipFilename = `${originalTitle}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        res.setHeader('Content-Type', 'application/zip');

        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level
        });

        archive.on('error', (err) => {
            throw err;
        });

        // Pipe the archive to the response
        archive.pipe(res);

        // Add media file to archive
        archive.file(tempMediaFile, { name: `${originalTitle}.${extension}` });
        
        // Add thumbnail to archive
        archive.file(tempThumbnailFile, { name: `${originalTitle}_thumbnail.jpg` });
        
        // Add a text file with video info
        const videoInfo = `Video Title: ${originalTitle}
Video URL: ${cleanUrl}
Download Date: ${new Date().toISOString()}
Format: ${type.toUpperCase()}

This ZIP file contains:
1. ${originalTitle}.${extension} - The ${type} file
2. ${originalTitle}_thumbnail.jpg - The video thumbnail
`;
        archive.append(videoInfo, { name: 'README.txt' });

        // Finalize the archive
        await archive.finalize();

        console.log('✅ ZIP file sent successfully with media and thumbnail!');

        // Clean up temp files after a delay
        setTimeout(() => {
            [tempMediaFile, tempThumbnailFile].forEach(file => {
                if (fs.existsSync(file)) {
                    fs.unlink(file, (err) => {
                        if (err) console.error('Error deleting temp file:', err);
                    });
                }
            });
        }, 5000);

    } catch (error) {
        console.error('Error in download with thumbnail process:', error);
        
        // Clean up temp files on error
        [tempMediaFile, tempThumbnailFile].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlink(file, () => {});
            }
        });
        
        // Fallback to standard download
        if (!res.headersSent) {
            await handleStandardDownload(res, cleanUrl, itag, type, originalTitle);
        }
    }
}

// Handle standard download without thumbnail embedding
async function handleStandardDownload(res, cleanUrl, itag, type, originalTitle) {
    const format = type === 'audio' ? 'mp3' : 'mp4';
    const filename = `${originalTitle}.${format}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', type === 'audio' ? 'audio/mpeg' : 'video/mp4');

    // Create download stream
    const stream = ytdl(cleanUrl, { 
        quality: itag,
        requestOptions: {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }
    });
    
    stream.on('error', (error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download stream failed' });
        }
    });

    console.log('📥 Starting standard download for:', originalTitle);
    stream.pipe(res);
}

// Health check endpoints
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'YouTube Converter is running', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'YouTube Converter API is running' });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Access your app at: http://localhost:${PORT}`);
});
