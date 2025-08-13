# Samsung Music Clone

A comprehensive music streaming and library management web application that mirrors the Samsung Music app's features and functionality. Built with modern web technologies including React.js, Node.js, Express, and MongoDB.

![Samsung Music Clone](./assets/images/app-preview.png)

## 🎵 Features

### Core Music Features
- **Music Library Organization** - Sort by title, artist, album, genre, duration, and date added
- **Advanced Playback Controls** - Play, pause, skip, shuffle, repeat modes
- **Playlist Management** - Create, edit, share, and collaborate on playlists
- **Smart Search** - Real-time search with auto-suggestions
- **Music Upload** - Support for MP3, WAV, FLAC, M4A, OGG formats
- **Favorites System** - Like and organize favorite tracks

### User Experience
- **Responsive Design** - Optimized for desktop, tablet, and mobile
- **Progressive Web App** - Offline support and native app-like experience
- **Real-time Sync** - Live listening sessions and music sharing
- **Samsung Design Language** - Familiar UI with Samsung's color schemes and typography
- **Dark Theme** - Eye-friendly dark interface

### Advanced Features
- **Audio Visualization** - Web Audio API integration
- **Background Sync** - Offline queue and sync when online
- **Push Notifications** - New music and playlist notifications
- **Cloud Storage** - Secure file storage with AWS S3
- **User Authentication** - JWT-based secure authentication
- **Subscription Tiers** - Free and premium plans with different limits

## 🛠️ Technology Stack

### Frontend
- **HTML5 & CSS3** - Modern semantic markup and styling
- **Vanilla JavaScript** - No framework dependencies for maximum performance
- **Web Audio API** - Advanced audio processing and visualization
- **Service Workers** - PWA functionality and offline support
- **Responsive Design** - CSS Grid and Flexbox for all screen sizes

### Backend
- **Node.js** - Server-side JavaScript runtime
- **Express.js** - Fast and minimal web framework
- **MongoDB** - NoSQL database with Mongoose ODM
- **JWT** - JSON Web Tokens for authentication
- **Multer** - File upload handling
- **Socket.io** - Real-time communication

### Cloud & DevOps
- **AWS S3** - File storage and CDN
- **Redis** - Caching and session management
- **Winston** - Comprehensive logging
- **Helmet** - Security middleware
- **Rate Limiting** - API protection

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- AWS Account (for S3 storage)
- Redis (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/samsung-music-clone.git
   cd samsung-music-clone
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   ```env
   MONGODB_URI=mongodb://localhost:27017/samsung-music
   JWT_SECRET=your-super-secret-jwt-key
   AWS_ACCESS_KEY_ID=your-aws-access-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret-key
   AWS_S3_BUCKET=samsung-music-files
   ```

4. **Start MongoDB**
   ```bash
   # Using MongoDB Community Edition
   mongod --config /usr/local/etc/mongod.conf --fork
   
   # Or using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

5. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Open your browser**
   Navigate to `http://localhost:5000`

## 📁 Project Structure

```
samsung-music-clone/
├── assets/                 # Frontend assets
│   ├── css/
│   │   └── style.css      # Main stylesheet
│   ├── js/
│   │   └── script.js      # Main JavaScript application
│   ├── icons/             # PWA icons
│   └── images/            # Static images
├── server/                # Backend server
│   ├── models/            # Database models
│   │   ├── User.js
│   │   ├── Music.js
│   │   └── Playlist.js
│   ├── routes/            # API routes
│   │   ├── auth.js
│   │   ├── music.js
│   │   ├── playlists.js
│   │   ├── user.js
│   │   └── explore.js
│   ├── middleware/        # Custom middleware
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── utils/             # Utility functions
│   │   ├── logger.js
│   │   ├── cloudStorage.js
│   │   └── audioProcessor.js
│   └── server.js          # Main server file
├── index.html             # Main HTML file
├── manifest.json          # PWA manifest
├── sw.js                  # Service worker
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

## 🔧 Configuration

### Database Setup
The application uses MongoDB to store user data, music metadata, and playlists. Make sure MongoDB is running and accessible.

### AWS S3 Setup
1. Create an S3 bucket for music file storage
2. Configure IAM user with S3 permissions
3. Add credentials to your `.env` file

### Environment Variables
Copy `.env.example` to `.env` and configure:

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `AWS_*` - AWS credentials and bucket name
- `PORT` - Server port (default: 5000)

## 📱 Progressive Web App

This application is built as a PWA with the following features:

- **Offline Support** - Music can be cached for offline playback
- **Install Prompt** - Users can install the app on their devices
- **Background Sync** - Actions sync when connectivity is restored
- **Push Notifications** - Updates about new music and playlists

### PWA Installation

1. Open the app in a supported browser
2. Look for the "Install" prompt or button
3. Follow browser-specific installation steps
4. Access the app from your home screen or app drawer

## 🎨 Customization

### Themes
The app supports customizable themes. Edit CSS variables in `assets/css/style.css`:

```css
:root {
  --primary-color: #1f7ce8;
  --secondary-color: #ff6b35;
  --background-primary: #1a1a1a;
  /* ... other variables */
}
```

### Adding New Features
1. Backend: Add routes in `server/routes/`
2. Frontend: Extend the `SamsungMusicApp` class in `assets/js/script.js`
3. Database: Create or modify models in `server/models/`

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcrypt with configurable rounds
- **Rate Limiting** - Protection against brute force attacks
- **Input Validation** - Server-side validation for all inputs
- **File Type Validation** - Only allowed audio formats accepted
- **CORS Protection** - Configurable CORS policies
- **Helmet Security** - Security headers and protection

## 📊 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/validate` - Validate JWT token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password/:token` - Reset password
- `POST /api/auth/logout` - User logout

### Music Endpoints
- `GET /api/music/library` - Get user's music library
- `POST /api/music/upload` - Upload music files
- `GET /api/music/search` - Search music tracks
- `POST /api/music/:id/favorite` - Toggle favorite status
- `DELETE /api/music/:id` - Delete music track

### Playlist Endpoints
- `GET /api/playlists` - Get user's playlists
- `POST /api/playlists` - Create new playlist
- `PUT /api/playlists/:id` - Update playlist
- `DELETE /api/playlists/:id` - Delete playlist
- `POST /api/playlists/:id/tracks` - Add track to playlist

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 🚀 Deployment

### Heroku Deployment
1. Create a Heroku app
2. Set environment variables in Heroku dashboard
3. Deploy using Git:
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

### Docker Deployment
1. Build the Docker image:
   ```bash
   docker build -t samsung-music-clone .
   ```

2. Run the container:
   ```bash
   docker run -p 5000:5000 --env-file .env samsung-music-clone
   ```

### AWS Deployment
Use AWS ECS, EC2, or Elastic Beanstalk for production deployment.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/new-feature`
5. Submit a pull request

### Development Guidelines
- Follow ESLint configuration
- Write tests for new features
- Update documentation
- Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Samsung Music app for design inspiration
- Web Audio API for audio processing capabilities
- MongoDB for flexible data storage
- AWS for cloud infrastructure
- All open-source contributors

## 📞 Support

- Create an issue for bug reports
- Check existing issues before creating new ones
- Join our Discord community for discussions
- Email: support@samsungmusicclone.com

## 🗺️ Roadmap

### Version 2.0
- [ ] Social features (friend sharing, collaborative playlists)
- [ ] Advanced audio effects and equalizer
- [ ] Podcast support
- [ ] Voice commands integration
- [ ] Machine learning recommendations

### Version 3.0
- [ ] Live streaming capabilities
- [ ] Artist portal for music submission
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Integration with external music services

---

Made with ❤️ by the Samsung Music Clone team
