const grnModel = require("../models/grn.model");
const path = require("path");
const fs = require("fs");

/**
 * Controller for handling GRN-related HTTP requests.
 */
const grnController = {
  /**
   * Handles the request to list all GRNs, passing filters to the model.
   * @param {object} req - The Express request object.
   * @param {object} res - The Express response object.
   */
  async listGrns(req, res) {
    console.log("CONTROLLER: Entering listGrns with query:", req.query);
    try {
      // Pass the entire query object to the model, which will pick the relevant filters.
      const grns = await grnModel.getAllGrns(req.query);
      res.status(200).json(grns);
    } catch (error) {
      console.error("CONTROLLER ERROR in listGrns:", error);
      res.status(500).json({ error: "Failed to fetch Goods Release Notes." });
    }
  },

  /**
   * Handles the request to preview or download a specific GRN PDF.
   * It retrieves the file path from the database and sends the file.
   * @param {object} req - The Express request object.
   * @param {object} res - The Express response object.
   */
  async previewGrnPdf(req, res) {
    console.log("CONTROLLER: Entering previewGrnPdf");
    try {
      const { outboundId } = req.params;
      const result = await grnModel.getGrnPdfPath(outboundId);

      if (!result || !result.grnImage) {
        return res
          .status(404)
          .json({ error: "PDF record not found for this GRN." });
      }

      // Construct the absolute path to the PDF file
      const pdfPath = path.join(__dirname, "..", result.grnImage);

      // Check if the file actually exists on the server's file system
      if (fs.existsSync(pdfPath)) {
        // Set headers to display the PDF inline in the browser
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${path.basename(pdfPath)}"`
        );
        res.sendFile(pdfPath);
      } else {
        console.error(`CONTROLLER ERROR: File not found at path: ${pdfPath}`);
        res
          .status(404)
          .json({ error: "PDF file does not exist on the server." });
      }
    } catch (error) {
      console.error("CONTROLLER ERROR in previewGrnPdf:", error);
      res.status(500).json({ error: "Failed to retrieve PDF." });
    }
  },

  /**
   * Handles the request to fetch options for the filter dropdowns.
   * @param {object} req - The Express request object.
   * @param {object} res - The Express response object.
   */
  async getGrnFilters(req, res) {
    console.log("CONTROLLER: Entering getGrnFilters");
    try {
      const filters = await grnModel.getFilterOptions();
      res.status(200).json(filters);
    } catch (error) {
      console.error("CONTROLLER ERROR in getGrnFilters:", error);
      res.status(500).json({ error: "Failed to fetch filter options." });
    }
  },
};

module.exports = grnController;
