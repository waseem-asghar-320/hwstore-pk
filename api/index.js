const backend = require('../backend/app');

module.exports = async function handler(req, res) {
  // Ensure DB is connected before delegating to the Express app.
  try {
    await backend.connectDB();
  } catch (err) {
    console.error('❌ Vercel function — DB connection failed:', err && err.message ? err.message : err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Database connection error' }));
    return;
  }

  try {
    // The `app` exported by backend/app is an Express request handler
    const { app } = backend;
    return app(req, res);
  } catch (err) {
    console.error('❌ Vercel function — handler error:', err && err.message ? err.message : err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Server error' }));
  }
};
