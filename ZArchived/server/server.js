// Samsung Music Clone - Main Server
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const musicRoutes = require('./routes/music');
const playlistRoutes = require('./routes/playlists');
const userRoutes = require('./routes/user');
const exploreRoutes = require('./routes/explore');

// Import middleware
const auth = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Constants
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/samsung-music';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      mediaSrc: ["'self'", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "ws:", "wss:"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each IP to 50 uploads per hour
  message: 'Too many uploads, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use(generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/music/upload', uploadLimiter);

// Compression middleware
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../')));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/user', userRoutes);
app.use('/api/explore', exploreRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);
  
  // Join user to their personal room
  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    logger.info(`User ${userId} joined their room`);
  });
  
  // Handle real-time music sharing
  socket.on('share-music', (data) => {
    socket.broadcast.emit('music-shared', {
      ...data,
      timestamp: new Date()
    });
  });
  
  // Handle live listening sessions
  socket.on('join-listening-session', (sessionId) => {
    socket.join(`session-${sessionId}`);
    socket.to(`session-${sessionId}`).emit('user-joined-session', {
      userId: socket.userId,
      timestamp: new Date()
    });
  });
  
  socket.on('sync-playback', (data) => {
    socket.to(`session-${data.sessionId}`).emit('playback-synced', data);
  });
  
  // Handle chat messages in listening sessions
  socket.on('session-message', (data) => {
    socket.to(`session-${data.sessionId}`).emit('new-message', {
      ...data,
      timestamp: new Date()
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Error handling middleware (should be last)
app.use(errorHandler);

// MongoDB connection
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.info('Connected to MongoDB');
  
  // Start server
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
})
.catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    mongoose.connection.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    mongoose.connection.close();
    process.exit(0);
  });
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

module.exports = { app, server, io };
