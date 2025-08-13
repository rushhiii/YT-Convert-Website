// Playlist Model
const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Playlist name is required'],
    trim: true,
    maxlength: [100, 'Playlist name cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  tracks: [{
    track: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Music',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Playlist metadata
  cover: {
    url: String,
    cloudId: String
  },
  
  // Privacy and sharing
  isPublic: {
    type: Boolean,
    default: false
  },
  
  isCollaborative: {
    type: Boolean,
    default: false
  },
  
  collaborators: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['view', 'edit', 'admin'],
      default: 'edit'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Interaction data
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  playCount: {
    type: Number,
    default: 0
  },
  
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Playlist settings
  allowDuplicates: {
    type: Boolean,
    default: false
  },
  
  shuffleEnabled: {
    type: Boolean,
    default: false
  },
  
  autoPlay: {
    type: Boolean,
    default: true
  },
  
  // Categories and tags
  category: {
    type: String,
    enum: [
      'general', 'workout', 'chill', 'party', 'focus', 
      'sleep', 'commute', 'romance', 'throwback', 'discovery'
    ],
    default: 'general'
  },
  
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag too long']
  }],
  
  // Mood and attributes
  mood: {
    type: String,
    enum: [
      'happy', 'sad', 'energetic', 'calm', 'romantic', 
      'nostalgic', 'aggressive', 'peaceful', 'melancholic', 'uplifting'
    ]
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total duration
playlistSchema.virtual('totalDuration').get(function() {
  if (!this.populated('tracks.track')) return 0;
  return this.tracks.reduce((total, item) => {
    return total + (item.track?.duration || 0);
  }, 0);
});

// Virtual for formatted total duration
playlistSchema.virtual('formattedDuration').get(function() {
  const totalSeconds = this.totalDuration;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
});

// Virtual for track count
playlistSchema.virtual('trackCount').get(function() {
  return this.tracks.length;
});

// Virtual for follower count
playlistSchema.virtual('followerCount').get(function() {
  return this.followers.length;
});

// Virtual for like count
playlistSchema.virtual('likeCount').get(function() {
  return this.likedBy.length;
});

// Indexes for better query performance
playlistSchema.index({ owner: 1, status: 1 });
playlistSchema.index({ isPublic: 1, status: 1 });
playlistSchema.index({ name: 'text', description: 'text' });
playlistSchema.index({ category: 1 });
playlistSchema.index({ mood: 1 });
playlistSchema.index({ followers: 1 });
playlistSchema.index({ likedBy: 1 });
playlistSchema.index({ createdAt: -1 });
playlistSchema.index({ playCount: -1 });

// Pre-save middleware
playlistSchema.pre('save', function(next) {
  // Remove duplicates if not allowed
  if (!this.allowDuplicates && this.isModified('tracks')) {
    const seen = new Set();
    this.tracks = this.tracks.filter(item => {
      const trackId = item.track.toString();
      if (seen.has(trackId)) {
        return false;
      }
      seen.add(trackId);
      return true;
    });
  }
  next();
});

// Instance methods
playlistSchema.methods.addTrack = function(trackId, addedBy) {
  // Check if track already exists (if duplicates not allowed)
  if (!this.allowDuplicates) {
    const exists = this.tracks.some(item => item.track.equals(trackId));
    if (exists) {
      throw new Error('Track already exists in playlist');
    }
  }
  
  this.tracks.push({
    track: trackId,
    addedBy: addedBy,
    addedAt: new Date()
  });
  
  return this.save();
};

playlistSchema.methods.removeTrack = function(trackId) {
  this.tracks = this.tracks.filter(item => !item.track.equals(trackId));
  return this.save();
};

playlistSchema.methods.reorderTracks = function(newOrder) {
  // newOrder should be an array of track IDs in the desired order
  const reorderedTracks = [];
  
  newOrder.forEach(trackId => {
    const trackItem = this.tracks.find(item => item.track.equals(trackId));
    if (trackItem) {
      reorderedTracks.push(trackItem);
    }
  });
  
  this.tracks = reorderedTracks;
  return this.save();
};

playlistSchema.methods.addCollaborator = function(userId, permission = 'edit') {
  // Check if user is already a collaborator
  const existing = this.collaborators.find(collab => collab.user.equals(userId));
  if (existing) {
    existing.permission = permission;
  } else {
    this.collaborators.push({
      user: userId,
      permission: permission,
      addedAt: new Date()
    });
  }
  
  return this.save();
};

playlistSchema.methods.removeCollaborator = function(userId) {
  this.collaborators = this.collaborators.filter(collab => !collab.user.equals(userId));
  return this.save();
};

playlistSchema.methods.toggleFollow = function(userId) {
  const isFollowing = this.followers.includes(userId);
  
  if (isFollowing) {
    this.followers = this.followers.filter(id => !id.equals(userId));
  } else {
    this.followers.push(userId);
  }
  
  return this.save({ validateBeforeSave: false });
};

playlistSchema.methods.toggleLike = function(userId) {
  const isLiked = this.likedBy.includes(userId);
  
  if (isLiked) {
    this.likedBy = this.likedBy.filter(id => !id.equals(userId));
  } else {
    this.likedBy.push(userId);
  }
  
  return this.save({ validateBeforeSave: false });
};

playlistSchema.methods.incrementPlayCount = function() {
  this.playCount += 1;
  return this.save({ validateBeforeSave: false });
};

playlistSchema.methods.canAccess = function(userId) {
  // Owner can always access
  if (this.owner.equals(userId)) return true;
  
  // Public playlists can be accessed by anyone
  if (this.isPublic) return true;
  
  // Check if user is a collaborator
  return this.collaborators.some(collab => collab.user.equals(userId));
};

playlistSchema.methods.canEdit = function(userId) {
  // Owner can always edit
  if (this.owner.equals(userId)) return true;
  
  // Check if user is a collaborator with edit permissions
  const collaborator = this.collaborators.find(collab => collab.user.equals(userId));
  return collaborator && ['edit', 'admin'].includes(collaborator.permission);
};

playlistSchema.methods.canManage = function(userId) {
  // Owner can always manage
  if (this.owner.equals(userId)) return true;
  
  // Check if user is a collaborator with admin permissions
  const collaborator = this.collaborators.find(collab => collab.user.equals(userId));
  return collaborator && collaborator.permission === 'admin';
};

// Static methods
playlistSchema.statics.findByOwner = function(ownerId, status = 'active') {
  return this.find({ owner: ownerId, status })
    .sort({ createdAt: -1 });
};

playlistSchema.statics.findPublic = function(limit = 50) {
  return this.find({ isPublic: true, status: 'active' })
    .sort({ playCount: -1, createdAt: -1 })
    .limit(limit);
};

playlistSchema.statics.findByCategory = function(category, limit = 20) {
  return this.find({ 
    category: category, 
    isPublic: true, 
    status: 'active' 
  })
  .sort({ playCount: -1 })
  .limit(limit);
};

playlistSchema.statics.findByMood = function(mood, limit = 20) {
  return this.find({ 
    mood: mood, 
    isPublic: true, 
    status: 'active' 
  })
  .sort({ playCount: -1 })
  .limit(limit);
};

playlistSchema.statics.searchPlaylists = function(query, userId, limit = 20) {
  const searchQuery = {
    $and: [
      {
        $or: [
          { owner: userId },
          { isPublic: true },
          { 'collaborators.user': userId }
        ]
      },
      { status: 'active' },
      {
        $or: [
          { name: new RegExp(query, 'i') },
          { description: new RegExp(query, 'i') },
          { tags: new RegExp(query, 'i') }
        ]
      }
    ]
  };
  
  return this.find(searchQuery)
    .sort({ playCount: -1, createdAt: -1 })
    .limit(limit);
};

playlistSchema.statics.getTrending = function(limit = 20) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  return this.find({
    isPublic: true,
    status: 'active',
    createdAt: { $gte: oneWeekAgo }
  })
  .sort({ playCount: -1, likedBy: -1 })
  .limit(limit);
};

playlistSchema.statics.getRecommended = function(userId, limit = 10) {
  // This would implement playlist recommendation logic
  // For now, return popular playlists
  return this.find({
    isPublic: true,
    status: 'active',
    owner: { $ne: userId }
  })
  .sort({ playCount: -1, likedBy: -1 })
  .limit(limit);
};

module.exports = mongoose.model('Playlist', playlistSchema);
