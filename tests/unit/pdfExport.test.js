/**
 * Unit tests for PDF export utility.
 * Tests createPdfReport and createGrowthReportPdf functions.
 *
 * Requirements: 36.5
 */

const { createPdfReport, createGrowthReportPdf } = require('../../src/utils/pdfExport');

describe('PDF Export Utility', () => {
  describe('createPdfReport', () => {
    it('should return a valid PDF Buffer', async () => {
      const buffer = await createPdfReport({
        title: 'Test Report',
        columns: [
          { header: 'Name', key: 'name', width: 100 },
          { header: 'Value', key: 'value', width: 80 },
        ],
        rows: [
          { name: 'Item 1', value: 100 },
          { name: 'Item 2', value: 200 },
        ],
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      expect(buffer.toString('ascii', 0, 4)).toBe('%PDF');
    });

    it('should include subtitle when provided', async () => {
      const buffer = await createPdfReport({
        title: 'Report',
        subtitle: 'Period: 2024-01 to 2024-06',
        columns: [{ header: 'Col', key: 'col', width: 100 }],
        rows: [{ col: 'data' }],
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should include summary section when provided', async () => {
      const buffer = await createPdfReport({
        title: 'Report',
        columns: [{ header: 'Col', key: 'col', width: 100 }],
        rows: [{ col: 'data' }],
        summary: { 'Total': 100, 'Average': 50 },
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle empty rows', async () => {
      const buffer = await createPdfReport({
        title: 'Empty Report',
        columns: [{ header: 'Col', key: 'col', width: 100 }],
        rows: [],
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString('ascii', 0, 4)).toBe('%PDF');
    });

    it('should support landscape orientation', async () => {
      const buffer = await createPdfReport({
        title: 'Landscape Report',
        columns: [{ header: 'Col', key: 'col', width: 100 }],
        rows: [{ col: 'data' }],
        orientation: 'landscape',
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle rows with null/undefined values', async () => {
      const buffer = await createPdfReport({
        title: 'Report',
        columns: [
          { header: 'Name', key: 'name', width: 100 },
          { header: 'Value', key: 'value', width: 80 },
        ],
        rows: [
          { name: 'Item 1', value: null },
          { name: 'Item 2' }, // value is undefined
        ],
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe('createGrowthReportPdf', () => {
    it('should generate a PDF for MoM growth report', async () => {
      const growthReport = {
        period: 'MoM',
        groupBy: null,
        data: [
          { period: '2024-01', activations: 10, churned: 3, netGrowth: 7 },
          { period: '2024-02', activations: 15, churned: 5, netGrowth: 10 },
        ],
      };

      const buffer = await createGrowthReportPdf(growthReport);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString('ascii', 0, 4)).toBe('%PDF');
    });

    it('should generate a PDF for YoY growth report', async () => {
      const growthReport = {
        period: 'YoY',
        groupBy: null,
        data: [
          { period: '2023', activations: 100, churned: 30, netGrowth: 70 },
          { period: '2024', activations: 150, churned: 40, netGrowth: 110 },
        ],
      };

      const buffer = await createGrowthReportPdf(growthReport);

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should include group column when groupBy is set', async () => {
      const growthReport = {
        period: 'MoM',
        groupBy: 'branch',
        data: [
          { period: '2024-01', activations: 8, churned: 2, netGrowth: 6, branchId: 1, groupName: 'Cabang A' },
          { period: '2024-01', activations: 5, churned: 1, netGrowth: 4, branchId: 2, groupName: 'Cabang B' },
        ],
      };

      const buffer = await createGrowthReportPdf(growthReport, { dateRange: '2024-01 to 2024-06' });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle empty growth data', async () => {
      const growthReport = {
        period: 'MoM',
        groupBy: null,
        data: [],
      };

      const buffer = await createGrowthReportPdf(growthReport);

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });
});
