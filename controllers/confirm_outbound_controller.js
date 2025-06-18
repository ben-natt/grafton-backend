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

    const result = await outboundModel.confirmSelectedInbounds(
      selectedInboundIds
    );

    res
      .status(200)
      .json({ message: "Outbound confirmed successfully.", data: result });
  } catch (error) {
    console.error("Error in confirmOutbound controller:", error);
    res.status(500).json({ error: "Failed to confirm outbound." });
  }
};

module.exports = {
  getConfirmationDetails,
  confirmOutbound,
};
