const express = require('express');
const router = express.Router();
const multer = require('multer');
const scheduleOutboundController = require('../controllers/schedule_outbound_controller');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') 
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + '-' + file.originalname); 
  }
});
const upload = multer({ storage: storage });
router.post('/upload-excel', upload.single('excelFile'), scheduleOutboundController.uploadExcel);
router.post('/schedule', scheduleOutboundController.createScheduleOutbound);

module.exports = router;
