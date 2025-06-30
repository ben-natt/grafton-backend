const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");

async function generateGrnPdf(data) {
  try {
    const templatePath = path.join(__dirname, "./grn/GRN Template.pdf");
    const pdfTemplateBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(pdfTemplateBytes);
    const page = pdfDoc.getPages()[0];

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 8;
    const textColor = rgb(0, 0, 0);

    const drawText = (text, x, y, customFont = font, size = fontSize) => {
      page.drawText(String(text || "-"), {
        x,
        y,
        font: customFont,
        size,
        color: textColor,
      });
    };

    // --- Header Info ---
    drawText(data.ourReference, 105, 755, boldFont, 10);
    drawText(data.grnNo, 470, 755, boldFont, 10);
    drawText(data.releaseDate, 470, 730, boldFont, 10);
    drawText(data.warehouse, 470, 705, boldFont, 10);

    // --- Cargo Details ---
    drawText(data.cargoDetails.commodity, 105, 627, boldFont);
    drawText(data.cargoDetails.shape, 105, 607, boldFont);
    drawText(data.cargoDetails.brand, 105, 587, boldFont);

    // --- Table Data ---
    let startY = 525;
    let totalBundles = 0;
    for (const lot of data.lots) {
      drawText(lot.lotNo, 60, startY);
      drawText(lot.bundles, 290, startY);
      drawText(lot.grossWeightMt, 365, startY);
      drawText(lot.netWeightMt, 470, startY);
      totalBundles += Number(lot.bundles || 0);
      startY -= 15;
    }

    // --- Table Total ---
    drawText("Total", 60, 310, boldFont);
    drawText(totalBundles.toString(), 290, 310, boldFont);

    // --- Acknowledgement Details ---
    drawText(data.driverName, 120, 260, boldFont);
    drawText(data.driverIdentityNo, 120, 240, boldFont);
    drawText(data.truckPlateNo, 430, 260, boldFont);

    drawText(data.warehouseStaff, 120, 182, boldFont);
    drawText(data.warehouseSupervisor, 120, 142, boldFont);

    // --- Signature Images ---
    const embedSignature = async (base64, x, y, width, height) => {
      if (!base64 || typeof base64 !== "string" || base64.trim() === "") return;
      try {
        const pngImage = await pdfDoc.embedPng(Buffer.from(base64, "base64"));
        page.drawImage(pngImage, { x, y, width, height });
      } catch (e) {
        console.error("Failed to embed signature:", e);
      }
    };

    await embedSignature(data.driverSignature, 420, 220, 120, 40);
    await embedSignature(data.warehouseStaffSignature, 420, 162, 120, 40);
    await embedSignature(data.warehouseSupervisorSignature, 420, 122, 120, 40);

    const pdfBytes = await pdfDoc.save();

    // Save the PDF to the backend in a 'grn' folder
    const grnDir = path.join(__dirname, "./grn");
    await fs.mkdir(grnDir, { recursive: true });
    const safeGrnNo = data.grnNo.replace(/[\/\\?%*:|"<>]/g, "_");
    const outputPath = path.join(grnDir, `GRN_${safeGrnNo}.pdf`);
    await fs.writeFile(outputPath, pdfBytes);

    return pdfBytes;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}

module.exports = { generateGrnPdf };
