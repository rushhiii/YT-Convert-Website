// Samsung Music Clone - Service Worker
// Provides offline functionality and caching

const CACHE_NAME = 'samsung-music-v1';
const STATIC_CACHE = 'samsung-music-static-v1';
const DYNAMIC_CACHE = 'samsung-music-dynamic-v1';
const MUSIC_CACHE = 'samsung-music-files-v1';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/script.js',
  '/manifest.json',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png',
  '/assets/images/default-artwork.jpg',
  // Add other static assets
];

// Files that should always be fetched from network
const NETWORK_FIRST = [
  '/api/',
  '/auth/',
];

// Files that can be served from cache first
const CACHE_FIRST = [
  '/assets/',
  '/images/',
  '.css',
  '.js',
  '.woff',
  '.woff2',
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Static files cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== MUSIC_CACHE) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle all network requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // Handle different types of requests
  if (request.method === 'GET') {
    if (isStaticFile(request.url)) {
      // Static files - cache first
      event.respondWith(cacheFirst(request));
    } else if (isAPIRequest(request.url)) {
      // API requests - network first
      event.respondWith(networkFirst(request));
    } else if (isMusicFile(request.url)) {
      // Music files - special handling
      event.respondWith(handleMusicRequest(request));
    } else {
      // Other requests - network first with cache fallback
      event.respondWith(networkFirst(request));
    }
  }
});

// Cache first strategy
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Cache first strategy failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Network first strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network request failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/offline.html') || 
             new Response('Offline', { status: 503 });
    }
    
    return new Response('Offline', { status: 503 });
  }
}

// Special handling for music files
async function handleMusicRequest(request) {
  try {
    // Check if music file is cached
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If not cached, fetch from network
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache music file for offline playback
      const cache = await caches.open(MUSIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Music request failed:', error);
    return new Response('Music file unavailable offline', { status: 503 });
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  if (event.tag === 'upload-music') {
    event.waitUntil(syncMusicUploads());
  } else if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  } else if (event.tag === 'sync-playlists') {
    event.waitUntil(syncPlaylists());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  if (!event.data) {
    return;
  }
  
  const data = event.data.json();
  const options = {
    body: data.body || 'New notification from Samsung Music',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/assets/icons/open-icon.png'
      },
      {
        action: 'close',
        title: 'Dismiss',
        icon: '/assets/icons/close-icon.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Samsung Music', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification);
  
  event.notification.close();
  
  if (event.action === 'open' || event.action === '') {
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then((clientList) => {
          // Check if app is already open
          for (const client of clientList) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Open new window if app is not open
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});

// Message handling from main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data);
  
  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'CACHE_MUSIC':
        handleCacheMusicMessage(event);
        break;
      case 'CLEAR_CACHE':
        handleClearCacheMessage(event);
        break;
      case 'GET_CACHE_SIZE':
        handleGetCacheSizeMessage(event);
        break;
      default:
        console.log('Unknown message type:', event.data.type);
    }
  }
});

// Utility functions
function isStaticFile(url) {
  return CACHE_FIRST.some(pattern => url.includes(pattern));
}

function isAPIRequest(url) {
  return NETWORK_FIRST.some(pattern => url.includes(pattern));
}

function isMusicFile(url) {
  const musicExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.ogg'];
  return musicExtensions.some(ext => url.toLowerCase().includes(ext));
}

// Background sync functions
async function syncMusicUploads() {
  try {
    console.log('Service Worker: Syncing music uploads...');
    
    // Get pending uploads from IndexedDB
    const pendingUploads = await getPendingUploads();
    
    for (const upload of pendingUploads) {
      try {
        await uploadMusic(upload);
        await removePendingUpload(upload.id);
        console.log('Upload synced:', upload.filename);
      } catch (error) {
        console.error('Failed to sync upload:', upload.filename, error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

async function syncFavorites() {
  try {
    console.log('Service Worker: Syncing favorites...');
    
    const pendingFavorites = await getPendingFavorites();
    
    for (const favorite of pendingFavorites) {
      try {
        await syncFavorite(favorite);
        await removePendingFavorite(favorite.id);
      } catch (error) {
        console.error('Failed to sync favorite:', error);
      }
    }
  } catch (error) {
    console.error('Favorites sync failed:', error);
  }
}

async function syncPlaylists() {
  try {
    console.log('Service Worker: Syncing playlists...');
    
    const pendingPlaylists = await getPendingPlaylists();
    
    for (const playlist of pendingPlaylists) {
      try {
        await syncPlaylist(playlist);
        await removePendingPlaylist(playlist.id);
      } catch (error) {
        console.error('Failed to sync playlist:', error);
      }
    }
  } catch (error) {
    console.error('Playlists sync failed:', error);
  }
}

// Message handlers
async function handleCacheMusicMessage(event) {
  try {
    const { musicUrl } = event.data;
    const cache = await caches.open(MUSIC_CACHE);
    await cache.add(musicUrl);
    
    event.ports[0].postMessage({
      success: true,
      message: 'Music cached successfully'
    });
  } catch (error) {
    event.ports[0].postMessage({
      success: false,
      error: error.message
    });
  }
}

async function handleClearCacheMessage(event) {
  try {
    const { cacheType } = event.data;
    
    if (cacheType === 'all') {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    } else {
      await caches.delete(cacheType);
    }
    
    event.ports[0].postMessage({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    event.ports[0].postMessage({
      success: false,
      error: error.message
    });
  }
}

async function handleGetCacheSizeMessage(event) {
  try {
    let totalSize = 0;
    const cacheNames = await caches.keys();
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      
      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }
    }
    
    event.ports[0].postMessage({
      success: true,
      size: totalSize,
      sizeFormatted: formatBytes(totalSize)
    });
  } catch (error) {
    event.ports[0].postMessage({
      success: false,
      error: error.message
    });
  }
}

// Helper functions for IndexedDB operations
async function getPendingUploads() {
  // Implementation would use IndexedDB to store pending uploads
  return [];
}

async function removePendingUpload(id) {
  // Implementation would remove from IndexedDB
}

async function getPendingFavorites() {
  return [];
}

async function removePendingFavorite(id) {
  // Implementation
}

async function getPendingPlaylists() {
  return [];
}

async function removePendingPlaylist(id) {
  // Implementation
}

async function uploadMusic(upload) {
  // Implementation would handle the actual upload
}

async function syncFavorite(favorite) {
  // Implementation would sync favorite status
}

async function syncPlaylist(playlist) {
  // Implementation would sync playlist changes
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

console.log('Service Worker: Script loaded');
