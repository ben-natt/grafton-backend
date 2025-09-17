const excel = require('exceljs');
const stockService = require('../services/report.service');

async function exportStocksToExcel(req, res) {
  try {
    const stocks = await stockService.getAllStocks(req.query);

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
      { header: 'Shape', key: 'Shape', width: 20 },
      { header: 'Bundles', key: 'Bundles', width: 15 },
      { header: 'Net Weight (MT)', key: 'NetWeight', width: 25, style: { numFmt: '#,##0.000' } },
      { header: 'Gross Weight (MT)', key: 'GrossWeight', width: 25, style: { numFmt: '#,##0.000' } },
    ];
    
    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 40;
    
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.alignment = {
        vertical: 'middle', 
        horizontal: 'left'
      };
    });

    // Process the data: add S/No and create the combined 'GWS Lot No.'
    const processedData = stocks.map((stock, index) => ({
      sno: index + 1,
      ...stock,
      gwsLotNo: `${stock.JobNo} - ${stock.LotNo}` 
    }));
    worksheet.addRows(processedData);

    // Add a border to every cell in every row
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
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