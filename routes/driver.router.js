const express = require("express");
const router = express.Router();
const driverModel = require("../models/driver.model");
//const authenticate = require("../middleware/auth"); 
router.get("/allorders", async (req, res) => { 
    try {

        const allOrders = await driverModel.getAllOrders();
        res.status(200).json({
            success: true,
            data: allOrders
        });

    } catch (error) {
        console.error("Error in /driver/allorders route:", error);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error.",
            error: error.message 
        });
    }
});

module.exports = router;

