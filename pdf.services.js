const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs/promises");
const path = require("path");

// Helper function to create the 'grn' directory if it doesn't exist
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

async function generateGrnPdf(grnData) {
  try {
    // Load the existing PDF template
    const templatePath = path.resolve(
      __dirname,
      "./grn",
      "Grafton Template copy.pdf"
    );
    const templateBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);

    // Get the first page of the template
    const page = pdfDoc.getPages()[0];

    // Load fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Define colors
    const black = rgb(0, 0, 0);

    // Helper to draw text with default settings
    const drawText = (text, options) => {
      page.drawText(text, {
        font: helvetica,
        size: 10,
        color: black,
        ...options,
      });
    };

    // == INFO SECTION ==
    drawText(grnData.ourReference || "", { x: 45, y: 723 });
    drawText(grnData.grnNo || "", { x: 320, y: 723 });
    drawText(grnData.releaseDate || "", { x: 320, y: 695 });
    drawText(grnData.warehouse || "", { x: 320, y: 668 });

    // == MODE & COLLECTION ==
    // The checkmark for Export is already in the template.
    // If it needed to be dynamic, you would use ZapfDingbats here.
    const containerSealText =
      grnData.containerNo && grnData.sealNo
        ? `${grnData.containerNo} / ${grnData.sealNo}`
        : "NA";
    drawText(containerSealText, { x: 355, y: 610, size: 9 });
    drawText(grnData.transportVendor || "NA", { x: 175, y: 585, size: 9 });

    // == CARGO DETAILS ==
    drawText(grnData.cargoDetails.commodity, { x: 95, y: 544, size: 9 });
    drawText(grnData.cargoDetails.shape, { x: 250, y: 544, size: 9 });
    drawText(grnData.cargoDetails.brand, { x: 400, y: 544, size: 9 });

    // == DYNAMIC TABLE ROWS ==
    let currentY = 505;
    const rowHeight = 20;
    let totalBundles = 0;
    grnData.lots.forEach((lot) => {
      drawText(lot.lotNo || "", { x: 45, y: currentY, size: 9 });
      drawText("Bundles", { x: 200, y: currentY, size: 9 });
      drawText((lot.bundles || 0).toString(), { x: 265, y: currentY, size: 9 });
      drawText(lot.grossWeightMt || "0.00", { x: 325, y: currentY, size: 9 });
      drawText(lot.netWeightMt || "0.00", { x: 415, y: currentY, size: 9 });

      totalBundles += lot.bundles || 0;
      currentY -= rowHeight;
    });

    // --- Table Total ---
    drawText(totalBundles.toString(), {
      x: 265,
      y: 341,
      font: helveticaBold,
      size: 10,
    });

    // == ACKNOWLEDGEMENT SECTIONS ==
    // --- Driver Details ---
    drawText(grnData.driverName || "", { x: 45, y: 247, font: helveticaBold });
    drawText(grnData.driverIdentityNo || "", {
      x: 185,
      y: 247,
      font: helveticaBold,
    });
    drawText(grnData.truckPlateNo || "", {
      x: 325,
      y: 247,
      font: helveticaBold,
    });
    if (grnData.driverSignature) {
      const driverSigImg = await pdfDoc.embedPng(
        Buffer.from(grnData.driverSignature, "base64")
      );
      page.drawImage(driverSigImg, { x: 465, y: 240, width: 90, height: 25 });
    }

    // --- Operator Details ---
    drawText(grnData.warehouseStaff || "", {
      x: 45,
      y: 177,
      font: helveticaBold,
    });
    if (grnData.warehouseStaffSignature) {
      const staffSigImg = await pdfDoc.embedPng(
        Buffer.from(grnData.warehouseStaffSignature, "base64")
      );
      page.drawImage(staffSigImg, { x: 185, y: 170, width: 90, height: 25 });
    }

    drawText(grnData.warehouseSupervisor || "", {
      x: 325,
      y: 177,
      font: helveticaBold,
    });
    if (grnData.warehouseSupervisorSignature) {
      const superSigImg = await pdfDoc.embedPng(
        Buffer.from(grnData.warehouseSupervisorSignature, "base64")
      );
      page.drawImage(superSigImg, { x: 465, y: 170, width: 90, height: 25 });
    }

    const pdfBytes = await pdfDoc.save();

    // Save the file to the server
    const grnFolderPath = path.resolve(__dirname, "..", "grn");
    await ensureDirectoryExists(grnFolderPath);
    const safeGrnNo = grnData.grnNo.replace(/[\/\\?%*:|"<>]/g, "_");
    const outputPath = path.join(grnFolderPath, `${safeGrnNo}.pdf`);
    await fs.writeFile(outputPath, pdfBytes);
    console.log(`Successfully saved GRN to ${outputPath}`);

    return pdfBytes;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF document.");
  }
}

module.exports = { generateGrnPdf };
