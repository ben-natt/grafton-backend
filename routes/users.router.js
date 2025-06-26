const express = require("express");
const usersModel = require("../models/users.model"); // Ensure this path is correct
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../nodemailler"); // Assuming your nodemailer setup is here
const otpStore = {};
const OTP_EXPIRATION_MINUTES = 10;
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const authenticate = require("../middleware/auth"); // Assuming you have an authentication middleware

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9); // Unique suffix to avoid filename collisions
    cb(null, "profile-" + uniqueSuffix + path.extname(file.originalname)); // Use original file extension
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/; // Allowed file types
    const mimetype = filetypes.test(file.mimetype); // Check MIME type -- MIME full form is "Multipurpose Internet Mail Extensions"
    // Check file extension
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      // If both MIME type and extension are valid
      return cb(null, true); // Accept the file
    }
    cb(new Error("Only image files are allowed!"));
  },
}).single("profileImage"); // 'profileImage' is the field name in the form data

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
    const emailSent = await sendEmail(email, otp);
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

router.post("/register", async (req, res) => {
  const { email, password } = req.body; // Email here is sent by frontend after OTP verification
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

    // Fetch the default role ID for "Warehouse Crew"
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
    // Check for unique constraint violation for email (though OTP flow should mitigate this for new users)
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
      { expiresIn: "1h" } // Token expires in 1 hour
    );

    console.log("Token: " + token); // Log before sending response
    res.status(200).json({
      message: "Login successful",
      token: token, // Send the JWT back to the client
      user: { id: user.userid, email: user.email, username: user.username },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

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

    //  Construct the full URL for the profile image
    const fullProfileImageUrl = user.profileimageurl
      ? `${req.protocol}://${req.get("host")}/${user.profileimageurl}` // Use req.protocol and req.get("host") is needed to construct the full URL
      : null;

    res.status(200).json({
      success: true,
      data: {
        username: user.username,
        email: user.email,
        roleid: user.roleid,
        rolename: user.rolename, // Include the role name
        profileimageurl: fullProfileImageUrl, // Send full URL here
      },
    });
  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Update user profile - now protected by `authenticate` middleware
router.put("/profile", authenticate, (req, res) => {
  upload(req, res, async (err) => {
    try {
      if (err) {
        return res.status(400).json({ message: err.message });
      }

      const userId = req.user.userId; // Correct casing: req.user.userId
      const updates = {};

      // Handle text fields
      if (req.body.username) updates.username = req.body.username;
      // If roleid is passed in the update, allow it to be updated (e.g., by an admin)
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

      // Handle file upload
      if (req.file) {
        const user = await usersModel.getUserById(userId);
        if (user.profileimageurl) {
          // Extract filename from the URL, not the full path
          const oldFilename = path.basename(user.profileimageurl);
          const oldImagePath = path.join(
            __dirname,
            "../../uploads", // Point to the uploads directory
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

        updates.profileimageurl = `uploads/${req.file.filename}`;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updates provided" }); // Ensure updates object is not empty
      }

      const updatedUser = await usersModel.updateUserProfile(userId, updates);
      // After updating, fetch the user again to get the updated role name
      const userWithUpdatedRole = await usersModel.getUserById(userId);

      // Construct the user profile object to return
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
        rolename: userWithUpdatedRole.rolename, // Include the updated role name
      };

      res.status(200).json(userProfile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });
});

module.exports = router;
