const express = require("express");
const router = express.Router();
const grnController = require("../controllers/grn_controller");

// This route now implicitly handles pagination, filtering, and sorting via query parameters
router.get("/", grnController.listGrns);

router.get("/filters", grnController.getGrnFilters);
router.get("/preview/:outboundId", grnController.previewGrnPdf);

// This route serves the generated preview image.
router.get("/preview-image/:outboundId", grnController.previewGrnImage);

module.exports = router;
