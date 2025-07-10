const express = require("express");
const router = express.Router();
const grnController = require("../controllers/grn_controller");

// The base path for these routes will be defined in your main app file (e.g., /api/grn)

/**
 * Route: GET /
 * Description: Get a list of all Goods Release Notes.
 * Query Parameters:
 * - jobNo (string): Filter by job number.
 * - grnNo (string): Filter by GRN number.
 * - startDate (string: YYYY-MM-DD): Start of date range.
 * - endDate (string: YYYY-MM-DD): End of date range.
 * Example: /api/grn?jobNo=SINO001
 */
router.get("/", grnController.listGrns);

/**
 * Route: GET /filters
 * Description: Get distinct job numbers and GRN numbers for populating filter dropdowns.
 */
router.get("/filters", grnController.getGrnFilters);

/**
 * Route: GET /preview/:outboundId
 * Description: Get the PDF file for a specific GRN for previewing in the browser.
 */
router.get("/preview/:outboundId", grnController.previewGrnPdf);

module.exports = router;
