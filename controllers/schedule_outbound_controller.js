const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { sequelize, DataTypes } = require('../database');
const { ScheduleOutbound, SelectedInbounds, ScheduleInbound, Lot, Inbounds, Brand, Commodity, Shape } = require('../models/schedule_outbound.model')(sequelize, DataTypes);
const fs = require('fs');
const auth = require('../middleware/auth')

function excelDateToJSDate(excelDate) {
  if (excelDate === null || excelDate === undefined || excelDate === '') return null;

  let parsedDate;
  if (typeof excelDate === 'string') {
    parsedDate = new Date(excelDate);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }

  if (typeof excelDate === 'number' || (typeof excelDate === 'string' && !isNaN(parseFloat(excelDate)))) {
    const numValue = parseFloat(excelDate);
    if (numValue > 0) {
      const date = new Date(Date.UTC(1899, 11, 30));
      date.setDate(date.getDate() + numValue);
      return date;
    }
  }

  return null;
}

function toLocalYYYYMMDD(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalDate(d) {
  return d ? new Date(`${d}T00:00:00+08:00`) : null;
}


exports.uploadExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      header: 1
    });

    if (jsonData.length < 2) {
      return res.status(400).json({ message: 'Excel file is empty or missing data rows.' });
    }

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    console.log('Headers:', headers);
    const processedLots = [];
    let totalLotsFound = 0;

    for (const row of dataRows) {
      if (!row || row.length === 0 || row.every(cell => cell === null || cell === undefined || cell === '')) {
        continue;
      }

      const getCellValue = (headerName) => {
        const index = headers.indexOf(headerName);
        return index !== -1 && index < row.length ? row[index] : null;
      };

      const jobNoFromExcel = getCellValue('Job Number')?.toString().trim();
      const lotNoFromExcel = parseInt(getCellValue('Lot No'), 10);
      console.log(getCellValue('Release Date'), getCellValue('Export Date'), getCellValue('Stuffing Date'), getCellValue('Delivery Date'));

      if (!jobNoFromExcel || isNaN(lotNoFromExcel)) {
        console.warn('Skipping row due to missing or invalid Job Number or Lot No:', row);
        continue;
      }

      const masterInbound = await Inbounds.findOne({
        where: {
          jobNo: jobNoFromExcel,
          lotNo: lotNoFromExcel,
        },
        include: [
          { model: Brand, as: 'brandDetails', attributes: ['name'] },
          { model: Commodity, as: 'commodityDetails', attributes: ['name'] },
          { model: Shape, as: 'shapeDetails', attributes: ['name'] },
        ],
        raw: true,
        nest: true,
      });

      if (masterInbound) {
        const releaseDateExcel = excelDateToJSDate(getCellValue('Release Date'));
        const exportDateExcel = excelDateToJSDate(getCellValue('Export Date'));
        const stuffingDateExcel = excelDateToJSDate(getCellValue('Stuffing Date'));
        const deliveryDateExcel = excelDateToJSDate(getCellValue('Delivery Date'));
        console.log('Parsed Dates:', {
          releaseDateExcel,
          exportDateExcel,
          stuffingDateExcel,
          deliveryDateExcel
        });

        const lotDataForFrontend = {
          inboundId: masterInbound.inboundId,
          jobNo: masterInbound.jobNo,
          lotNo: masterInbound.lotNo,
          exWarehouseLot: masterInbound.exWarehouseLot,

          metal: masterInbound.commodityDetails?.name ?? null,
          brand: masterInbound.brandDetails?.name ?? null,
          shape: masterInbound.shapeDetails?.name ?? null,

          quantity: masterInbound.noOfBundle,
          weight: masterInbound.netWeight,

          releaseDate: toLocalYYYYMMDD(releaseDateExcel),
          storageReleaseLocation: getCellValue('Storage Release Location')?.toString().trim() ?? null,
          releaseWarehouse: getCellValue('Release To Warehouse')?.toString().trim() ?? null,
          transportVendor: getCellValue('Transport Vendor')?.toString().trim() ?? null,
          lotReleaseWeight:getCellValue('Lot Release Weight'),
          exportDate: toLocalYYYYMMDD(exportDateExcel),
          stuffingDate: toLocalYYYYMMDD(stuffingDateExcel),
          containerNo: getCellValue('Container No')?.toString().trim() ?? null,
          sealNo: getCellValue('Seal No')?.toString().trim() ?? null,
          deliveryDate: toLocalYYYYMMDD(deliveryDateExcel),
        };

        processedLots.push(lotDataForFrontend);
        totalLotsFound++;
        console.log('1',processedLots);
      } else {
        console.warn(`Inbound record with Job No: ${jobNoFromExcel} and Lot No: ${lotNoFromExcel} not found in inbounds table. Skipping.`);
      }
    }

    res.status(200).json({
      message: 'Excel data parsed and inbound records retrieved successfully. Ready for scheduling.',
      lotCount: totalLotsFound,
      data: processedLots,
    });

  } catch (error) {
    console.error('Error reading or parsing Excel file or querying database:', error);
    res.status(500).json({ message: 'Error processing Excel data.', error: error.message });
  } finally {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    }
  }
};


exports.createScheduleOutbound = async (req, res) => {
  const userId = req.user.userId;
  const {
    releaseDate,
    storageReleaseLocation,
    releaseWarehouse,
    lotReleaseWeight,
    transportVendor,
    exportDate,
    stuffingDate,
    containerNo,
    sealNo,
    deliveryDate,
    selectedLots
  } = req.body;

  const outboundType = (containerNo && containerNo.length > 0) ? 'container' : 'flatbed';
  console.log('outboundType:', outboundType);
  console.log('request body for createScheduleOutbound:', req.body);
  if (!releaseDate || releaseDate.trim() === '' ||
      !storageReleaseLocation || storageReleaseLocation.trim() === '' ||
      !releaseWarehouse || releaseWarehouse.trim() === '' ||
      lotReleaseWeight == null ||
      !transportVendor || transportVendor.trim() === '' ||
      !selectedLots || selectedLots.length === 0) {
    return res.status(400).json({ message: 'Missing required data for scheduling outbound. Ensure all required fields are provided.' });
  }

  const transaction = await sequelize.transaction();

  try {
    const newScheduleOutbound = await ScheduleOutbound.create({
      releaseDate: parseLocalDate(releaseDate),
      userId: userId,
      storageReleaseLocation,
      releaseWarehouse,
      lotReleaseWeight,
      transportVendor,
      outboundType: outboundType,
      exportDate: parseLocalDate(exportDate),
      stuffingDate: parseLocalDate(stuffingDate),
      containerNo,
      sealNo,
      deliveryDate: parseLocalDate(deliveryDate),
    }, { transaction });

    for (const lot of selectedLots) {
      const masterInboundRecord = await Inbounds.findOne({
        where: { jobNo: lot.jobNo, lotNo: lot.lotNo },
        attributes: ['inboundId'],
        transaction,
      });

      if (!masterInboundRecord) {
        throw new Error(`Inbound record with Job No: ${lot.jobNo} and Lot No: ${lot.lotNo} not found.`);
      }

      await SelectedInbounds.create({
        scheduleOutboundId: newScheduleOutbound.scheduleOutboundId,
        inboundId: masterInboundRecord.inboundId,
        lotNo: lot.lotNo,
        jobNo: lot.jobNo,
        isOutbounded: false,
      }, { transaction });
    }

    await transaction.commit();
    res.status(200).json({
      message: 'Outbound schedule and selected inbound lots created/updated successfully!',
      scheduleOutboundId: newScheduleOutbound.scheduleOutboundId
    });

  } catch (dbError) {
    await transaction.rollback();
    console.error('Database error during outbound scheduling:', dbError);
    res.status(500).json({ message: 'Error processing outbound scheduling data.', error: dbError.message });
  }
};
