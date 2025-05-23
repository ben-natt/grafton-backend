const express = require('express');
const usersModel = require('../models/users.model');
const router = express.Router();
const bcrypt = require('bcrypt');
const { sendEmail } = require('../nodemailler'); // Assuming your nodemailer setup is here
const otpStore = {};
const OTP_EXPIRATION_MINUTES = 10;

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
}

router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }
  const existingUser = await usersModel.getUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ message: 'Email already registered. Please login.' });
  }
  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000;// 10 minutes expiration
  try {
    const emailSent = await sendEmail(email, otp); 
    if (emailSent) {
      otpStore[email] = { otp, expiresAt, verified: false };
      console.log(`OTP sent to ${email}: ${otp}`);
      res.status(200).json({ message: 'OTP sent successfully to your email.' });
    } else {
      res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
    }
  } catch (error) {
    console.error('Error in /send-otp:', error);
    res.status(500).json({ message: 'Server error while sending OTP.' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }
  const storedOtpData = otpStore[email];
  if (!storedOtpData) {
    return res.status(400).json({ message: 'OTP not found. Please request a new OTP.' });
  }
  if (Date.now() > storedOtpData.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
  }
  if (storedOtpData.otp === otp) {
    otpStore[email].verified = true; // Mark as verified
    res.status(200).json({ message: 'OTP verified successfully.' });
  } else {
    res.status(400).json({ message: 'Invalid OTP. Please try again.' });
  }
});

router.post('/register', async (req, res) => {
  const { email, password } = req.body; // Email here is sent by frontend after OTP verification
  console.log('Create user request received for email:', email);

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required for registration.' });
  }

  const storedOtpData = otpStore[email];
  if (!storedOtpData || !storedOtpData.verified) {
    return res.status(403).json({ message: 'Email not verified or OTP process not completed. Please verify OTP first.' });
  }

  try {
    const existingUser = await usersModel.getUserByEmail(email); 
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(password)) {
      return res.status(400).json({ message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.' });
    }

    const defaultRoleId = 1;
    const createdAt = new Date(); 
    const updatedAt = new Date(); 

    const newUser = await usersModel.createUser(email, password, defaultRoleId, createdAt, updatedAt); 

    delete otpStore[email]; 
    res.status(201).json({
      message: 'User created successfully',
      user: {
        email: newUser.email,
        roleid: newUser.roleid, 
        createdAt: newUser.created_at,
        updatedAt: newUser.updated_at, 
      }
    });

  } catch (error) {
    console.error('Create User Error:', error);
    // Check for unique constraint violation for email (though OTP flow should mitigate this for new users)
    if (error.code === '23505' && error.constraint && error.constraint.includes('email')) {
        return res.status(400).json({ message: 'Email already registered.' });
    }
    res.status(500).json({ message: 'Server error during registration.', error: error.message });
  }
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login request received:', req.body);
  try {
    const user = await usersModel.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid Email or Password.' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid Email or Password' });
    }
    res.status(200).json({
      message: 'Login successful',
      user: { email: user.email, username: user.username },
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/', (req, res) => {
  usersModel.getAllUsers()
    .then((users) => res.status(200).json(users))
    .catch((error) => {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    });
});

module.exports = router;