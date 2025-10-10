const { last } = require('pdf-lib');
const stockModel = require('../models/stock.model');

/**
 * @description Fetches all stock data for the main report.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of stock items.
 */
async function getAllStocks() {
  const data = await stockModel.getAllLotsForExport();
  return data;
}

/**
 * @description Fetches and processes bundle sheet data for a specific lot.
 * @param {string} jobNo - The job number.
 * @param {string} lotNo - The lot number.
 * @returns {Promise<Object>} A promise that resolves to an object containing mainDetails and bundles list.
 */
async function getIndividualBundleSheetData(jobNo, lotNo) {
  // Fetch data dynamically from the model instead of using mock data
  const dbRows = await stockModel.getIndividualBundleSheet(jobNo, lotNo);

  if (!dbRows || dbRows.length === 0) {
    throw new Error('No data found for the specified job and lot number.');
  }

  // The main details are the same for every row, so we take them from the first row.
  const firstRow = dbRows[0];
  const mainDetails = {
    ourReference: firstRow.ourReference,
    commodity: firstRow.commodityName,
    blNo: '-', // Assuming this is static or needs to be added to the query
    shape: firstRow.shapeName,
    warehouse: firstRow.inboundWarehouseName,
    brand: firstRow.brandName,
    lotNoWarrantNo: firstRow.lotNoWarrantNo,
  };

  // The bundles list is created by mapping over all returned rows.
  const bundles = dbRows.map(row => ({
    bundleNo: row.bundleNo,
    containerNo: row.exWarehouseLot || 'N/A', // Using exWarehouseLot for containerNo as an example
    heatCastNo: row.heatCastNo,
    batchNo: row.batchNo,
    producerGW: row.producerGW,
    producerNW: row.producerNW,
    weighedGW: row.weighedGW,
    lastCol: 'A', 
  }));

  return { mainDetails, bundles };
}


module.exports = {
  getAllStocks,
  getIndividualBundleSheetData,
};