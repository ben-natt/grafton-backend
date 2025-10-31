const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync_controller");
const authMiddleware = require("../middleware/auth");

router.post("/", authMiddleware, syncController.handleSync);
console.log("Checking middleware and controller:");
console.log("authMiddleware:", authMiddleware);
console.log("syncController:", syncController);
module.exports = router;
