const express = require('express');
const router = express.Router();
const multer = require('multer');
const scheduleInboundController = require('../controllers/schedule_inbound_controller'); // Correct path to your controller

// Configure Multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Make sure 'uploads/' directory exists
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + '.xlsx')
  }
});
const upload = multer({ storage: storage });

// Route to upload and process Excel file (returns data and lot count, does NOT save to DB)
router.post('/upload-excel', upload.single('excelFile'), scheduleInboundController.uploadExcel);

// Route to create/update records in the database (triggered by "SCHEDULE NOW" button)
router.post('/create', scheduleInboundController.createScheduleInbound);

module.exports = router;