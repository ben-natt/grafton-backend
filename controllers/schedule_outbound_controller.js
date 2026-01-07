const XLSX = require("xlsx");
const { v4: uuidv4 } = require("uuid");
const { sequelize, DataTypes } = require("../database");
const { Op, fn, col, where } = require("sequelize");
const fs = require("fs");
const path = require("path");
const usersModel = require("../models/users.model");

const {
  ScheduleOutbound,
  SelectedInbounds,
  StuffingPhotos,
  Inbounds,
  Brand,
  Commodity,
  Shape,
} = require("../models/schedule_outbound.model")(sequelize, DataTypes);

// --- SETUP LOGGING DIRECTORY ---
const LOGS_DIR = path.join(__dirname, "../logs/Scheduled Outbounds");

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function excelDateToJSDate(excelDate) {
  if (excelDate === null || excelDate === undefined || excelDate === "")
    return null;

  let parsedDate;

  // Handle string dates first
  if (typeof excelDate === "string") {
    const shortDateParts = excelDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (shortDateParts) {
      const month = parseInt(shortDateParts[1], 10) - 1;
      const day = parseInt(shortDateParts[2], 10);
      let year = parseInt(shortDateParts[3], 10);

      year += year < 70 ? 2000 : 1900;

      parsedDate = new Date(year, month, day);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }

    // Fallback for other string formats like YYYY-MM-DD
    parsedDate = new Date(excelDate);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }

  // Handle numeric Excel dates
  if (typeof excelDate === "number") {
    const date = new Date(Date.UTC(1899, 11, 30));
    date.setUTCDate(date.getUTCDate() + excelDate);
    return date;
  }

  return null; // Return null if parsing fails
}

function toLocalYYYYMMDD(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDate(d) {
  return d ? new Date(`${d}T00:00:00+08:00`) : null;
}

exports.uploadExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      header: 1,
    });

    if (jsonData.length < 2) {
      return res
        .status(400)
        .json({ message: "Excel file is empty or missing data rows." });
    }

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    const processedLots = [];
    let totalLotsFound = 0;
    let alreadyScheduledCount = 0;
    let notFoundCount = 0;

    for (const row of dataRows) {
      if (
        !row ||
        row.length === 0 ||
        row.every((cell) => cell === null || cell === undefined || cell === "")
      ) {
        continue;
      }

      const getCellValue = (headerName) => {
        const index = headers.indexOf(headerName);
        return index !== -1 && index < row.length ? row[index] : null;
      };

      const jobNoFromExcel = getCellValue("Job Number")?.toString().trim();
      const lotNoValue = getCellValue("Lot No");
      const lotNoFromExcel = lotNoValue
        ? parseInt(String(lotNoValue).trim(), 10)
        : NaN;

      if (!jobNoFromExcel || isNaN(lotNoFromExcel)) {
        console.warn(
          "Skipping row due to missing or invalid Job Number or Lot No:",
          row
        );
        continue;
      }

      const normalizedJobNo = jobNoFromExcel.replace(/-/g, "");

      const masterInbound = await Inbounds.findOne({
        where: {
          [Op.and]: [
            where(fn("REPLACE", col("jobNo"), "-", ""), normalizedJobNo),
            { lotNo: lotNoFromExcel },
          ],
        },
        include: [
          { model: Brand, as: "brandDetails", attributes: ["name"] },
          { model: Commodity, as: "commodityDetails", attributes: ["name"] },
          { model: Shape, as: "shapeDetails", attributes: ["name"] },
        ],
        raw: true,
        nest: true,
      });

      if (masterInbound) {
        const existingSchedule = await SelectedInbounds.findOne({
          where: { inboundId: masterInbound.inboundId },
        });

        if (existingSchedule) {
          console.warn(
            `Lot with inboundId: ${masterInbound.inboundId} is already scheduled. Skipping.`
          );
          alreadyScheduledCount++;
          continue;
        }

        let releaseDateExcel = excelDateToJSDate(getCellValue("Release Date"));
        let releaseEndDateExcel = excelDateToJSDate(
          getCellValue("Release End Date")
        );
        const exportDateExcel = excelDateToJSDate(getCellValue("Export Date"));
        const stuffingDateExcel = excelDateToJSDate(
          getCellValue("Stuffing Date")
        );
        const deliveryDateExcel = excelDateToJSDate(
          getCellValue("Delivery Date")
        );

        let wasCorrected = false;

        if (releaseDateExcel && releaseEndDateExcel) {
          if (releaseDateExcel > releaseEndDateExcel) {
            console.warn(
              `⚠️ Detected swapped release dates for Job ${jobNoFromExcel}, Lot ${lotNoFromExcel}. Auto-correcting.`
            );
            const temp = releaseDateExcel;
            releaseDateExcel = releaseEndDateExcel;
            releaseEndDateExcel = temp;
            wasCorrected = true;
          }
        } else if (!releaseDateExcel && releaseEndDateExcel) {
          console.warn(
            `⚠️ Missing Release Date but found Release End Date for Job ${jobNoFromExcel}, Lot ${lotNoFromExcel}. Assuming it's the Release Date.`
          );
          releaseDateExcel = releaseEndDateExcel;
          releaseEndDateExcel = null;
          wasCorrected = true;
        }

        const lotNoToUse = masterInbound.crewLotNo
          ? masterInbound.crewLotNo
          : masterInbound.lotNo;

        const weightToUse = masterInbound.isWeighted
          ? masterInbound.actualWeight
          : masterInbound.netWeight;

        const lotDataForFrontend = {
          inboundId: masterInbound.inboundId,
          jobNo: masterInbound.jobNo,
          lotNo: lotNoToUse,
          exWarehouseLot: masterInbound.exWarehouseLot,
          metal: masterInbound.commodityDetails?.name ?? null,
          brand: masterInbound.brandDetails?.name ?? null,
          shape: masterInbound.shapeDetails?.name ?? null,
          quantity: masterInbound.noOfBundle,
          weight: weightToUse,
          releaseDate: toLocalYYYYMMDD(releaseDateExcel),
          releaseEndDate: releaseEndDateExcel
            ? toLocalYYYYMMDD(releaseEndDateExcel)
            : null,
          storageReleaseLocation:
            getCellValue("Storage Release Location")?.toString().trim() ?? null,
          releaseWarehouse:
            getCellValue("Release To Warehouse")?.toString().trim() ?? null,
          transportVendor:
            getCellValue("Transport Vendor")?.toString().trim() ?? null,
          lotReleaseWeight: weightToUse,
          exportDate: toLocalYYYYMMDD(exportDateExcel),
          stuffingDate: toLocalYYYYMMDD(stuffingDateExcel),
          containerNo: getCellValue("Container No")?.toString().trim() ?? null,
          sealNo: getCellValue("Seal No")?.toString().trim() ?? null,
          uom: getCellValue("UOM")?.toString().trim() ?? null,
          tareWeight: getCellValue("Tare Weight")?.toString().trim() ?? null,
          deliveryDate: toLocalYYYYMMDD(deliveryDateExcel),
        };

        if (wasCorrected) {
          lotDataForFrontend.autoCorrected = true;
        }

        processedLots.push(lotDataForFrontend);
        totalLotsFound++;
      } else {
        console.warn(
          `Inbound record with Job No: ${jobNoFromExcel} and Lot No: ${lotNoFromExcel} not found in inbounds table. Skipping.`
        );
        notFoundCount++;
      }
    }

    let message = `Processed Excel file. Found ${totalLotsFound} available lot(s) for scheduling.`;
    if (alreadyScheduledCount > 0) {
      message += ` Skipped ${alreadyScheduledCount} lot(s) that are already scheduled.`;
    }
    if (notFoundCount > 0) {
      message += ` ${notFoundCount} lot(s) were not found in inventory.`;
    }

    res.status(200).json({
      message,
      lotCount: totalLotsFound,
      data: processedLots,
    });
  } catch (error) {
    console.error(
      "Error reading or parsing Excel file or querying database:",
      error
    );
    res
      .status(500)
      .json({ message: "Error processing Excel data.", error: error.message });
  } finally {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting temp file:", err);
      });
    }
  }
};
