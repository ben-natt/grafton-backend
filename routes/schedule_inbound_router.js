const express = require("express");
const router = express.Router();
const multer = require("multer");
const scheduleInboundController = require("../controllers/schedule_inbound_controller"); 
const auth = require("../middleware/auth");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/excel");
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + "-" + Date.now() + ".xlsx");
  },
});
const upload = multer({ storage: storage });

// Upload and Creation logic
router.post(
  "/upload-excel",
  upload.single("excelFile"),
  scheduleInboundController.uploadExcel
);
router.post("/create", auth, scheduleInboundController.createScheduleInbound);

// Validation / Dropdown Endpoints (Resolves 404 Errors)
router.get("/shapes", auth, scheduleInboundController.getShapes);
router.get("/ex-warehouse-locations", auth, scheduleInboundController.getExWarehouseLocations);
router.get("/ex-lme-warehouses", auth, scheduleInboundController.getExLmeWarehouses);
router.get("/inbound-warehouses", auth, scheduleInboundController.getInboundWarehouses);
router.get("/brands", auth, scheduleInboundController.getAllBrands);

// Add this line to expose the commodities endpoint:
router.get("/commodities", auth, scheduleInboundController.getCommodities);
// Logging Logic
router.get("/logs", auth, scheduleInboundController.getInboundLogs);
router.get("/logs/:filename", auth, scheduleInboundController.getInboundLogDetail);

module.exports = router;