const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup PostgreSQL pool for express-session
const pgPool = require('./config/db');

// Configure session middleware
app.use(
  session({
    store: new pgSession({
      pool: pgPool,
      tableName: 'session',
    }),
    secret: process.env.SESSION_SECRET || 'szabist_nexus_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/users', require('./routes/users'));
app.use('/api/v1/campuses', require('./routes/campuses'));
app.use('/api/v1/societies', require('./routes/societies'));
app.use('/api/v1/posts', require('./routes/posts'));
app.use('/api/v1/notifications', require('./routes/notifications'));
app.use('/api/v1/admin', require('./routes/admin'));

// Fallback: send 404 for unhandled API routes
app.all('/api/v1/*', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.url} not found.` });
});

// Serve frontend HTML pages directly for clean routing if accessed
app.get('*', (req, res) => {
  // Check if request looks like an API call
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Serve index.html as fallback for SPAs or general pages
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error.',
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`ZabNex Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app; // For testing
