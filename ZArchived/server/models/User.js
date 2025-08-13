// User Model
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  
  avatar: {
    type: String,
    default: null
  },
  
  isVerified: {
    type: Boolean,
    default: false
  },
  
  verificationToken: {
    type: String,
    select: false
  },
  
  resetPasswordToken: {
    type: String,
    select: false
  },
  
  resetPasswordExpire: {
    type: Date,
    select: false
  },
  
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'dark'
    },
    
    volume: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    
    quality: {
      type: String,
      enum: ['low', 'medium', 'high', 'lossless'],
      default: 'high'
    },
    
    autoplay: {
      type: Boolean,
      default: true
    },
    
    shuffle: {
      type: Boolean,
      default: false
    },
    
    repeat: {
      type: String,
      enum: ['none', 'one', 'all'],
      default: 'none'
    },
    
    notifications: {
      newMusic: {
        type: Boolean,
        default: true
      },
      playlists: {
        type: Boolean,
        default: true
      },
      social: {
        type: Boolean,
        default: true
      }
    }
  },
  
  subscription: {
    type: {
      type: String,
      enum: ['free', 'premium', 'family'],
      default: 'free'
    },
    
    startDate: {
      type: Date,
      default: null
    },
    
    endDate: {
      type: Date,
      default: null
    },
    
    isActive: {
      type: Boolean,
      default: false
    }
  },
  
  storage: {
    used: {
      type: Number,
      default: 0
    },
    
    limit: {
      type: Number,
      default: 1024 * 1024 * 1024 // 1GB for free users
    }
  },
  
  statistics: {
    totalListeningTime: {
      type: Number,
      default: 0
    },
    
    tracksPlayed: {
      type: Number,
      default: 0
    },
    
    playlistsCreated: {
      type: Number,
      default: 0
    },
    
    songsUploaded: {
      type: Number,
      default: 0
    }
  },
  
  lastActive: {
    type: Date,
    default: Date.now
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for user's music library
userSchema.virtual('musicLibrary', {
  ref: 'Music',
  localField: '_id',
  foreignField: 'owner'
});

// Virtual for user's playlists
userSchema.virtual('playlists', {
  ref: 'Playlist',
  localField: '_id',
  foreignField: 'owner'
});

// Virtual for user's favorite tracks
userSchema.virtual('favorites', {
  ref: 'Music',
  localField: '_id',
  foreignField: 'favoritedBy'
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ lastActive: -1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash password if it's modified (or new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with salt of 12
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate JWT token
userSchema.methods.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { 
      id: this._id,
      email: this.email,
      subscription: this.subscription.type
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// Method to update last active
userSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save({ validateBeforeSave: false });
};

// Method to check storage limit
userSchema.methods.canUpload = function(fileSize) {
  return (this.storage.used + fileSize) <= this.storage.limit;
};

// Method to update storage usage
userSchema.methods.updateStorageUsage = function(size) {
  this.storage.used += size;
  return this.save({ validateBeforeSave: false });
};

// Static method to find active users
userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

// Static method to find users by subscription type
userSchema.statics.findBySubscription = function(type) {
  return this.find({ 'subscription.type': type, 'subscription.isActive': true });
};

module.exports = mongoose.model('User', userSchema);
