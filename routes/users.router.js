const express = require("express");
const usersModel = require("../models/users.model"); // Ensure this path is correct
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../nodemailler"); // Assuming your nodemailer setup is here
const otpStore = {};
const passwordResetOtpStore = {}; // Separate store for password reset OTPs
const OTP_EXPIRATION_MINUTES = 10;
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const authenticate = require("../middleware/auth"); // Assuming you have an authentication middleware

console.log("--- users.router.js has been loaded ---");

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "profile-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed!"));
  },
}).single("profileImage");

// Route to handle "Forgot Password" OTP request
router.post("/forgot-password-otp", async (req, res) => {
    console.log("--- Received request on /forgot-password-otp ---");
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }
    try {
        const user = await usersModel.getUserByEmail(email);
        if (user) {
            const otp = generateOtp();
            const expiresAt = Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000;
            passwordResetOtpStore[email] = { otp, expiresAt, verified: false };
            await sendEmail(email, otp, "Password Reset OTP");
            console.log(`Password reset OTP sent to ${email}: ${otp}`);
        } else {
            console.log(`Password reset request for non-existent email: ${email}`);
        }
        res.status(200).json({ message: "If your email is registered, you will receive a password reset OTP." });
    } catch (error) {
        console.error("Error in /forgot-password-otp:", error);
        res.status(500).json({ message: "Server error while sending OTP." });
    }
});

// Route to verify the OTP for the password reset flow
router.post("/verify-password-reset-otp", async (req, res) => {
    console.log("--- Received request on /verify-password-reset-otp ---");
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required." });
    }
    const storedOtpData = passwordResetOtpStore[email];
    if (!storedOtpData) {
        return res.status(400).json({ message: "Invalid OTP. Please request a new one." });
    }
    if (Date.now() > storedOtpData.expiresAt) {
        delete passwordResetOtpStore[email];
        return res.status(400).json({ message: "OTP has expired." });
    }
    if (storedOtpData.otp === otp) {
        passwordResetOtpStore[email].verified = true;
        res.status(200).json({ message: "OTP verified successfully." });
    } else {
        res.status(400).json({ message: "Invalid OTP." });
    }
});

// Route for registration OTP
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  const existingUser = await usersModel.getUserByEmail(email);
  if (existingUser) {
    return res
      .status(400)
      .json({ message: "Email already registered. Please login." });
  }
  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000; // 10 minutes expiration
  try {
    const emailSent = await sendEmail(email, otp, "Registration OTP");
    if (emailSent) {
      otpStore[email] = { otp, expiresAt, verified: false };
      console.log(`OTP sent to ${email}: ${otp}`);
      res.status(200).json({ message: "OTP sent successfully to your email." });
    } else {
      res
        .status(500)
        .json({ message: "Failed to send OTP. Please try again." });
    }
  } catch (error) {
    console.error("Error in /send-otp:", error);
    res.status(500).json({ message: "Server error while sending OTP." });
  }
});

// Route for registration OTP verification
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required." });
  }
  const storedOtpData = otpStore[email];
  if (!storedOtpData) {
    return res
      .status(400)
      .json({ message: "OTP not found. Please request a new OTP." });
  }
  if (Date.now() > storedOtpData.expiresAt) {
    delete otpStore[email];
    return res
      .status(400)
      .json({ message: "OTP has expired. Please request a new one." });
  }
  if (storedOtpData.otp === otp) {
    otpStore[email].verified = true; // Mark as verified
    res.status(200).json({ message: "OTP verified successfully." });
  } else {
    res.status(400).json({ message: "Invalid OTP. Please try again." });
  }
});

// Route to reset the password after OTP verification
router.post("/reset-password", async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
        return res.status(400).json({ message: "Email and new password are required." });
    }
    const storedOtpData = passwordResetOtpStore[email];
    if (!storedOtpData || !storedOtpData.verified) {
        return res.status(400).json({ message: "OTP not verified. Please complete the verification step first." });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    } else if (
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(newPassword)
    ) {
      return res.status(400).json({
        message:
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
      });
    }

    try {
        // The users.model.js needs a function to update password
        await usersModel.updateUserPassword(email, newPassword);
        delete passwordResetOtpStore[email]; // Clean up the used OTP
        res.status(200).json({ message: "Password has been reset successfully." });
    } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({ message: "Server error while resetting password." });
    }
});

// Route for user registration
router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required for registration." });
  }

  const storedOtpData = otpStore[email];
  if (!storedOtpData || !storedOtpData.verified) {
    return res.status(403).json({
      message:
        "Email not verified or OTP process not completed. Please verify OTP first.",
    });
  }

  try {
    const existingUser = await usersModel.getUserByEmail(email);
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists with this email." });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    } else if (
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(password)
    ) {
      return res.status(400).json({
        message:
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
      });
    }

    const roles = await usersModel.getAllRoles();
    const warehouseCrewRole = roles.find(
      (role) => role.rolename === "Warehouse Crew"
    );
    const defaultRoleId = warehouseCrewRole ? warehouseCrewRole.roleid : 1;

    const newUser = await usersModel.createUser(email, password, defaultRoleId);

    delete otpStore[email];
    res.status(201).json({
      message: "User created successfully",
      user: {
        email: newUser.email,
        roleid: newUser.roleid,
        createdAt: newUser.created_at,
        updatedAt: newUser.updated_at,
      },
    });
  } catch (error) {
    console.error("Create User Error:", error);
    if (
      error.code === "23505" &&
      error.constraint &&
      error.constraint.includes("email")
    ) {
      return res.status(400).json({ message: "Email already registered." });
    }
    res.status(500).json({
      message: "Server error during registration.",
      error: error.message,
    });
  }
});

// Route for user login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await usersModel.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid Email or Password." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid Email or Password." });
    }

    if (!user.userid) {
      return res
        .status(500)
        .json({ message: "Server configuration error: User ID not found." });
    }

    const token = jwt.sign(
      { userid: user.userid, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Login successful",
      token: token,
      user: { id: user.userid, email: user.email, username: user.username },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all users
router.get("/", (req, res) => {
  usersModel
    .getAllUsers()
    .then((users) => res.status(200).json(users))
    .catch((error) => {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    });
});

// Get user profile
router.get("/profile", authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await usersModel.getUserById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const fullProfileImageUrl = user.profileimageurl
      ? `${req.protocol}://${req.get("host")}/${user.profileimageurl}`
      : null;

    res.status(200).json({
      success: true,
      data: {
        username: user.username,
        email: user.email,
        roleid: user.roleid,
        rolename: user.rolename,
        profileimageurl: fullProfileImageUrl,
      },
    });
  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Update user profile
router.put("/profile", authenticate, (req, res) => {
  upload(req, res, async (err) => {
    try {
      if (err) {
        return res.status(400).json({ message: err.message });
      }

      const userId = req.user.userId;
      const updates = {};

      if (req.body.username) updates.username = req.body.username;
      if (req.body.roleid) updates.roleid = req.body.roleid;
      if (req.body.password) {
        if (req.body.password.length < 8) {
          return res.status(400).json({
            message: "Password must be at least 8 characters long",
          });
        }
        if (
          !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(
            req.body.password
          )
        ) {
          return res.status(400).json({
            message:
              "Password must contain uppercase, lowercase, number, and special character",
          });
        }
        updates.password = await bcrypt.hash(req.body.password, 10);
      }

      if (req.file) {
        const user = await usersModel.getUserById(userId);
        if (user.profileimageurl) {
          const oldFilename = path.basename(user.profileimageurl);
          const oldImagePath = path.join(
            __dirname,
            "../../uploads",
            oldFilename
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
        updates.profileimageurl = `uploads/${req.file.filename}`;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updates provided" });
      }

      await usersModel.updateUserProfile(userId, updates);
      const userWithUpdatedRole = await usersModel.getUserById(userId);

      const userProfile = {
        userid: userWithUpdatedRole.userid,
        email: userWithUpdatedRole.email,
        username: userWithUpdatedRole.username,
        profileimageurl: userWithUpdatedRole.profileimageurl
          ? `${req.protocol}://${req.get("host")}/${
              userWithUpdatedRole.profileimageurl
            }`
          : null,
        roleid: userWithUpdatedRole.roleid,
        rolename: userWithUpdatedRole.rolename,
      };

      res.status(200).json(userProfile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });
});

module.exports = router;
