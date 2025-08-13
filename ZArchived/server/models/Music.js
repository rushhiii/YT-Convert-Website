// Music Track Model
const mongoose = require('mongoose');

const musicSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  artist: {
    type: String,
    required: [true, 'Artist is required'],
    trim: true,
    maxlength: [100, 'Artist name cannot exceed 100 characters']
  },
  
  album: {
    type: String,
    trim: true,
    maxlength: [100, 'Album name cannot exceed 100 characters']
  },
  
  genre: {
    type: String,
    trim: true,
    maxlength: [50, 'Genre cannot exceed 50 characters']
  },
  
  year: {
    type: Number,
    min: [1900, 'Year must be after 1900'],
    max: [new Date().getFullYear(), 'Year cannot be in the future']
  },
  
  duration: {
    type: Number,
    required: [true, 'Duration is required'],
    min: [1, 'Duration must be at least 1 second']
  },
  
  // File information
  filename: {
    type: String,
    required: true
  },
  
  originalName: {
    type: String,
    required: true
  },
  
  fileSize: {
    type: Number,
    required: true
  },
  
  mimeType: {
    type: String,
    required: true
  },
  
  // Storage information
  url: {
    type: String,
    required: true
  },
  
  cloudId: {
    type: String,
    required: true
  },
  
  // Artwork
  artwork: {
    url: String,
    cloudId: String
  },
  
  // Audio metadata
  bitrate: {
    type: Number,
    min: [32, 'Bitrate too low'],
    max: [1411, 'Bitrate too high']
  },
  
  sampleRate: {
    type: Number,
    min: [8000, 'Sample rate too low'],
    max: [192000, 'Sample rate too high']
  },
  
  channels: {
    type: Number,
    min: [1, 'Must have at least 1 channel'],
    max: [8, 'Too many channels']
  },
  
  format: {
    type: String,
    enum: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'],
    required: true
  },
  
  // Ownership and access
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  isPublic: {
    type: Boolean,
    default: false
  },
  
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['view', 'download'],
      default: 'view'
    }
  }],
  
  // Interaction data
  playCount: {
    type: Number,
    default: 0
  },
  
  favoritedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  downloadCount: {
    type: Number,
    default: 0
  },
  
  // Lyrics and additional data
  lyrics: {
    type: String,
    maxlength: [10000, 'Lyrics too long']
  },
  
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag too long']
  }],
  
  // Recommendation data
  acousticFeatures: {
    energy: { type: Number, min: 0, max: 1 },
    valence: { type: Number, min: 0, max: 1 },
    danceability: { type: Number, min: 0, max: 1 },
    tempo: { type: Number, min: 0, max: 300 },
    loudness: { type: Number, min: -60, max: 0 }
  },
  
  // Status
  status: {
    type: String,
    enum: ['processing', 'active', 'hidden', 'deleted'],
    default: 'processing'
  },
  
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  
  lastPlayed: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted duration
musicSchema.virtual('formattedDuration').get(function() {
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for formatted file size
musicSchema.virtual('formattedFileSize').get(function() {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (this.fileSize === 0) return '0 Bytes';
  const i = parseInt(Math.floor(Math.log(this.fileSize) / Math.log(1024)));
  return Math.round(this.fileSize / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Virtual for popularity score
musicSchema.virtual('popularityScore').get(function() {
  const playWeight = 0.6;
  const favoriteWeight = 0.3;
  const downloadWeight = 0.1;
  
  return (this.playCount * playWeight) + 
         (this.favoritedBy.length * favoriteWeight) + 
         (this.downloadCount * downloadWeight);
});

// Indexes for better query performance
musicSchema.index({ owner: 1, status: 1 });
musicSchema.index({ title: 'text', artist: 'text', album: 'text' });
musicSchema.index({ genre: 1 });
musicSchema.index({ uploadedAt: -1 });
musicSchema.index({ playCount: -1 });
musicSchema.index({ favoritedBy: 1 });
musicSchema.index({ 'acousticFeatures.energy': 1 });
musicSchema.index({ 'acousticFeatures.valence': 1 });

// Pre-save middleware
musicSchema.pre('save', function(next) {
  // Update upload date if new
  if (this.isNew) {
    this.uploadedAt = new Date();
  }
  next();
});

// Instance methods
musicSchema.methods.incrementPlayCount = function() {
  this.playCount += 1;
  this.lastPlayed = new Date();
  return this.save({ validateBeforeSave: false });
};

musicSchema.methods.addToFavorites = function(userId) {
  if (!this.favoritedBy.includes(userId)) {
    this.favoritedBy.push(userId);
    return this.save({ validateBeforeSave: false });
  }
  return Promise.resolve(this);
};

musicSchema.methods.removeFromFavorites = function(userId) {
  this.favoritedBy = this.favoritedBy.filter(id => !id.equals(userId));
  return this.save({ validateBeforeSave: false });
};

musicSchema.methods.isFavoritedBy = function(userId) {
  return this.favoritedBy.some(id => id.equals(userId));
};

musicSchema.methods.canAccess = function(userId) {
  // Owner can always access
  if (this.owner.equals(userId)) return true;
  
  // Public tracks can be accessed by anyone
  if (this.isPublic) return true;
  
  // Check if specifically shared with user
  return this.sharedWith.some(share => share.user.equals(userId));
};

// Static methods
musicSchema.statics.findByOwner = function(ownerId, status = 'active') {
  return this.find({ owner: ownerId, status });
};

musicSchema.statics.findPublic = function(limit = 50) {
  return this.find({ isPublic: true, status: 'active' })
    .sort({ playCount: -1, uploadedAt: -1 })
    .limit(limit);
};

musicSchema.statics.findByGenre = function(genre, limit = 20) {
  return this.find({ 
    genre: new RegExp(genre, 'i'), 
    status: 'active',
    isPublic: true 
  })
  .sort({ playCount: -1 })
  .limit(limit);
};

musicSchema.statics.searchTracks = function(query, userId, limit = 20) {
  const searchQuery = {
    $and: [
      {
        $or: [
          { owner: userId },
          { isPublic: true },
          { 'sharedWith.user': userId }
        ]
      },
      { status: 'active' },
      {
        $or: [
          { title: new RegExp(query, 'i') },
          { artist: new RegExp(query, 'i') },
          { album: new RegExp(query, 'i') },
          { genre: new RegExp(query, 'i') },
          { tags: new RegExp(query, 'i') }
        ]
      }
    ]
  };
  
  return this.find(searchQuery)
    .sort({ playCount: -1, uploadedAt: -1 })
    .limit(limit);
};

musicSchema.statics.findSimilar = function(trackId, limit = 10) {
  // This would implement music recommendation logic
  // For now, return random tracks
  return this.aggregate([
    { $match: { status: 'active', isPublic: true } },
    { $sample: { size: limit } }
  ]);
};

musicSchema.statics.getTrendingTracks = function(limit = 20) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  return this.find({
    status: 'active',
    isPublic: true,
    uploadedAt: { $gte: oneWeekAgo }
  })
  .sort({ playCount: -1, favoritedBy: -1 })
  .limit(limit);
};

module.exports = mongoose.model('Music', musicSchema);
