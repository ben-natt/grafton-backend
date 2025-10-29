const express = require("express");
const router = express.Router();
const multer = require("multer");
const scheduleInboundController = require("../controllers/schedule_inbound_controller"); // Correct path to your controller
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

router.post(
  "/upload-excel",
  upload.single("excelFile"),
  scheduleInboundController.uploadExcel
);
router.post("/create", auth, scheduleInboundController.createScheduleInbound);

module.exports = router;
