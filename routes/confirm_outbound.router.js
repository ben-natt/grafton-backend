const express = require("express");
const router = express.Router();
const outboundController = require("../controllers/confirm_outbound_controller");

/*
 * GET /outbound/confirmation-details/:selectedInboundId
 * Get detailed information for the confirmation screen for a single lot.
 */
router.get(
  "/confirmation-details/:selectedInboundId",
  outboundController.getConfirmationDetails
);

/*
 * POST /outbound/confirm
 * Confirms a list of lots for outbound, updating their status.
 * @body    { "itemsToConfirm": [{ "selectedInboundId": 1 }, { "selectedInboundId": 2 }] }
 */
router.post("/confirm", outboundController.confirmOutbound);

/*
 * GET /outbound/generate-grn/:jobNo
 * Generates a Goods Receipt Note (GRN) for the specified job number.
 */
router.get("/generate-grn/:jobNo", outboundController.generateGrn);

module.exports = router;
