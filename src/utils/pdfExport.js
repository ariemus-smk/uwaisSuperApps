/**
 * PDF export utility using pdfkit.
 * Provides functions to generate PDF reports for growth and business data.
 *
 * Requirements: 36.5
 */

const PDFDocument = require('pdfkit');

/**
 * Create a PDF report buffer from tabular data.
 * Generates a formatted PDF with title, optional subtitle, and a data table.
 *
 * @param {object} options - PDF generation options
 * @param {string} options.title - Report title
 * @param {string} [options.subtitle] - Optional subtitle (e.g., date range)
 * @param {Array<{header: string, key: string, width: number}>} options.columns - Column definitions
 * @param {Array<object>} options.rows - Data rows to render
 * @param {object} [options.summary] - Optional summary section (key-value pairs)
 * @param {string} [options.orientation='portrait'] - Page orientation: 'portrait' or 'landscape'
 * @returns {Promise<Buffer>} PDF file as a Buffer
 */
async function createPdfReport(options = {}) {
  const {
    title = 'Report',
    subtitle,
    columns = [],
    rows = [],
    summary,
    orientation = 'portrait',
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: orientation,
        margins: { top: 50, bottom: 50, left: 40, right: 40 },
        info: {
          Title: title,
          Author: 'UwaisSuperApps ISP Backend',
          Creator: 'UwaisSuperApps',
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Header
      renderHeader(doc, title, subtitle);

      // Summary section (KPI cards equivalent)
      if (summary) {
        renderSummary(doc, summary);
      }

      // Data table
      if (columns.length > 0 && rows.length > 0) {
        renderTable(doc, columns, rows);
      }

      // Footer
      renderFooter(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Render the report header with title and subtitle.
 * @param {PDFDocument} doc - PDFKit document instance
 * @param {string} title - Report title
 * @param {string} [subtitle] - Optional subtitle
 */
function renderHeader(doc, title, subtitle) {
  doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(0.3);

  if (subtitle) {
    doc.fontSize(11).font('Helvetica').text(subtitle, { align: 'center' });
  }

  // Separator line
  doc.moveDown(0.5);
  const lineY = doc.y;
  doc
    .moveTo(doc.page.margins.left, lineY)
    .lineTo(doc.page.width - doc.page.margins.right, lineY)
    .strokeColor('#4472C4')
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(1);
}

/**
 * Render a summary section with key-value pairs.
 * @param {PDFDocument} doc - PDFKit document instance
 * @param {object} summary - Key-value pairs to display
 */
function renderSummary(doc, summary) {
  doc.fontSize(12).font('Helvetica-Bold').text('Summary', { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(10).font('Helvetica');
  for (const [key, value] of Object.entries(summary)) {
    doc.text(`${key}: ${value}`, { indent: 10 });
  }

  doc.moveDown(1);
}

/**
 * Render a data table with headers and rows.
 * @param {PDFDocument} doc - PDFKit document instance
 * @param {Array<{header: string, key: string, width: number}>} columns - Column definitions
 * @param {Array<object>} rows - Data rows
 */
function renderTable(doc, columns, rows) {
  const startX = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Calculate column widths proportionally
  const totalDefinedWidth = columns.reduce((sum, col) => sum + (col.width || 100), 0);
  const colWidths = columns.map((col) => ((col.width || 100) / totalDefinedWidth) * pageWidth);

  const rowHeight = 20;
  const headerHeight = 24;

  // Render header row
  let currentY = doc.y;
  let currentX = startX;

  // Header background
  doc.rect(startX, currentY, pageWidth, headerHeight).fill('#4472C4');

  // Header text
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
  for (let i = 0; i < columns.length; i++) {
    doc.text(columns[i].header, currentX + 4, currentY + 6, {
      width: colWidths[i] - 8,
      align: 'left',
      lineBreak: false,
    });
    currentX += colWidths[i];
  }

  currentY += headerHeight;

  // Data rows
  doc.font('Helvetica').fontSize(9).fillColor('#000000');

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    // Check if we need a new page
    if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      currentY = doc.page.margins.top;

      // Re-render header on new page
      currentX = startX;
      doc.rect(startX, currentY, pageWidth, headerHeight).fill('#4472C4');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      for (let i = 0; i < columns.length; i++) {
        doc.text(columns[i].header, currentX + 4, currentY + 6, {
          width: colWidths[i] - 8,
          align: 'left',
          lineBreak: false,
        });
        currentX += colWidths[i];
      }
      currentY += headerHeight;
      doc.font('Helvetica').fontSize(9).fillColor('#000000');
    }

    // Alternate row background
    if (rowIdx % 2 === 0) {
      doc.rect(startX, currentY, pageWidth, rowHeight).fill('#F2F6FC');
      doc.fillColor('#000000');
    }

    // Row data
    currentX = startX;
    const row = rows[rowIdx];
    for (let i = 0; i < columns.length; i++) {
      const value = row[columns[i].key];
      const displayValue = value !== undefined && value !== null ? String(value) : '';
      doc.text(displayValue, currentX + 4, currentY + 5, {
        width: colWidths[i] - 8,
        align: 'left',
        lineBreak: false,
      });
      currentX += colWidths[i];
    }

    currentY += rowHeight;
  }

  doc.y = currentY + 10;
}

/**
 * Render the report footer with generation timestamp.
 * @param {PDFDocument} doc - PDFKit document instance
 */
function renderFooter(doc) {
  const bottomY = doc.page.height - doc.page.margins.bottom - 15;
  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor('#888888')
    .text(
      `Generated by UwaisSuperApps ISP Backend on ${new Date().toISOString().split('T')[0]}`,
      doc.page.margins.left,
      bottomY,
      { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
    );
}

/**
 * Generate a growth report PDF with period data.
 * Convenience function specifically for customer growth reports.
 *
 * @param {object} growthReport - Growth report data from report.service.calculateGrowth
 * @param {object} [options={}] - Additional options
 * @param {string} [options.dateRange] - Human-readable date range for subtitle
 * @returns {Promise<Buffer>} PDF file as a Buffer
 */
async function createGrowthReportPdf(growthReport, options = {}) {
  const { dateRange } = options;

  const periodLabel = growthReport.period === 'MoM' ? 'Month-over-Month' : 'Year-over-Year';
  const title = `Customer Growth Report - ${periodLabel}`;
  const subtitle = dateRange ? `Period: ${dateRange}` : `Generated: ${new Date().toISOString().split('T')[0]}`;

  // Build columns based on groupBy
  const columns = [
    { header: 'Period', key: 'period', width: 80 },
  ];

  if (growthReport.groupBy) {
    columns.push({ header: capitalizeFirst(growthReport.groupBy), key: 'groupName', width: 120 });
  }

  columns.push(
    { header: 'Activations', key: 'activations', width: 80 },
    { header: 'Churned', key: 'churned', width: 80 },
    { header: 'Net Growth', key: 'netGrowth', width: 80 }
  );

  // Calculate summary
  const totalActivations = growthReport.data.reduce((sum, r) => sum + r.activations, 0);
  const totalChurned = growthReport.data.reduce((sum, r) => sum + r.churned, 0);
  const totalNetGrowth = totalActivations - totalChurned;

  const summary = {
    'Total Activations': totalActivations,
    'Total Churned': totalChurned,
    'Net Growth': totalNetGrowth,
    'Periods Covered': new Set(growthReport.data.map((r) => r.period)).size,
  };

  if (growthReport.groupBy) {
    const uniqueGroups = new Set(growthReport.data.map((r) => r.groupName));
    summary[`Total ${capitalizeFirst(growthReport.groupBy)}s`] = uniqueGroups.size;
  }

  return createPdfReport({
    title,
    subtitle,
    columns,
    rows: growthReport.data,
    summary,
    orientation: growthReport.data.length > 20 ? 'landscape' : 'portrait',
  });
}

/**
 * Capitalize the first letter of a string.
 * @param {string} str - Input string
 * @returns {string} Capitalized string
 */
function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  createPdfReport,
  createGrowthReportPdf,
};
