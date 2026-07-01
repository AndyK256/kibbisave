// ============================================================
// KIBBISAVE — AUTHENTICATION
// Stack: Supabase Auth + Africa's Talking (OTP SMS)
// File: auth.js  — runs on your Node.js backend
// ============================================================
// SETUP INSTRUCTIONS (do these once):
// 1. Go to supabase.com → create a free project
// 2. Go to africastalking.com → create a free account
// 3. Create a .env file in your project root with the keys below
// npm install @supabase/supabase-js africastalking express dotenv
// ============================================================

require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const AfricasTalking = require('africastalking');

const router = express.Router();

// --- Clients ---
const supabase = createClient(
  process.env.SUPABASE_URL,       // from your Supabase project settings
  process.env.SUPABASE_SERVICE_KEY // Service key — keep secret, backend only
);

const AT = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,     // from africastalking.com dashboard
  username: process.env.AT_USERNAME,    // your AT username
});
const sms = AT.SMS;

// In-memory OTP store (replace with Redis in production)
// Structure: { phone: { otp, expiresAt } }
const otpStore = new Map();

// ============================================================
// STEP 1 — SEND OTP
// POST /auth/send-otp
// Body: { phone: "+256771234567" }
// ============================================================
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !phone.startsWith('+256')) {
      return res.status(400).json({
        error: 'Phone number must be in format +256XXXXXXXXX'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store OTP
    otpStore.set(phone, { otp, expiresAt });

    // Send SMS via Africa's Talking
    await sms.send({
      to:      [phone],
      message: `Your KibbiSave verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`,
      from:    'KibbiSave'   // your AT sender ID (apply in AT dashboard)
    });

    console.log(`OTP sent to ${phone}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully'
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// ============================================================
// STEP 2 — VERIFY OTP + CREATE/LOGIN USER
// POST /auth/verify-otp
// Body: { phone: "+256771234567", otp: "123456" }
// ============================================================
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP required' });
    }

    // Check OTP
    const stored = otpStore.get(phone);
    if (!stored) {
      return res.status(400).json({ error: 'No OTP found for this number. Request a new one.' });
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ error: 'OTP has expired. Request a new one.' });
    }
    if (stored.otp !== otp) {
      return res.status(400).json({ error: 'Incorrect OTP' });
    }

    // OTP is valid — clear it
    otpStore.delete(phone);

    // Check if user already exists in our database
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();

    let user;
    let isNewUser = false;

    if (existingUser) {
      // Returning user — just log them in
      user = existingUser;
    } else {
      // New user — create their record
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({ phone })
        .select()
        .single();

      if (createError) throw createError;
      user = newUser;
      isNewUser = true;
    }

    // Create a session token using Supabase Auth
    // We use the admin API to create a custom token
    const { data: session, error: sessionError } = await supabase.auth.admin
      .generateLink({
        type: 'magiclink',
        email: `${phone.replace('+', '')}@kibbisave.internal`, // dummy email for Supabase auth
        options: { data: { user_id: user.id, phone } }
      });

    if (sessionError) throw sessionError;

    return res.status(200).json({
      success:   true,
      isNewUser,
      user: {
        id:           user.id,
        phone:        user.phone,
        display_name: user.display_name,
        avatar_url:   user.avatar_url,
      },
      token: session.properties.hashed_token // send this to the app
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// ============================================================
// STEP 3 — COMPLETE PROFILE (after first login)
// POST /auth/complete-profile
// Body: { display_name: "Andrew Nkunda", location: "Kampala" }
// Headers: { Authorization: "Bearer <token>" }
// ============================================================
router.post('/complete-profile', authenticateUser, async (req, res) => {
  try {
    const { display_name, location } = req.body;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('users')
      .update({ display_name, location, updated_at: new Date() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, user: data });

  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ============================================================
// MIDDLEWARE — authenticateUser
// Add this to any route that needs a logged-in user
// Usage: router.get('/my-route', authenticateUser, handler)
// ============================================================
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get our user record from the database
    const { data: dbUser } = await supabase
      .from('users')
      .select('*')
      .eq('phone', user.user_metadata.phone)
      .single();

    req.user = dbUser;
    next();

  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = { router, authenticateUser };
