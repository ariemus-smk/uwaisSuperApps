/**
 * Unit tests for Excel export utility (excelExport.js).
 * Tests createWorkbook, createMultiSheetWorkbook, and workbookToBuffer functions.
 *
 * Requirements: 34.4
 */

const {
  createWorkbook,
  createMultiSheetWorkbook,
  workbookToBuffer,
} = require('../../src/utils/excelExport');

describe('Excel Export Utility', () => {
  const sampleColumns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Amount', key: 'amount', width: 15 },
  ];

  const sampleRows = [
    { no: 1, name: 'Customer A', amount: 150000 },
    { no: 2, name: 'Customer B', amount: 200000 },
    { no: 3, name: 'Customer C', amount: 100000 },
  ];

  describe('createWorkbook', () => {
    it('should create a workbook with the correct sheet name', () => {
      const wb = createWorkbook('TestSheet', sampleColumns, sampleRows);

      expect(wb.worksheets).toHaveLength(1);
      expect(wb.worksheets[0].name).toBe('TestSheet');
    });

    it('should set workbook creator to UwaisSuperApps ISP Backend', () => {
      const wb = createWorkbook('Report', sampleColumns, sampleRows);

      expect(wb.creator).toBe('UwaisSuperApps ISP Backend');
    });

    it('should populate data rows correctly', () => {
      const wb = createWorkbook('Data', sampleColumns, sampleRows);
      const ws = wb.worksheets[0];

      // Find the row with header "No" to determine header row number
      let headerRowNum = null;
      ws.eachRow((row, rowNumber) => {
        if (row.getCell(1).value === 'No') {
          headerRowNum = rowNumber;
        }
      });

      expect(headerRowNum).not.toBeNull();

      // Data starts after header
      const firstDataRow = ws.getRow(headerRowNum + 1);
      expect(firstDataRow.getCell(1).value).toBe(1);
      expect(firstDataRow.getCell(2).value).toBe('Customer A');
      expect(firstDataRow.getCell(3).value).toBe(150000);
    });

    it('should add title row when options.title is provided', () => {
      const wb = createWorkbook('Report', sampleColumns, sampleRows, {
        title: 'Monthly Revenue Report',
      });
      const ws = wb.worksheets[0];

      // Title should be in the first row
      expect(ws.getCell('A1').value).toBe('Monthly Revenue Report');
      expect(ws.getCell('A1').font.bold).toBe(true);
      expect(ws.getCell('A1').font.size).toBe(14);
    });

    it('should add subtitle row when options.subtitle is provided', () => {
      const wb = createWorkbook('Report', sampleColumns, sampleRows, {
        title: 'Report Title',
        subtitle: 'Period: January 2024',
      });
      const ws = wb.worksheets[0];

      expect(ws.getCell('A2').value).toBe('Period: January 2024');
      expect(ws.getCell('A2').font.italic).toBe(true);
    });

    it('should handle empty rows array', () => {
      const wb = createWorkbook('Empty', sampleColumns, []);

      expect(wb.worksheets).toHaveLength(1);
      expect(wb.worksheets[0].name).toBe('Empty');
    });

    it('should handle rows with missing column values', () => {
      const rows = [
        { no: 1, name: 'Partial' },
        // 'amount' key is missing
      ];

      const wb = createWorkbook('Partial', sampleColumns, rows);
      const ws = wb.worksheets[0];

      // Should not throw, missing values become empty string
      let headerRowNum = null;
      ws.eachRow((row, rowNumber) => {
        if (row.getCell(1).value === 'No') {
          headerRowNum = rowNumber;
        }
      });

      const dataRow = ws.getRow(headerRowNum + 1);
      expect(dataRow.getCell(3).value).toBe('');
    });

    it('should style header row with bold white text on blue background', () => {
      const wb = createWorkbook('Styled', sampleColumns, sampleRows);
      const ws = wb.worksheets[0];

      // Find header row
      let headerRowNum = null;
      ws.eachRow((row, rowNumber) => {
        if (row.getCell(1).value === 'No') {
          headerRowNum = rowNumber;
        }
      });

      const headerCell = ws.getRow(headerRowNum).getCell(1);
      expect(headerCell.font.bold).toBe(true);
      expect(headerCell.font.color.argb).toBe('FFFFFFFF');
      expect(headerCell.fill.fgColor.argb).toBe('FF4472C4');
    });
  });

  describe('createMultiSheetWorkbook', () => {
    it('should create a workbook with multiple sheets', () => {
      const sheets = [
        { sheetName: 'Sheet1', columns: sampleColumns, rows: sampleRows },
        { sheetName: 'Sheet2', columns: sampleColumns, rows: [] },
        { sheetName: 'Sheet3', columns: sampleColumns, rows: sampleRows },
      ];

      const wb = createMultiSheetWorkbook(sheets);

      expect(wb.worksheets).toHaveLength(3);
      expect(wb.worksheets[0].name).toBe('Sheet1');
      expect(wb.worksheets[1].name).toBe('Sheet2');
      expect(wb.worksheets[2].name).toBe('Sheet3');
    });

    it('should set workbook creator', () => {
      const sheets = [
        { sheetName: 'Only', columns: sampleColumns, rows: sampleRows },
      ];

      const wb = createMultiSheetWorkbook(sheets);

      expect(wb.creator).toBe('UwaisSuperApps ISP Backend');
    });

    it('should populate each sheet with its own data', () => {
      const sheets = [
        {
          sheetName: 'Revenue',
          columns: [{ header: 'Month', key: 'month', width: 10 }],
          rows: [{ month: 'Jan' }, { month: 'Feb' }],
        },
        {
          sheetName: 'Expenses',
          columns: [{ header: 'Category', key: 'category', width: 20 }],
          rows: [{ category: 'Salary' }],
        },
      ];

      const wb = createMultiSheetWorkbook(sheets);

      // Revenue sheet should have header + 2 data rows
      let revenueHeaderRow = null;
      wb.worksheets[0].eachRow((row, rowNumber) => {
        if (row.getCell(1).value === 'Month') {
          revenueHeaderRow = rowNumber;
        }
      });
      expect(revenueHeaderRow).not.toBeNull();
      expect(wb.worksheets[0].getRow(revenueHeaderRow + 1).getCell(1).value).toBe('Jan');
      expect(wb.worksheets[0].getRow(revenueHeaderRow + 2).getCell(1).value).toBe('Feb');
    });

    it('should support per-sheet title and subtitle options', () => {
      const sheets = [
        {
          sheetName: 'Report',
          columns: sampleColumns,
          rows: sampleRows,
          options: { title: 'Sheet Title', subtitle: 'Sheet Subtitle' },
        },
      ];

      const wb = createMultiSheetWorkbook(sheets);
      const ws = wb.worksheets[0];

      expect(ws.getCell('A1').value).toBe('Sheet Title');
      expect(ws.getCell('A2').value).toBe('Sheet Subtitle');
    });

    it('should handle empty sheets array', () => {
      const wb = createMultiSheetWorkbook([]);

      expect(wb.worksheets).toHaveLength(0);
    });
  });

  describe('workbookToBuffer', () => {
    it('should return a Buffer', async () => {
      const wb = createWorkbook('Test', sampleColumns, sampleRows);
      const buffer = await workbookToBuffer(wb);

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should generate valid xlsx content (PK zip signature)', async () => {
      const wb = createWorkbook('Test', sampleColumns, sampleRows);
      const buffer = await workbookToBuffer(wb);

      // xlsx files are zip archives starting with PK signature
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    });

    it('should produce non-empty buffer', async () => {
      const wb = createWorkbook('Test', sampleColumns, sampleRows);
      const buffer = await workbookToBuffer(wb);

      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should work with multi-sheet workbooks', async () => {
      const sheets = [
        { sheetName: 'Sheet1', columns: sampleColumns, rows: sampleRows },
        { sheetName: 'Sheet2', columns: sampleColumns, rows: sampleRows },
      ];
      const wb = createMultiSheetWorkbook(sheets);
      const buffer = await workbookToBuffer(wb);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    });

    it('should work with empty workbook (no data rows)', async () => {
      const wb = createWorkbook('Empty', sampleColumns, []);
      const buffer = await workbookToBuffer(wb);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
