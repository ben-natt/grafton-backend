const stockModel = require('../models/stock.model');

/**
 * @description Fetches all stock data.
 * In a real application, this would query your database.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of stock items.
 */
async function getAllStocks() {
  // 2. Call the new model function and pass the filters
  const data = await stockModel.getAllLotsForExport();
  return data;
}
module.exports = {
  getAllStocks,
};