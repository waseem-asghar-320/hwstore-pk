if (!process.env.VERCEL) {
  require('dotenv').config();
} const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');

console.log('🚀 Initializing watch store backend...');

const frontendPath = path.resolve(__dirname, '..', 'frontend');
const uploadsPath = path.resolve(__dirname, 'uploads');
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://waseemrana8819_db_user:cdkLjeH26FDfRAr8@cluster0.cndgc0n.mongodb.net/?appName=Cluster0"

function ensureDirectory(dirPath) {
  // Best-effort only: on Vercel the deployment bundle (/var/task/...) is
  // read-only, so this would throw EROFS if the folder didn't already exist
  // in the bundle. Product images no longer need this directory (they go to
  // Cloudinary), it's kept only to serve any legacy /uploads/* files, so a
  // failure here must never crash the app.
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (error) {
    console.warn(`⚠️ Could not ensure directory (${dirPath}):`, error.message);
  }
}

function createApp() {
  const app = express();

  ensureDirectory(uploadsPath);

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Minimal cookie parser for auth cookies
  app.use((req, res, next) => {
    req.cookies = {};
    const rawCookies = req.headers.cookie;
    if (rawCookies) {
      rawCookies.split(';').forEach((cookie) => {
        const [name, ...value] = cookie.trim().split('=');
        if (!name) return;
        req.cookies[name] = decodeURIComponent(value.join('=') || '');
      });
    }
    next();
  });

  app.use('/uploads', express.static(uploadsPath));

  try {
    const productRoutes = require('./routes/products');
    const orderRoutes = require('./routes/orders');
    const authRoutes = require('./routes/auth');
    app.use('/api/products', productRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/auth', authRoutes);
    console.log('✅ Routes loaded');
  } catch (error) {
    console.error('❌ Error loading routes:', error.message);
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'HWStore@2026';
  const LEGACY_ADMIN_PASSWORD = 'ChronoVault@2026';

  function verifyAdminPageAccess(req, res, next) {
    const adminRoutes = ['/admin', '/admin.html', '/orders', '/orders.html'];
    if (!adminRoutes.includes(req.path)) {
      return next();
    }

    const token = req.cookies?.adminToken;
    if (!token) {
      return res.redirect('/login');
    }

    try {
      jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key_here');
      return next();
    } catch (error) {
      return res.redirect('/login');
    }
  }

  app.use(verifyAdminPageAccess);

  app.get('/login', (req, res) => {
    const token = req.cookies?.adminToken;
    if (token) {
      try {
        jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key_here');
        return res.redirect('/admin');
      } catch (error) {
        // Ignore invalid or expired token and show login page
      }
    }
    res.sendFile(path.join(frontendPath, 'login.html'));
  });

  app.get(['/admin', '/admin.html'], (req, res) => {
    res.sendFile(path.join(frontendPath, 'admin.html'));
  });

  app.get(['/orders', '/orders.html'], (req, res) => {
    res.sendFile(path.join(frontendPath, 'orders.html'));
  });

  app.use(express.static(frontendPath));

  app.get('/', (req, res) => {
    if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    } else {
      res.send('<h1>Watch Store API</h1><p>Create frontend/index.html</p>');
    }
  });

  app.get('/api', (req, res) => {
    res.json({ message: 'Premium Watch Store API is running' });
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      uptime: process.uptime(),
    });
  });

  app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });

  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ success: false, message: 'Route not found' });
    }
    res.status(404).send('Page not found');
  });

  return app;
}

let dbPromise = null;

function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (mongoose.connection.readyState === 2 && dbPromise) {
    return dbPromise;
  }

  dbPromise = mongoose
    .connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    })
    .then(() => {
      console.log('✅ Connected to MongoDB');
      return mongoose.connection;
    })
    .catch((error) => {
      console.error('⚠️ MongoDB connection error:', error.message);
      console.error('💡 Set MONGODB_URI to a reachable MongoDB instance for data APIs.');
      return null;
    });

  return dbPromise;
}

function startServer(port = Number(process.env.PORT) || 5001) {
  const server = app.listen(port, () => {
    console.log(`✅ Server running at http://127.0.0.1:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      console.log(`⚠️ Port ${port} is busy. Trying ${fallbackPort}...`);
      startServer(fallbackPort);
      return;
    }

    console.error('❌ Server Error:', err.message);
    process.exit(1);
  });
}

const app = createApp();

module.exports = {
  app,
  createApp,
  connectDB,
  startServer,
};
