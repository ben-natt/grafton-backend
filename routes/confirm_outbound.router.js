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
 * @body   { "itemsToConfirm": [{ "selectedInboundId": 1 }, { "selectedInboundId": 2 }] }
 */
router.post("/confirm", outboundController.confirmOutbound);

/*
 * GET /outbound/generate-grn/:jobNo
 * Generates a Goods Receipt Note (GRN) for the specified job number.
 */
router.post("/generate-grn-details", outboundController.getGrnDetails);

/*
 * POST /outbound/create-grn-and-transactions
 * Creates a GRN and associated transactions based on the provided data.
 * @body { "jobNo": "JOB123", "selectedInboundIds": [1, 2, 3] }
 * This endpoint processes the GRN and creates the necessary transactions in the system.
 * It expects a job number and a list of selected inbound IDs to create the GRN and transactions.
 */
router.post(
  "/create-grn-and-transactions",
  outboundController.createGrnAndTransactions
);

// --- NEW ROUTE ---
/*
 * GET /confirm-outbound/operators
 * Fetches warehouse staff (roleId 1) and supervisors (roleId 2) for dropdowns.
 */
router.get("/operators", outboundController.getOperators);

module.exports = router;
