const grnModel = require("../models/grn.model");
const path = require("path");
const fs = require("fs");

const grnController = {
  async listGrns(req, res) {
    console.log("CONTROLLER: Entering listGrns with query:", req.query);
    try {
      // Pass all query params to the model, which now handles pagination, sorting, and filtering
      const { totalCount, data } = await grnModel.getAllGrns(req.query);
      res.status(200).json({
        data,
        page: parseInt(req.query.page) || 1,
        pageSize: parseInt(req.query.pageSize) || 25,
        totalCount,
        totalPages: Math.ceil(
          totalCount / (parseInt(req.query.pageSize) || 25)
        ),
      });
    } catch (error) {
      console.error("CONTROLLER ERROR in listGrns:", error);
      res.status(500).json({ error: "Failed to fetch Goods Release Notes." });
    }
  },

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

      const pdfPath = path.join(__dirname, "..", result.grnImage);

      if (fs.existsSync(pdfPath)) {
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

  async previewGrnImage(req, res) {
    console.log("CONTROLLER: Entering previewGrnImage");
    try {
      const { outboundId } = req.params;
      const result = await grnModel.getGrnPreviewImagePath(outboundId);

      if (!result || !result.grnPreviewImage) {
        return res
          .status(404)
          .json({ error: "Preview image record not found for this GRN." });
      }

      const imagePath = path.join(__dirname, "..", result.grnPreviewImage);

      if (fs.existsSync(imagePath)) {
        res.setHeader("Content-Type", "image/png"); // Assuming PNG format
        res.sendFile(imagePath);
      } else {
        console.error(
          `CONTROLLER ERROR: Image file not found at path: ${imagePath}`
        );
        res
          .status(404)
          .json({ error: "Preview image file does not exist on the server." });
      }
    } catch (error) {
      console.error("CONTROLLER ERROR in previewGrnImage:", error);
      res.status(500).json({ error: "Failed to retrieve preview image." });
    }
  },

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
