const express = require("express");
const usersModel = require("../models/users.model"); // Ensure this path is correct
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../nodemailler"); // Assuming your nodemailer setup is here
const otpStore = {};
const passwordResetOtpStore = {}; // Separate store for password reset OTPs
const OTP_EXPIRATION_MINUTES = 10;
const OTP_COOLDOWN_MINUTES = 1; // Cooldown period in minutes
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const authenticate = require("../middleware/auth"); // Assuming you have an authentication middleware

/**
 * Generates a random 4-digit OTP.
 * @returns {string} The generated OTP.
 */
function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
}

// Configure multer for file uploads, storing images in the profile-specific directory.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads/img/profile"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9); // Unique suffix to avoid filename collisions
    cb(null, "profile-" + uniqueSuffix + path.extname(file.originalname)); // Use original file extension
  },
});

// Multer middleware for handling single file uploads with validation.
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // MODIFICATION: Increased to 2MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/; // Allowed file types
    const mimetype = filetypes.test(file.mimetype); // Check MIME type
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    ); // Check file extension

    if (mimetype && extname) {
      // If both MIME type and extension are valid
      return cb(null, true); // Accept the file
    }
    // REVISED: Pass a new Error object for better error handling
    cb(new Error("Only image files (jpeg, jpg, png, gif) are allowed!"));
  },
}).single("profileImage"); // 'profileImage' is the field name in the form data

// Route to send an OTP for user registration.
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  try {
    const existingUser = await usersModel.getUserByEmail(email);
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Email already registered. Please login." });
    }
    const otp = generateOtp();
    const expiresAt = Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000; // 10 minutes expiration

    // Pass a subject to the sendEmail function for clarity
    const emailSent = await sendEmail(email, otp, "Your Registration OTP");
    if (emailSent) {
      otpStore[email] = { otp, expiresAt, verified: false };
      console.log(`Registration OTP sent to ${email}: ${otp}`);
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

// Route to verify the OTP for registration.
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

// Route to handle "Forgot Password" OTP request.
router.post("/forgot-password-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // --- Start of Cooldown Logic ---
  const existingOtpData = passwordResetOtpStore[email];
  if (existingOtpData && existingOtpData.lastSent) {
    const cooldownPeriod = OTP_COOLDOWN_MINUTES * 60 * 1000;
    const timeSinceLastSent = Date.now() - existingOtpData.lastSent;

    if (timeSinceLastSent < cooldownPeriod) {
      const timeLeft = Math.ceil((cooldownPeriod - timeSinceLastSent) / 1000);
      // Return a "Too Many Requests" error
      return res.status(429).json({
        message: `Please wait ${timeLeft} seconds before requesting another OTP.`,
      });
    }
  }
  // --- End of Cooldown Logic ---

  try {
    const user = await usersModel.getUserByEmail(email);
    // If user does not exist, return an error.
    if (!user) {
      return res.status(404).json({
        message: "Email is not registered. Please create an account.",
      });
    }

    // If user exists, proceed with sending OTP.
    const otp = generateOtp();
    const expiresAt = Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000;
    // Store OTP, expiration, and the timestamp of when it was sent
    passwordResetOtpStore[email] = {
      otp,
      expiresAt,
      verified: false,
      lastSent: Date.now(),
    };

    await sendEmail(email, otp, "Password Reset OTP");
    console.log(`Password reset OTP sent to ${email}: ${otp}`);

    res
      .status(200)
      .json({ message: "A password reset OTP has been sent to your email." });
  } catch (error) {
    console.error("Error in /forgot-password-otp:", error);
    res.status(500).json({ message: "Server error while sending OTP." });
  }
});

// Route to verify the OTP for the password reset flow.
router.post("/verify-password-reset-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required." });
  }
  const storedOtpData = passwordResetOtpStore[email];
  if (!storedOtpData) {
    return res
      .status(400)
      .json({ message: "Invalid OTP. Please request a new one." });
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

// Route to reset the password after OTP verification.
router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res
      .status(400)
      .json({ message: "Email and new password are required." });
  }
  const storedOtpData = passwordResetOtpStore[email];
  if (!storedOtpData || !storedOtpData.verified) {
    return res.status(400).json({
      message: "OTP not verified. Please complete the verification step first.",
    });
  }

  // Password complexity validation
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
    // Assumes users.model.js has a function to update the password by email.
    await usersModel.updateUserPassword(email, newPassword);
    delete passwordResetOtpStore[email]; // Clean up the used OTP
    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ message: "Server error while resetting password." });
  }
});

// Route for user registration.
router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  console.log("Create user request received for email:", email);

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
      console.log("User already exists with this email:", email);
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
    const defaultRoleId = warehouseCrewRole ? warehouseCrewRole.roleid : 1; // Fallback to 1 if not found

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

// Route for user login.
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Login request received:", req.body);
  try {
    const user = await usersModel.getUserByEmail(email);
    console.log("Users fetched:", user);

    if (!user) {
      return res.status(401).json({ message: "Invalid Email or Password." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid Email or Password." });
    }

    if (!user.userid) {
      console.error(
        "User object from DB does not contain 'userid'. Please ensure your SQL query in users.model.js returns the userid column."
      );
      return res
        .status(500)
        .json({ message: "Server configuration error: User ID not found." });
    }

    const token = jwt.sign(
      { userid: user.userid, email: user.email }, // Payload for JWT
      process.env.JWT_SECRET, // Secret key from environment variables
      { expiresIn: "10h" } // Token expires in 10 hours
    );

    console.log("Token: " + token);
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

// Route for user logout.
router.post("/logout", authenticate, (req, res) => {
  // On the server-side for stateless JWT, there's nothing to do.
  // The client is responsible for deleting the token.
  res.status(200).json({ message: "Logout successful." });
});

// Route to get all users (example of a protected route, might need admin privileges in a real app).
router.get("/", (req, res) => {
  usersModel
    .getAllUsers()
    .then((users) => res.status(200).json(users))
    .catch((error) => {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    });
});

// Route to get the authenticated user's profile.
router.get("/profile", authenticate, async (req, res) => {
  try {
    const userId = req.user.userId; // Extracted from JWT by authenticate middleware

    const user = await usersModel.getUserById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const protocol =
      req.headers["x-forwarded-proto"]?.split(",")[0] || req.protocol;
    const fullProfileImageUrl = user.profileimageurl
      ? `${protocol}://${req.get("host")}/${user.profileimageurl}`
      : null;
    console.log("Full profile image URL:", fullProfileImageUrl);

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

// Route to update the authenticated user's profile.
// Route to update the authenticated user's profile.
router.put("/profile", authenticate, (req, res) => {
  upload(req, res, async (err) => {
    // MODIFICATION: Handle multer-specific errors first
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({
            success: false,
            message: "Image file size cannot exceed 2MB.",
          });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      // Handle other errors (like file type filter)
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      const userId = req.user.userId;
      const updates = {};

      // Handle text fields
      if (req.body.username) updates.username = req.body.username;
      if (req.body.roleid) updates.roleid = req.body.roleid;
      if (req.body.password) {
        if (req.body.password.length < 8) {
          return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters long",
          });
        }
        if (
          !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(
            req.body.password
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Password must contain uppercase, lowercase, number, and special character",
          });
        }
        updates.password = await bcrypt.hash(req.body.password, 10);
      }

      // Handle file upload
      if (req.file) {
        const user = await usersModel.getUserById(userId);
        if (user.profileimageurl) {
          const oldFilename = path.basename(user.profileimageurl);
          const oldImagePath = path.join(
            __dirname,
            "../uploads/img/profile", // Point to the correct uploads directory
            oldFilename
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
            console.log(`Deleted old profile image: ${oldImagePath}`);
          } else {
            console.log(
              `Old profile image not found to delete: ${oldImagePath}`
            );
          }
        }
        updates.profileimageurl = `uploads/img/profile/${req.file.filename}`;
      }

      if (Object.keys(updates).length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "No updates provided" });
      }

      await usersModel.updateUserProfile(userId, updates);
      // Fetch the user again to get the most recent data, including the role name.
      const userWithUpdatedRole = await usersModel.getUserById(userId);

      const protocol =
        req.headers["x-forwarded-proto"]?.split(",")[0] || req.protocol;
      const fullProfileImageUrl = userWithUpdatedRole.profileimageurl
        ? `${protocol}://${req.get("host")}/${
            userWithUpdatedRole.profileimageurl
          }`
        : null;

      const userProfile = {
        userid: userWithUpdatedRole.userid,
        email: userWithUpdatedRole.email,
        username: userWithUpdatedRole.username,
        profileimageurl: fullProfileImageUrl,
        roleid: userWithUpdatedRole.roleid,
        rolename: userWithUpdatedRole.rolename,
      };

      // MODIFICATION: Standardize success response
      res.status(200).json({ success: true, data: userProfile });
    } catch (error) {
      console.error("Error updating profile:", error);
      // MODIFICATION: Catch unique constraint violation for username
      // The error name can be 'SequelizeUniqueConstraintError'
      // The postgres error code for unique violation is '23505'
      if (
        error.name === "SequelizeUniqueConstraintError" ||
        (error.original && error.original.code === "23505")
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Username already exists. Please choose a different one.",
          });
      }
      res
        .status(500)
        .json({
          success: false,
          message: "Server error",
          error: error.message,
        });
    }
  });
});

module.exports = router;
