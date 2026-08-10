const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // Get token from cookie first, then Authorization header
  const token = req.cookies?.adminToken || 
                req.header('Authorization')?.replace('Bearer ', '');
  
  console.log('🔍 Token present:', !!token);

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Access denied. No token provided.' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key_here');
    console.log('✅ Token verified for:', decoded.email);
    req.user = decoded;
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired' 
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Authentication error' 
    });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false,
      message: 'Admin access required' 
    });
  }
  next();
};

module.exports = { verifyToken, isAdmin };