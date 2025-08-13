// Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user still exists and is active
      const user = await User.findById(decoded.id);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive, authorization denied'
        });
      }

      // Add user to request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        subscription: decoded.subscription
      };

      next();

    } catch (tokenError) {
      if (tokenError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired, authorization denied'
        });
      } else if (tokenError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token, authorization denied'
        });
      } else {
        throw tokenError;
      }
    }

  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Optional auth middleware - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      
      if (user && user.isActive) {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          subscription: decoded.subscription
        };
      }
    } catch (tokenError) {
      // Ignore token errors in optional auth
      logger.warn('Optional auth token error:', tokenError.message);
    }

    next();

  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    next();
  }
};

// Check if user has premium subscription
const requirePremium = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.subscription.type === 'free' || !user.subscription.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Premium subscription required for this feature'
      });
    }

    next();

  } catch (error) {
    logger.error('Premium check middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in subscription check'
    });
  }
};

// Check storage limits
const checkStorageLimit = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get file size from multer (if file upload)
    const fileSize = req.file ? req.file.size : 0;
    
    if (fileSize > 0 && !user.canUpload(fileSize)) {
      return res.status(413).json({
        success: false,
        message: 'Storage limit exceeded. Please upgrade your plan or delete some files.',
        storageUsed: user.storage.used,
        storageLimit: user.storage.limit
      });
    }

    next();

  } catch (error) {
    logger.error('Storage limit middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in storage check'
    });
  }
};

// Admin access check
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    next();

  } catch (error) {
    logger.error('Admin check middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in admin check'
    });
  }
};

module.exports = {
  auth,
  optionalAuth,
  requirePremium,
  checkStorageLimit,
  requireAdmin
};
