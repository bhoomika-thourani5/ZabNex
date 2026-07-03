const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const pool = require('../config/db');
const { validateRegister, validateLogin } = require('../middleware/validate');
const router = express.Router();

// Generate random 6-digit code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/v1/auth/register
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { email, password, full_name, campus_id } = req.body;

    // Check if email already exists
    const existingUserRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUserRes.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }

    // Verify campus exists
    const campusRes = await pool.query('SELECT id FROM campuses WHERE id = $1', [campus_id]);
    if (campusRes.rows.length === 0) {
      return res.status(400).json({ error: 'Selected campus block does not exist.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();

    // Determine initial role: if first user, or if email is admin@, give super_admin, else student
    let role = 'student';
    if (email.startsWith('admin@')) {
      role = 'super_admin';
    }

    const insertUserRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, campus_id, verification_code, is_verified, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, false, true) RETURNING *`,
      [email, passwordHash, full_name, role, campus_id, verificationCode]
    );
    const user = insertUserRes.rows[0];

    // Output verification code to console for development verification
    console.log(`\n==================================================`);
    console.log(`[VERIFICATION CODE SENT]`);
    console.log(`User: ${email}`);
    console.log(`Code: ${verificationCode}`);
    console.log(`==================================================\n`);

    // Send the verification email
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: `"ZabNex" <${process.env.SMTP_USER}>`,
          to: email,
          subject: "ZabNex - Verify Your Account",
          text: `Welcome to ZabNex! Your verification code is: ${verificationCode}`,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9; border-radius: 8px; max-width: 500px; margin: auto;">
                  <h2 style="color: #003b46;">Welcome to ZabNex!</h2>
                  <p>Thank you for registering. Please use the following 6-digit code to verify your email address:</p>
                  <div style="background-color: #e2e2e2; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; border-radius: 4px; margin: 20px 0;">
                    ${verificationCode}
                  </div>
                  <p>If you did not request this, you can safely ignore this email.</p>
                </div>`
        });
        console.log('Verification email sent successfully to', email);
      } catch (emailError) {
        console.error('Error sending verification email:', emailError);
      }
    } else {
      console.log('SMTP credentials not found in .env, skipping actual email send.');
    }

    res.status(201).json({
      message: 'Registration successful! Please verify your email with the 6-digit code.',
      email: user.email,
      role: user.role,
      requiresVerification: true,
    });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// POST /api/v1/auth/verify
router.post('/verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userRes.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ error: 'User is already verified.' });
    }

    if (user.verification_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }

    // Mark as verified
    await pool.query(
      'UPDATE users SET is_verified = true, verification_code = null WHERE id = $1',
      [user.id]
    );

    res.status(200).json({ message: 'Account verified successfully! You can now log in.' });
  } catch (error) {
    console.error('Verification Error:', error);
    res.status(500).json({ error: 'Internal server error during verification.' });
  }
});

// POST /api/v1/auth/login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Fetch user and campus data
    const userRes = await pool.query(
      `SELECT u.*, c.name as campus_name 
       FROM users u 
       LEFT JOIN campuses c ON u.campus_id = c.id 
       WHERE u.email = $1`, 
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Your account has been deactivated by administration.' });
    }

    if (!user.is_verified) {
      return res.status(400).json({
        error: 'Email verification pending.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Fetch society memberships
    const socRes = await pool.query(
      `SELECT sm.role, s.id, s.name 
       FROM society_members sm 
       JOIN societies s ON sm.society_id = s.id 
       WHERE sm.user_id = $1`,
      [user.id]
    );
    const societies = socRes.rows.map(sm => ({
      id: sm.id,
      name: sm.name,
      role: sm.role,
    }));

    // Set user properties in express session
    req.session.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      campus_id: user.campus_id,
      campus_name: user.campus_name,
      societies: societies,
    };

    res.status(200).json({
      message: 'Login successful.',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        campus_id: user.campus_id,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ error: 'Could not log out. Please try again.' });
      }
      res.clearCookie('connect.sid'); // Clean cookie name (default for express-session)
      return res.status(200).json({ message: 'Logout successful.' });
    });
  } else {
    res.status(200).json({ message: 'No active session.' });
  }
});

// GET /api/v1/auth/me
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  
  // Re-fetch user in case role/membership changed
  try {
    const userRes = await pool.query(
      `SELECT u.*, c.name as campus_name 
       FROM users u 
       LEFT JOIN campuses c ON u.campus_id = c.id 
       WHERE u.id = $1`, 
      [req.session.user.id]
    );

    if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
      req.session.destroy();
      return res.status(401).json({ error: 'Account inactive or deleted.' });
    }
    const user = userRes.rows[0];

    // Fetch society memberships
    const socRes = await pool.query(
      `SELECT sm.role, s.id, s.name 
       FROM society_members sm 
       JOIN societies s ON sm.society_id = s.id 
       WHERE sm.user_id = $1`,
      [user.id]
    );
    const societies = socRes.rows.map(sm => ({
      id: sm.id,
      name: sm.name,
      role: sm.role,
    }));

    req.session.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      campus_id: user.campus_id,
      campus_name: user.campus_name,
      societies: societies,
    };

    res.status(200).json({ user: req.session.user });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
