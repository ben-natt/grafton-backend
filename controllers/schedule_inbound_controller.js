const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { sequelize, DataTypes } = require('../database');
const { ScheduleInbound, Lot } = require('../models/schedule_inbound.model')(sequelize, DataTypes);
const fs = require('fs');

function excelDateToJSDate(excelDate) {
  const date = new Date(Date.UTC(1899, 11, 30));
  date.setDate(date.getDate() + excelDate);
  return date;
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
      dateNF: 'yyyy-mm-dd',
      header: 1
    });

    if (jsonData.length < 2) {
      return res.status(400).json({ message: 'Excel file is empty or missing data rows.' });
    }

    const headers = jsonData[0]; // First row is the header
    console.log('Headers:', headers); // Debugging header output
    const dataRows = jsonData.slice(1); // Exclude the header row

    const jobNoIndex = headers.indexOf('Job No');
    const lotNoIndex = headers.indexOf('Lot No');
    const nwIndex = headers.indexOf('NW');
    const gwIndex = headers.indexOf('GW');
    const actualWeightIndex = headers.indexOf('Actual Weight');
    const exLotIndex = headers.indexOf('Ex-Whse Lot');
    const exWarrantIndex = headers.indexOf('Ex-Whse Warrant');
    const bdleIndex = headers.indexOf('Bdle');
    const brandIndex = headers.indexOf('Brand');
    const metalIndex = headers.indexOf('Metal');
    const shapeIndex = headers.indexOf('Shape');
    const exLocIndex = headers.indexOf('Ex-Whse Location');
    const exLMEIndex = headers.indexOf('Ex LME Warehouse');
    const inWarehouseIndex = headers.indexOf('Inbound Warehouse');

    
    if (jobNoIndex === -1) {
      return res.status(400).json({ message: 'Missing "Job No" column in Excel file.' });
    }

    const jobDataMap = new Map();
    let totalLotsProcessed = 0;

    for (const row of dataRows) {
       if (!row || row.length === 0 || row.every(cell => cell === null || cell === undefined || cell === '')) {
    continue;
  }


  const jobNo = row[jobNoIndex]?.toString().trim() || null;
  

  if (!jobNo) {
    console.warn('Row skipped due to missing Job No:', row);
    continue;
  }
  console.log('Job No:', jobNo);
  const inboundDateExcel = req.body.inboundDate;

  if (!jobDataMap.has(jobNo)) {
        let parsedInboundDate = null;
        if (typeof inboundDateExcel === 'number') {
          parsedInboundDate = excelDateToJSDate(inboundDateExcel);
        } else if (typeof inboundDateExcel === 'string') {
          try {
            parsedInboundDate = new Date(inboundDateExcel);
            if (isNaN(parsedInboundDate.getTime())) {
              parsedInboundDate = null;
            }
          } catch (e) {
            parsedInboundDate = null;
          }
        }
        jobDataMap.set(jobNo, { inboundDate: parsedInboundDate?.toISOString(), lots: [] });
      }

      const lotNoValue = parseInt(row[lotNoIndex], 10);
      if (isNaN(lotNoValue)) {
        console.warn(`Row skipped for Job No ${jobNo} due to invalid Lot No:`, row[lotNoIndex]);
        continue;
      }

      const lotData = {
        jobNo: jobNo,
        lotNo: lotNoValue,
        netWeight: parseFloat(row[nwIndex]) || null,
        grossWeight: parseFloat(row[gwIndex]) || null,
        actualWeight: parseFloat(row[actualWeightIndex]) || null,
        exWarehouseLot: row[exLotIndex]?.toString().trim() || null,
        exWarehouseWarrant: row[exWarrantIndex]?.toString().trim() || null,
        expectedBundleCount: parseInt(row[bdleIndex], 10) || null,
        brand: row[brandIndex]?.toString().trim() || null,
        commodity: row[metalIndex]?.toString().trim() || null,
        shape: row[shapeIndex]?.toString().trim() || null,
        exWarehouseLocation: row[exLocIndex]?.toString().trim() || null,
        exLmeWarehouse: row[exLMEIndex]?.toString().trim() || null,
        inboundWarehouse: row[inWarehouseIndex]?.toString().trim() || null,
        status: 'Pending',
      };

      jobDataMap.get(jobNo).lots.push(lotData);
      totalLotsProcessed++;
    }

    const responseData = {};
    jobDataMap.forEach((value, key) => {
      responseData[key] = value;
    });

    res.status(200).json({
      message: 'Excel data parsed successfully. Ready for scheduling.',
      lotCount: totalLotsProcessed,
      data: responseData,
    });

  } catch (error) {
    console.error('Error reading or parsing Excel file:', error);
    res.status(500).json({ message: 'Error reading or parsing Excel file.', error: error.message });
  } finally {
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });
  }
};

exports.createScheduleInbound = async (req, res) => {
  const userId = 7; //Grace
  const { inboundDate, jobDataMap } = req.body;

  if (!jobDataMap || Object.keys(jobDataMap).length === 0) {
    return res.status(400).json({ message: 'No lot data provided for scheduling.' });
  }

  if (!inboundDate) {
    return res.status(400).json({ message: 'Inbound Date is required for scheduling.' });
  }

  const transaction = await sequelize.transaction();

  try {
    for (const jobNo in jobDataMap) {
      const { lots } = jobDataMap[jobNo];

      // Create or update ScheduleInbound and retrieve its ID
      const [scheduleInbound] = await ScheduleInbound.upsert({
        jobNo: jobNo,
        inboundDate: new Date(inboundDate),
        userId: userId,
      }, {
        transaction: transaction,
        returning: true, // This ensures the updated/created record is returned
      });

      const scheduleInboundId = scheduleInbound.scheduleInboundId;

      // Upsert each lot, setting scheduleInboundId
      for (const lot of lots) {
        await Lot.upsert({
          ...lot,
          scheduleInboundId: scheduleInboundId, 
        }, {
          transaction: transaction,
        });
      }
    }

    await transaction.commit();
    res.status(200).json({ message: 'Inbound schedule and lots created/updated successfully!' });
    console.log('Inbound schedule and lots created/updated successfully!');
  } catch (dbError) {
    await transaction.rollback();
    console.error('Database error during scheduling:', dbError);
    res.status(500).json({
      message: 'Job No and Lot No must be unique per schedule inbound.',
      error: dbError.message,
    });
  }
};
