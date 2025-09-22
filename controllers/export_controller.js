const excel = require('exceljs');
const stockService = require('../services/report.service');

async function exportStocksToExcel(req, res) {
  try {
    const stocks = await stockService.getAllStocks(req.query);
    if (stocks.length > 0 && stocks[0].ReleaseDate) {
      console.log('Clean data received from database for ReleaseDate:', stocks[0].ReleaseDate);
    }

    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet('Stock Report');

    // Define all columns for the worksheet
    worksheet.columns = [
      { header: 'S/No', key: 'sno', width: 10 },
      { header: 'Warehouse', key: 'InboundWarehouse', width: 30 },
      { header: 'Grafton Ref', key: 'JobNo', width: 20 },
      { header: 'Product', key: 'Metal', width: 20 },
      { header: 'Brand', key: 'Brand', width: 25 },
      { header: 'Ex-Warrant Number', key: 'ExWarehouseLot', width: 25 },
      { header: 'GWS Lot No.', key: 'gwsLotNo', width: 20 },
      { header: 'Shape', key: 'Shape', width: 15 },
      { header: 'Bundles', key: 'Bundles', width: 10 },
      { header: 'NW (MT)', key: 'NetWeight', width: 15, style: { numFmt: '#,##0.000' } },
      { header: 'GW (MT)', key: 'GrossWeight', width: 15, style: { numFmt: '#,##0.000' } },
      { header: 'Sub-total of each Job', width: 20 }, // header only, no key
      { header: 'Cargo Out Date', key: 'ReleaseDate', width: 20 },
      { header: 'Action', width: 15 } // new column, no key
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 40;

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    // Find Action column and style it red
    const actionColIndex = worksheet.columns.findIndex(col => col.header === 'Action') + 1;
    if (actionColIndex > 0) {
      const actionHeaderCell = headerRow.getCell(actionColIndex);
      actionHeaderCell.font = { bold: true, size: 11, color: { argb: 'FFFF0000' } };
    }
    const processedData = stocks.map((stock, index) => {
      return {
        sno: index + 1,
        ...stock, // Pass the stock data directly as it's now correct
        gwsLotNo: `${stock.JobNo} - ${stock.LotNo}`
      };
    });

    worksheet.addRows(processedData);
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      for (let i = 1; i <= worksheet.columns.length; i++) {
        const cell = row.getCell(i);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    });

    // Set HTTP headers for file download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="GRAFTON Monthly Stock Report - UBTS 2025.xlsx"'
    );

    // Write the workbook to the response stream and end the response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Failed to export Excel file:', error);
    res.status(500).send({ message: 'Error exporting data to Excel' });
  }
}

module.exports = {
  exportStocksToExcel,
};