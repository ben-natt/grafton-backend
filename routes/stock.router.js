const express = require("express");
const router = express.Router();
const stockModel = require("../models/stock.model");
const auth = require("../middleware/auth"); // Assuming auth.js is in a middleware folder
const stockController = require("../controllers/export_controller.js");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure this directory exists
    const uploadPath = "uploads/img/stuffing_photos/";
    require("fs").mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage });

router.get("/", async (req, res) => {
  try {
    const stocks = await stockModel.getAllStock();
    res.json(stocks);
  } catch (error) {
    console.error("Error fetching stock records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/inventory", async (req, res) => {
  try {
    // Pass query params to the model for pagination
    const inventory = await stockModel.getInventory(req.query);
    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/lots", async (req, res) => {
  try {
    const filters = req.query; // Pass all query params to the model
    const lots = await stockModel.getLotDetails(filters);
    res.json(lots);
  } catch (error) {
    console.error("Error fetching lots by metal and shape", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/filter-options", async (req, res) => {
  try {
    const options = await stockModel.getFilterOptions();

    res.json(options);
  } catch (error) {
    console.error("Error fetching filter options:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/lot-summary", async (req, res) => {
  try {
    // FIX: Change from req.body to req.query for GET request
    const { jobNo, lotNo } = req.query;
    if (!jobNo || !lotNo) {
      return res
        .status(400)
        .json({ error: "Missing jobNo or lotNo query parameters" });
    }

    const result = await stockModel.getLotSummary(jobNo, lotNo);

    // If no result found, return a 404
    if (!result) {
      return res.status(404).json({ error: "Lot not found" });
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching lot summary records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- NEW ROUTE for Scheduling Outbounds ---
router.post(
  "/schedule-outbound",
  auth,
  upload.array("stuffingPhotos", 10),
  async (req, res) => {
    try {
      // The request body will contain the form data and the list of selected lots
      const scheduleData = req.body;
      const userId = req.user.userId;
      const files = req.files; // <-- Get uploaded files here

      // Pass schedule data, user ID, and files to the model function
      const result = await stockModel.createScheduleOutbound(
        scheduleData,
        userId,
        files
      );

      return res.status(201).json({ jobNo: result.outboundJobNo });
    } catch (error) {
      console.error("Error in /schedule-outbound route:", error.message);
      // Clean up uploaded files if an error occurs during DB processing
      if (req.files) {
        req.files.forEach((file) => {
          require("fs").unlink(file.path, (err) => {
            if (err) console.error("Error deleting orphaned file:", err);
          });
        });
      }
      res.status(500).json({
        success: false,
        message: "Failed to create schedule.",
        error: error.message,
      });
    }
  }
);

router.put("/update/:inboundId", async (req, res) => {
  const inboundIdRaw = req.params.inboundId;
  console.log(`[Router] Received update request for ID: ${inboundIdRaw}`);

  // Safe User Extraction
  let userId = null;
  try {
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(" ")[1];
      const decoded = require("jsonwebtoken").decode(token);
      if (decoded) userId = decoded.userId;
    }
  } catch (e) {
    console.warn("Could not extract user from token for logging:", e.message);
  }

  const inboundId = inboundIdRaw.trim(); // Trim whitespace
  const updateData = req.body;

  if (!inboundId) {
    return res.status(400).json({ error: "Missing inboundId in URL" });
  }
  if (!updateData || Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No data to update" });
  }

  try {
    const updatedRecord = await stockModel.EditInformation(
      inboundId,
      updateData,
      userId
    );

    // If success is false, we return 404 (or 400 depending on preference)
    if (!updatedRecord || !updatedRecord.success) {
      console.warn(
        `[Router] Update failed for ${inboundId}: ${updatedRecord?.message}`
      );
      return res.status(404).json({
        error: updatedRecord?.message || "Record not found or nothing updated.",
      });
    }

    res.json({ success: true, data: updatedRecord });
  } catch (error) {
    console.error("[Router] Error updating record:", error);
    res
      .status(500)
      .json({ error: "Failed to update record", details: error.message });
  }
});

router.get("/lots-by-job/:jobNo/:brand/:shape", async (req, res) => {
  // Updated route to include brand and shape
  try {
    const { jobNo, brand, shape } = req.params;

    if (!jobNo || !brand) {
      return res
        .status(400)
        .json({ error: "Missing jobNo or brand parameter in URL" });
    }

    // Pass req.query to the model function for pagination
    const lots = await stockModel.getLotsByJobNo(
      jobNo,
      brand,
      shape,
      req.query
    );
    res.json(lots);
  } catch (error) {
    console.error("Error fetching lots by job number and brand:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/inventory1", async (req, res) => {
  try {
    const inventory = await stockModel.getInventory1();
    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/export", stockController.exportStocksToExcel);
router.get("/export/bundle-sheet", stockController.exportBundleSheetToExcel);
module.exports = router;
