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
      { header: 'Sub-total of each Job', width: 20 },
      { header: 'Cargo Out Date', key: 'ReleaseDate', width: 20 },
      { header: 'Action', width: 15 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 40;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    const actionColIndex = worksheet.columns.findIndex(col => col.header === 'Action') + 1;
    if (actionColIndex > 0) {
      const actionHeaderCell = headerRow.getCell(actionColIndex);
      actionHeaderCell.font = { bold: true, size: 11, color: { argb: 'FFFF0000' } };
    }
    const processedData = stocks.map((stock, index) => {
      return {
        sno: index + 1,
        ...stock,
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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="GRAFTON Monthly Stock Report - UBTS 2025.xlsx"');

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Failed to export Excel file:', error);
    res.status(500).send({ message: 'Error exporting data to Excel' });
  }
}
async function exportBundleSheetToExcel(req, res) {
  try {
    const { jobNo} = req.query;
    if (!jobNo) {
      return res.status(400).send({ message: 'Job number is required.' });
    }

    const exWarehouseLots = await stockService.getExWarehouseLotsForJob(jobNo);
    if (!exWarehouseLots || exWarehouseLots.length === 0) {
      return res.status(404).send({ message: 'No lots found for the given job number to export.' });
    }

    const workbook = new excel.Workbook();

    for (const exWarehouseLot of exWarehouseLots ) {
      try {
        const data = await stockService.getIndividualBundleSheetData(jobNo, exWarehouseLot);
        const lotNo = exWarehouseLot.lotNo;
        const shapeName = exWarehouseLot.shapeName;
        const commodityName = exWarehouseLot.commodityName;
        const brandName = exWarehouseLot.brandName;
        const inboundWarehouseName = exWarehouseLot.inboundWarehouseName;

        const { mainDetails, bundles } = data;
        
        const formattedLotNo = String(lotNo).padStart(3, '0');
        const formatJobLot = `${jobNo}-${formattedLotNo}`;
        
        const worksheetName = (mainDetails && mainDetails.lotNoWarrantNo)
          ? mainDetails.lotNoWarrantNo
          : formatJobLot;

        // Always create worksheet even if no bundles exist
        const worksheet = workbook.addWorksheet(worksheetName, {
          pageSetup: { paperSize: 9, orientation: 'landscape' }
        });

      // --- Style Definitions ---
      const THICK_BLUE_BORDER = {
        top: { style: 'thick', color: { argb: 'FF0070C0' } },
        left: { style: 'thick', color: { argb: 'FF0070C0' } },
        bottom: { style: 'thick', color: { argb: 'FF0070C0' } },
        right: { style: 'thick', color: { argb: 'FF0070C0' } }
      };
      const THIN_BLACK_BORDER = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      // --- 1. Header Section ---
      // Add logo image
      const logoImageId = workbook.addImage({
        filename: './uploads/logo/grafton_logo.png', // Path to your logo file in the logo folder
        extension: 'png',
      });

      worksheet.addImage(logoImageId, {
        tl: { col: 1, row: 0 }, // Top-left corner of cell B1
        ext: { width: 260, height: 50 } // Width and height in pixels
      });

      worksheet.mergeCells('B1:O1');
      worksheet.getCell('B1').value = 'Individual Bundle Sheet';
      worksheet.getCell('B1').font = { name: 'Calibri', bold: true, size: 20, color: { argb: 'FF000000' } };
      worksheet.getCell('B1').alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getCell('B1').border = THIN_BLACK_BORDER;
      worksheet.getRow(1).height = 45;

      const headerData = [
        ['B3', 'Our Reference', (mainDetails && mainDetails.ourReference) || ''],
        ['B4', 'Operator Job No', ''],
        ['B5', 'Operator Work Order', 'A'],
        ['G3', 'Commodity', (mainDetails && mainDetails.commodity) || commodityName],
        ['G4', 'Shape', (mainDetails && mainDetails.shape) || shapeName],
        ['G5', 'Brand', (mainDetails && mainDetails.brand) || brandName],
        ['L3', 'BL No', (mainDetails && mainDetails.blNo) || '-'],
        ['L4', 'Warehouse', (mainDetails && mainDetails.warehouse) || inboundWarehouseName],
        ['L5', 'Lot No /\nWarrant No', (mainDetails.lotNoWarrantNo) || formatJobLot],
      ];

      headerData.forEach(([cell, label, value]) => {
        const labelCell = worksheet.getCell(cell);
        labelCell.value = label;
        labelCell.font = { name: 'Calibri', bold: true, size: 10 };
        labelCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        // labelCell.border = THIN_BLACK_BORDER;

        const valueCellAddress = cell.replace(/[A-Z]+/, c => String.fromCharCode(c.charCodeAt(0) + 1));
        const valueCell = worksheet.getCell(valueCellAddress);
        valueCell.value = value;
        valueCell.font = { name: 'Calibri', size: 10 };
        valueCell.alignment = { vertical: 'middle', wrapText: true };
        valueCell.border = THIN_BLACK_BORDER;
        worksheet.mergeCells(`${valueCellAddress}:${String.fromCharCode(valueCellAddress.charCodeAt(0) + 1)}${valueCellAddress.slice(1)}`);

        // Apply border to merged cells
        const mergedEndCell = worksheet.getCell(`${String.fromCharCode(valueCellAddress.charCodeAt(0) + 1)}${valueCellAddress.slice(1)}`);
        mergedEndCell.border = THIN_BLACK_BORDER;
        mergedEndCell.alignment = { wrapText: true };
      });

      // Set row heights for header data rows
      worksheet.getRow(3).height = 30;
      worksheet.getRow(4).height = 30;
      worksheet.getRow(5).height = 30;
      // applyBorderToRange('B4', 'P7', THICK_BLUE_BORDER);
      // worksheet.getCell('M6').alignment = { wrapText: true };

      // --- 2. Warning Message ---
      worksheet.mergeCells('E7:I7');
      worksheet.getCell('E7').value = 'MISSING 100% WEIGHING DETAILS! DO NOW!';
      worksheet.getCell('E7').font = { name: 'Calibri', bold: true, size: 10, italic: true, color: { argb: 'FFFF0000' } };
      worksheet.getCell('E7').alignment = { vertical: 'middle', horizontal: 'right' };
      worksheet.getRow(7).height = 30;
      worksheet.getCell('J7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DDEBF7' } };
      worksheet.getCell('J7').value = '-';
      worksheet.getCell('K7').value = 'KG';
      worksheet.getCell('K7').font = { name: 'Calibri', size: 10 };
      worksheet.getCell('K7').alignment = { vertical: 'middle', horizontal: 'left' };
      worksheet.getCell('L7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' } };
      worksheet.getCell('L7').value = 'Cargo Condition';
      worksheet.getCell('L7').font = { name: 'Calibri', bold: true, size: 10 };
      worksheet.getCell('L7').alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getCell('L7').border = THIN_BLACK_BORDER;
      worksheet.mergeCells('M7:N7');
      worksheet.getCell('M7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' } };
      worksheet.getCell('M7').value = 'If Yes, please indicate (Y) in the box';
      worksheet.getCell('M7').font = { name: 'Calibri', bold: true, size: 10 };
      worksheet.getCell('M7').alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getCell('M7').border = THIN_BLACK_BORDER;
      // --- 3. Table Headers ---
      const tableHeaderRow = worksheet.getRow(8);
      const headers = [
        'Bundle No', 'Container No\nOR\nEx-Warrant No', 'Producer Heat/Cast No',
        'Producer Bundle/Batch No', 'Producer\nGW (KG)', 'Producer\nNW (KG)',
        '100%\nGW (KG)', 'Strapping\nWeight', '100%\nNW (KG)',
        'Piece\nOR\nProducer Clip (Y/N)', 'Strapping (QTY)',
        'Please Specify if\nO-Oxidization\nR-Rusty\nS-Stain\nOthers',
        'Handwritten Melt',
        'Pls Specify in\ndetail example Restrapping,\nTop up from, Move To, Swap with'
      ];
      tableHeaderRow.values = [, ...headers];
      tableHeaderRow.height = 85;
      tableHeaderRow.eachCell({ includeEmpty: true }, (cell) => {
        if (!cell.value) return;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
        cell.font = { name: 'Calibri', bold: true, size: 10 };
        cell.alignment = { vertical: 'bottom', horizontal: 'left', wrapText: true };
        cell.border = THIN_BLACK_BORDER;
      });

      // Apply special formatting to cells containing "OR"
      // Container No OR Ex-Warrant No (Column C)
      const containerCell = tableHeaderRow.getCell('B');
      containerCell.value = {
        richText: [
          { text: 'Container No\n', font: { name: 'Calibri', bold: true, size: 10 } },
          { text: 'OR', font: { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFF0000' }, underline: true } },
          { text: '\nEx-Warrant No', font: { name: 'Calibri', bold: true, size: 10 } }
        ]
      };

      // Piece OR Producer Clip (Column J)
      const pieceCell = tableHeaderRow.getCell('J');
      pieceCell.value = {
        richText: [
          { text: 'Piece\n', font: { name: 'Calibri', bold: true, size: 10 } },
          { text: 'OR', font: { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFF0000' }, underline: true } },
          { text: '\nProducer Clip (Y/N)', font: { name: 'Calibri', bold: true, size: 10 } }
        ]
      };


      tableHeaderRow.getCell('A').fill = undefined;
      tableHeaderRow.getCell('B').fill = undefined;
      tableHeaderRow.getCell('C').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      tableHeaderRow.getCell('D').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      tableHeaderRow.getCell('E').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      tableHeaderRow.getCell('F').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };

      tableHeaderRow.getCell('G').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } };
      tableHeaderRow.getCell('H').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } };
      tableHeaderRow.getCell('I').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } };

      // --- 4. Table Data ---
      const dataStartRow = 9;
      let totalProducerGW = 0;
      let totalProducerNW = 0;
      let totalWeighedGW = 0;
      let totalWeighedNW = 0;

      // Handle bundles data - use empty array if bundles is undefined or null
      const bundlesData = bundles || [];
      
      bundlesData.forEach((bundle, index) => {
        const row = worksheet.getRow(dataStartRow + index);
        const isEvenRow = index % 2 !== 0;

        const producerGW = parseInt(bundle.producerGW, 10) || 0;
        const producerNW = parseInt(bundle.producerNW, 10) || 0;
        const weighedGW = parseInt(bundle.weighedGW, 10) || 0;

        row.values = [
          , bundle.bundleNo, bundle.containerNo, bundle.heatCastNo, bundle.batchNo,
          producerGW, producerNW, weighedGW,
          , , , , , , bundle.lastCol
        ];

        // Apply number formatting to weight columns
        row.getCell('E').numFmt = '#,##0'; // Producer GW
        row.getCell('F').numFmt = '#,##0'; // Producer NW
        row.getCell('G').numFmt = '#,##0'; // Weighed GW
        row.getCell('H').numFmt = '#,##0'; // Strapping Weight
        row.getCell('I').numFmt = '#,##0'; // Weighed NW

        totalProducerGW += producerGW;
        totalProducerNW += producerNW;
        totalWeighedGW += weighedGW;
        totalWeighedNW = '';

        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = THIN_BLACK_BORDER;
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.font = { name: 'Calibri', size: 10 };
          // if (isEvenRow) {
          //     cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
          // }
        });
      });

      // --- 5. Totals Row ---
      const totalRowIndex = dataStartRow + bundlesData.length;
      const totalRow = worksheet.getRow(totalRowIndex);
      worksheet.mergeCells(`A${totalRowIndex}:D${totalRowIndex}`);
      totalRow.getCell('A').value = 'Total';

      totalRow.getCell('E').value = { formula: `SUM(E${dataStartRow}:E${totalRowIndex - 1})`, result: totalProducerGW };
      totalRow.getCell('F').value = { formula: `SUM(F${dataStartRow}:F${totalRowIndex - 1})`, result: totalProducerNW };
      totalRow.getCell('G').value = { formula: `SUM(G${dataStartRow}:G${totalRowIndex - 1})`, result: totalWeighedGW };
      totalRow.getCell('I').value = { formula: `SUM(I${dataStartRow}:I${totalRowIndex - 1})`, result: totalWeighedNW };

      totalRow.getCell('E').numFmt = '#,##0';
      totalRow.getCell('F').numFmt = '#,##0';
      totalRow.getCell('G').numFmt = '#,##0';
      totalRow.getCell('H').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      totalRow.getCell('I').numFmt = '#,##0';

      worksheet.mergeCells(`K${totalRowIndex}:N${totalRowIndex}`);
      totalRow.getCell('K').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };

      totalRow.eachCell({ includeEmpty: true }, (cell) => {
        //cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
        cell.font = { name: 'Calibri', bold: true, size: 10 };
        cell.border = THIN_BLACK_BORDER;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      totalRow.getCell('B').alignment.horizontal = 'right';

      //applyBorderToRange(`B10`, `O${totalRowIndex}`, THICK_BLUE_BORDER);

      // --- 6. Difference Row ---
      const diffRowIndex = totalRowIndex + 2;
      worksheet.mergeCells(`C${diffRowIndex}:F${diffRowIndex}`);
      const diffLabelCell = worksheet.getCell(`C${diffRowIndex}`);
      diffLabelCell.value = 'Difference Against 100% Weight: Over/(Under)';
      diffLabelCell.border = THIN_BLACK_BORDER;
      diffLabelCell.font = { name: 'Calibri', bold: true, size: 10 };
      diffLabelCell.alignment = { vertical: 'middle', horizontal: 'right' };

      // Use Excel formula to calculate difference: 100% GW total - Producer NW total
      const diffCell = worksheet.getCell(`G${diffRowIndex}`);
      diffCell.value = { formula: `E${totalRowIndex}-G${totalRowIndex}` };
      diffCell.numFmt = '#,##0_);(#,##0)'; // Format negative numbers with brackets
      diffCell.border = THIN_BLACK_BORDER;
      diffCell.font = { name: 'Calibri', bold: true, size: 10 };
      diffCell.alignment = { vertical: 'middle' };

      worksheet.getCell(`H${diffRowIndex}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      const totalProducerNWCell = worksheet.getCell(`I${diffRowIndex}`);
      totalProducerNWCell.value = { formula: `F${totalRowIndex} - I${totalRowIndex}` };
      totalProducerNWCell.numFmt = '#,##0_);(#,##0)';
      totalProducerNWCell.border = THIN_BLACK_BORDER;
      totalProducerNWCell.font = { name: 'Calibri', bold: true, size: 10 };
      totalProducerNWCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // --- 7. Right Side Static Lists ---
      const listData = [
        { header: 'WAREHOUSE', items: ["SB9/SB8 - OPEN YARD, SBW FTZ", "ST5 - SBW FTZ", "SB5 - SBW FTZ"] },
        { header: 'COMMODITY', items: ["ALUMINIUM", "COPPER", "LEAD", "NICKEL", "TIN", "ZINC"] },
        { header: 'SHAPE', items: ["BRIQUTTE", "CATHODE", "DRUM", "INGOT", "JUMBO BAG", "PLATE", "SOW", "T-BAR", "T-INGOT"] },
        {
          header: 'BRAND', items: ["HZL SHG", "HZL ZN SHG", "VEDANTA SHG", "VEDANTA ZN SHG", "NALCO", "VEDANTAL", "VEDANTA", "RUSAL K", "RUSAL B", "RUSAL S",
            "ASTUZINC ELECTRO 99.995%", "NYRSTAR NL Z1", "NYRSTAR OVERPELT", "SMC SHG 99.9995", "VOTORANTIM CJ - 99.995% MIN", "YP - ZN 99.995% MIN",
            "NYRSTAR OVERPELT Z1", "JAIN 9997", "VEDANTA PB 99.99", "VEDANTA 99.99", "GAST 970R"]
        }
      ];
      let currentRow = 1;
      listData.forEach(({ header, items }) => {
        const headerCell = worksheet.getCell(`Q${currentRow}`);
        worksheet.mergeCells(`Q${currentRow}:R${currentRow}`);
        headerCell.value = header;
        headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
        headerCell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        headerCell.alignment = { vertical: 'middle', horizontal: 'center' };

        let itemStartRow = currentRow + 1;
        items.forEach((item, index) => {
          worksheet.mergeCells(`Q${itemStartRow + index}:R${itemStartRow + index}`);
          worksheet.getCell(`Q${itemStartRow + index}`).value = item;
          worksheet.getCell(`Q${itemStartRow + index}`).font = { name: 'Arial', size: 9 };
        });
        currentRow = itemStartRow + items.length;
      });
      worksheet.columns = [
        { width: 10 },
        { key: 'A', width: 20 },
        // ** FIX 1: Increased "Bundle No" (Column B) width significantly **
        { key: 'B', width: 20 },
        { key: 'C', width: 18 },
        { key: 'D', width: 12, style: { numFmt: '#,##0' } },
        { key: 'E', width: 12, style: { numFmt: '#,##0' } },
        { key: 'F', width: 12, style: { numFmt: '#,##0' } },
        { key: 'G', width: 12 },
        { key: 'H', width: 12 },
        { key: 'I', width: 14 },
        { key: 'J', width: 14 },
        { key: 'K', width: 14 },
        { key: 'L', width: 14 },
        { key: 'M', width: 22 },
        { key: 'N', width: 15 },
        { key: 'O', width: 30 },
        { key: 'P', width: 10 },
        { key: 'Q', width: 25 },
        { key: 'R', width: 15 }
      ];
      } catch (lotError) {
        console.error(`Error processing lot ${exWarehouseLot}:`, lotError);
        // Continue to next lot if this one fails
        continue;
      }
    } 

    const fileName = `${jobNo}-Cargo List.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Failed to export bundle sheet to Excel:', error);
    res.status(500).send({ message: ' ' });
  }
}

module.exports = {
  exportStocksToExcel,
  exportBundleSheetToExcel,
};