/**
 * Excel export utility using exceljs.
 * Provides functions to generate .xlsx workbooks for regulatory and business reports.
 *
 * Requirements: 34.4
 */

const ExcelJS = require('exceljs');

/**
 * Create a styled workbook with a single worksheet.
 * @param {string} sheetName - Name of the worksheet
 * @param {Array<{header: string, key: string, width: number}>} columns - Column definitions
 * @param {Array<object>} rows - Data rows to populate
 * @param {object} [options={}] - Additional options
 * @param {string} [options.title] - Optional title row above headers
 * @param {string} [options.subtitle] - Optional subtitle row
 * @returns {ExcelJS.Workbook} Configured workbook
 */
function createWorkbook(sheetName, columns, rows, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UwaisSuperApps ISP Backend';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  let startRow = 1;

  // Add title if provided
  if (options.title) {
    const titleRow = worksheet.addRow([options.title]);
    titleRow.font = { bold: true, size: 14 };
    titleRow.alignment = { horizontal: 'center' };
    worksheet.mergeCells(startRow, 1, startRow, columns.length);
    startRow++;
  }

  // Add subtitle if provided
  if (options.subtitle) {
    const subtitleRow = worksheet.addRow([options.subtitle]);
    subtitleRow.font = { size: 11, italic: true };
    subtitleRow.alignment = { horizontal: 'center' };
    worksheet.mergeCells(startRow, 1, startRow, columns.length);
    startRow++;
  }

  // Add empty row after title/subtitle
  if (options.title || options.subtitle) {
    worksheet.addRow([]);
  }

  // Set columns
  worksheet.columns = columns;

  // Style header row
  const headerRow = worksheet.getRow(worksheet.lastRow ? worksheet.lastRow.number + 1 : 1);
  // Re-add headers manually since columns were set after rows
  // Reset: clear and rebuild
  // Actually, let's rebuild properly
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UwaisSuperApps ISP Backend';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName);

  let currentRow = 1;

  // Add title if provided
  if (options.title) {
    ws.getCell(`A${currentRow}`).value = options.title;
    ws.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
    ws.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
    ws.mergeCells(currentRow, 1, currentRow, columns.length);
    currentRow++;
  }

  // Add subtitle if provided
  if (options.subtitle) {
    ws.getCell(`A${currentRow}`).value = options.subtitle;
    ws.getCell(`A${currentRow}`).font = { size: 11, italic: true };
    ws.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
    ws.mergeCells(currentRow, 1, currentRow, columns.length);
    currentRow++;
  }

  // Add empty row separator
  if (options.title || options.subtitle) {
    currentRow++;
  }

  // Set column widths
  ws.columns = columns.map((col) => ({
    key: col.key,
    width: col.width || 15,
  }));

  // Add header row
  const headerValues = columns.map((col) => col.header);
  const hRow = ws.getRow(currentRow);
  headerValues.forEach((val, idx) => {
    const cell = hRow.getCell(idx + 1);
    cell.value = val;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  currentRow++;

  // Add data rows
  for (const row of rows) {
    const dataRow = ws.getRow(currentRow);
    columns.forEach((col, idx) => {
      const cell = dataRow.getCell(idx + 1);
      cell.value = row[col.key] !== undefined ? row[col.key] : '';
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    currentRow++;
  }

  return wb;
}

/**
 * Generate an Excel buffer from a workbook.
 * @param {ExcelJS.Workbook} workbook - The workbook to serialize
 * @returns {Promise<Buffer>} Excel file as a Buffer
 */
async function workbookToBuffer(workbook) {
  return workbook.xlsx.writeBuffer();
}

/**
 * Create a multi-sheet workbook from multiple datasets.
 * @param {Array<{sheetName: string, columns: Array, rows: Array, options?: object}>} sheets - Sheet definitions
 * @returns {ExcelJS.Workbook} Configured workbook with multiple sheets
 */
function createMultiSheetWorkbook(sheets) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UwaisSuperApps ISP Backend';
  workbook.created = new Date();

  for (const sheet of sheets) {
    const { sheetName, columns, rows, options = {} } = sheet;
    const ws = workbook.addWorksheet(sheetName);

    let currentRow = 1;

    // Add title if provided
    if (options.title) {
      ws.getCell(`A${currentRow}`).value = options.title;
      ws.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
      ws.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
      ws.mergeCells(currentRow, 1, currentRow, columns.length);
      currentRow++;
    }

    // Add subtitle if provided
    if (options.subtitle) {
      ws.getCell(`A${currentRow}`).value = options.subtitle;
      ws.getCell(`A${currentRow}`).font = { size: 11, italic: true };
      ws.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
      ws.mergeCells(currentRow, 1, currentRow, columns.length);
      currentRow++;
    }

    // Add empty row separator
    if (options.title || options.subtitle) {
      currentRow++;
    }

    // Set column widths
    ws.columns = columns.map((col) => ({
      key: col.key,
      width: col.width || 15,
    }));

    // Add header row
    const headerValues = columns.map((col) => col.header);
    const hRow = ws.getRow(currentRow);
    headerValues.forEach((val, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = val;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    currentRow++;

    // Add data rows
    for (const row of rows) {
      const dataRow = ws.getRow(currentRow);
      columns.forEach((col, idx) => {
        const cell = dataRow.getCell(idx + 1);
        cell.value = row[col.key] !== undefined ? row[col.key] : '';
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
      currentRow++;
    }
  }

  return workbook;
}

module.exports = {
  createWorkbook,
  createMultiSheetWorkbook,
  workbookToBuffer,
};
