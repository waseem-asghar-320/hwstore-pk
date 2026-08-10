const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { verifyToken, isAdmin } = require('../middleware/auth');

// ============================================
// 1. ADMIN SIGNUP
// ============================================
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    console.log('📝 Signup attempt:', { username, email });

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email and password'
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username must be at least 3 characters'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if admin already exists
    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) {
      return res.status(409).json({
        success: false,
        message: 'Admin account already exists. Only one admin is allowed.'
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      email: email.toLowerCase()
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create admin user
    const user = new User({
      username,
      email: email.toLowerCase(),
      password,
      role: 'admin'
    });

    await user.save();
    console.log('✅ Admin created:', user.email);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        username: user.username
      },
      process.env.JWT_SECRET || 'your_secret_key_here',
      { expiresIn: '24h' }
    );

    // 🔐 SET HTTP-ONLY COOKIE
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/'
    });

    res.status(201).json({
      success: true,
      message: '✅ Admin account created successfully!',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// 2. ADMIN LOGIN
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    console.log('👤 User found:', user ? 'Yes' : 'No');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (user.role !== 'admin') {
      console.log('❌ Not admin role:', user.role);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    const isMatch = await user.comparePassword(password);
    console.log('🔑 Password match:', isMatch ? 'Yes' : 'No');

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        username: user.username
      },
      process.env.JWT_SECRET || 'your_secret_key_here',
      { expiresIn: '24h' }
    );

    console.log('✅ Token generated for:', user.email);

    // 🔐 SET HTTP-ONLY COOKIE
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      success: true,
      message: '✅ Login successful! Welcome Admin!',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// 3. LOGOUT
// ============================================
router.post('/logout', async (req, res) => {
  try {
    res.clearCookie('adminToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// 4. VERIFY TOKEN
// ============================================
router.get('/verify', verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// ============================================
// 5. CHECK IF ADMIN EXISTS
// ============================================
router.get('/check-admin', async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    res.json({
      exists: !!adminExists,
      hasAdmin: !!adminExists
    });
  } catch (error) {
    res.status(500).json({
      exists: false,
      error: error.message
    });
  }
});

// ============================================
// 6. GET PROFILE
// ============================================
router.get('/profile', verifyToken, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -__v');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// 7. CHANGE PASSWORD
// ============================================
router.post('/change-password', verifyToken, isAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    const user = await User.findById(req.user.id);
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: '✅ Password changed successfully!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// 8. DELETE ADMIN ACCOUNT
// ============================================
router.delete('/delete-admin', verifyToken, isAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;

    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the only admin account.'
      });
    }

    const deletedUser = await User.findByIdAndDelete(adminId);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.clearCookie('adminToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      success: true,
      message: '✅ Admin account deleted successfully!'
    });

  } catch (error) {
    console.error('❌ Delete admin error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// 9. TEST ROUTE
// ============================================
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes are working!',
    cookies: req.cookies
  });
});

module.exports = router;