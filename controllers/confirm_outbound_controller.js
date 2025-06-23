const outboundModel = require("../models/confirm_outbound.model");

const getConfirmationDetails = async (req, res) => {
  try {
    const { selectedInboundId } = req.params;
    const details = await outboundModel.getConfirmationDetailsById(
      selectedInboundId
    );

    if (!details) {
      return res.status(404).json({ error: "Confirmation details not found." });
    }

    const totalLotsInJob = await outboundModel.countTotalLotsInJob(
      details.jobNo
    );
    details.totalLotsToRelease = totalLotsInJob;

    res.status(200).json(details);
  } catch (error) {
    console.error("Error in getConfirmationDetails controller:", error);
    res.status(500).json({ error: "Failed to fetch confirmation details." });
  }
};

const confirmOutbound = async (req, res) => {
  try {
    const { itemsToConfirm } = req.body;
    if (
      !itemsToConfirm ||
      !Array.isArray(itemsToConfirm) ||
      itemsToConfirm.length === 0
    ) {
      return res.status(400).json({ error: "No items to confirm." });
    }
    const selectedInboundIds = itemsToConfirm.map(
      (item) => item.selectedInboundId
    );
    if (selectedInboundIds.includes(undefined)) {
      return res.status(400).json({
        error: "One or more items are missing the selectedInboundId.",
      });
    }

    const processedIds = await outboundModel.confirmSelectedInbounds(
      selectedInboundIds
    );

    res.status(200).json({
      message: "Outbound confirmed successfully.",
      data: {
        confirmedIds: processedIds,
        jobNo: itemsToConfirm[0]?.jobNo, // Pass jobNo back for convenience
      },
    });
  } catch (error) {
    console.error("Error in confirmOutbound controller:", error);
    res.status(500).json({ error: "Failed to confirm outbound." });
  }
};

const getGrnDetails = async (req, res) => {
  try {
    const { jobNo, selectedInboundIds } = req.body;
    if (
      !jobNo ||
      !selectedInboundIds ||
      !Array.isArray(selectedInboundIds) ||
      selectedInboundIds.length === 0
    ) {
      return res.status(400).json({
        error: "A jobNo and a list of selectedInboundIds are required.",
      });
    }
    const grnDetails = await outboundModel.getGrnDetailsForSelection(
      jobNo,
      selectedInboundIds
    );
    if (!grnDetails) {
      return res
        .status(404)
        .json({ error: "GRN details not found for the given selection." });
    }
    res.status(200).json(grnDetails);
  } catch (error) {
    console.error("Error in getGrnDetails controller:", error);
    res.status(500).json({ error: "Failed to generate GRN." });
  }
};

const createGrnAndTransactions = async (req, res) => {
  try {
    const grnData = req.body;

    // This check can be uncommented if you need to prevent duplicate GRNs
    // const existingGrn = await outboundModel.getOutboundByJobIdentifier(
    //   grnData.jobIdentifier
    // );
    // if (existingGrn) {
    //   return res.status(409).json({
    //     error: `A Goods Release Note (GRN) has already been generated for job ${grnData.jobIdentifier}.`,
    //   });
    // }

    const result = await outboundModel.createGrnAndTransactions(grnData);
    res.status(201).json({
      message: "GRN processed and transactions created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error in createGrnAndTransactions controller:", error);
    const errorName = error.name || "ServerError";
    res.status(500).json({
      error: "Failed to create outbound transactions.",
      details: errorName,
    });
  }
};

// --- NEW CONTROLLER FUNCTION ---
const getOperators = async (req, res) => {
  try {
    const users = await outboundModel.getOperators();
    // Separate users by roleId
    const staff = users.filter((user) => user.roleId === 1);
    const supervisors = users.filter((user) => user.roleId === 2);
    res.status(200).json({ staff, supervisors });
  } catch (error) {
    console.error("Error in getOperators controller:", error);
    res.status(500).json({ error: "Failed to fetch operators." });
  }
};

module.exports = {
  getConfirmationDetails,
  confirmOutbound,
  getGrnDetails,
  createGrnAndTransactions,
  getOperators, // Export the new function
};
