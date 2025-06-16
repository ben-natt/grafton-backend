const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    const token = req.headers.authorization.split(" ")[1]; // Expects 'Bearer TOKEN'
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    // Check if the token contains the expected userId
    req.user = { userId: decodedToken.userid };
    // This makes req.user.userId available

    next(); // Pass control to the next middleware/route handler
  } catch (error) {
    console.error("Authentication failed:", error);
    res
      .status(401)
      .json({ message: "Authentication failed: Invalid or expired token." });
  }
};
