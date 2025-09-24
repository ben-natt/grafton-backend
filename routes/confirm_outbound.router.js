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
 * GET /confirm-outbound/stuffing-photos/:scheduleOutboundId
 * Fetches existing stuffing photos for a given schedule.
 */
router.get(
  "/stuffing-photos/:scheduleOutboundId",
  outboundController.getStuffingPhotos
);

/*
 * POST /outbound/confirm
 * Confirms a list of lots for outbound, updating their status.
 * @body   { "itemsToConfirm": [{ "selectedInboundId": 1 }, { "selectedInboundId": 2 }], "scheduleOutboundId": 1 }
 */
router.post("/confirm", outboundController.confirmOutbound);

/*
 * POST /outbound/generate-grn-details
 * Generates the necessary details for a Goods Release Note (GRN).
 * @body { "scheduleOutboundId": 1, "selectedInboundIds": [1, 2, 3] }
 */
router.post("/generate-grn-details", outboundController.getGrnDetails);

/*
 * POST /outbound/create-grn-and-transactions
 * Creates a GRN and associated transactions based on the provided data.
 * @body { "scheduleOutboundId": 1, "selectedInboundIds": [1, 2, 3], ...other GRN data }
 * This endpoint processes the GRN and creates the necessary transactions in the system.
 */
router.post(
  "/create-grn-and-transactions",
  outboundController.createGrnAndTransactions
);

/*
 * GET /confirm-outbound/operators
 * Fetches warehouse staff (roleId 1) and supervisors (roleId 2) for dropdowns.
 */
// router.get("/operators", outboundController.getOperators);

router.get("/user-signature/:userId", outboundController.getUserSignature);
module.exports = router;
