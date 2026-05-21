/**
 * Financial Reports Export Module
 * Handles PDF, CSV, Email, and Print exports
 */

import { getCurrentReportContext } from './reports.js';
import { auth } from './firebaseConfig.js';

/**
 * Load external script dynamically
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Shared file download helper
 */
function downloadFile(filename, blob) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Format filename from report context
 */
function getFilename(context, extension) {
  const reportName = context.title.replace(/\s+/g, '_');
  const dateStr = context.dateRange.toDate.toISOString().split('T')[0];
  return `${reportName}_${dateStr}.${extension}`;
}

/**
 * Export report as PDF
 */
export async function exportReportToPDF() {
  try {
    const context = getCurrentReportContext();
    if (!context || !context.data) {
      alert('No report data available to export');
      return;
    }

    // Load jsPDF and autotable from CDN dynamically
    if (!window.jspdf) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    if (!window.jspdf.jsPDF.API.autoTable) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text(context.data.title, 14, 20);
    
    // Add subtitle (date range)
    doc.setFontSize(10);
    doc.text(context.data.subtitle, 14, 28);
    
    // Prepare table data
    const tableData = [
      ...context.data.rows,
      ...context.data.footers
    ];
    
    // Generate table
    doc.autoTable({
      startY: 35,
      head: [context.data.headers],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold'
      },
      footStyles: {
        fillColor: [236, 240, 241],
        textColor: 0,
        fontStyle: 'bold'
      },
      columnStyles: {
        // Right-align numeric columns (adjust based on headers)
        2: { halign: 'right' },
        3: { halign: 'right' }
      },
      didParseCell: function(data) {
        // Make footer rows bold
        if (data.row.index >= context.data.rows.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [236, 240, 241];
        }
      }
    });
    
    // Add footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(
        `Page ${i} of ${pageCount} | Generated: ${new Date().toLocaleString()}`,
        14,
        doc.internal.pageSize.height - 10
      );
    }
    
    // Download
    const filename = getFilename(context, 'pdf');
    doc.save(filename);
    
    console.log('✅ PDF exported successfully');
  } catch (error) {
    console.error('Error exporting PDF:', error);
    alert('Error exporting PDF: ' + error.message);
  }
}

/**
 * Export report as CSV
 */
export function exportReportAsCSV() {
  try {
    const context = getCurrentReportContext();
    if (!context || !context.data) {
      alert('No report data available to export');
      return;
    }
    
    // Build CSV content (RFC 4180 compliant)
    const csvRows = [];
    
    // Add title and subtitle as comments
    csvRows.push(`"${context.data.title}"`);
    csvRows.push(`"${context.data.subtitle}"`);
    csvRows.push(''); // Blank line
    
    // Add headers
    const escapeCSV = (str) => {
      if (typeof str !== 'string') str = String(str);
      // Escape quotes and wrap if contains comma, quote, or newline
      const escaped = str.replace(/"/g, '""');
      return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    };
    
    csvRows.push(context.data.headers.map(escapeCSV).join(','));
    
    // Add data rows
    context.data.rows.forEach(row => {
      csvRows.push(row.map(escapeCSV).join(','));
    });
    
    // Add footer rows (totals)
    context.data.footers.forEach(row => {
      csvRows.push(row.map(escapeCSV).join(','));
    });
    
    const csv = csvRows.join('\n');
    
    // Create blob with UTF-8 BOM for Excel compatibility
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    
    // Download
    const filename = getFilename(context, 'csv');
    downloadFile(filename, blob);
    
    console.log('✅ CSV exported successfully');
  } catch (error) {
    console.error('Error exporting CSV:', error);
    alert('Error exporting CSV: ' + error.message);
  }
}

/**
 * Email report - Opens email modal
 */
export async function emailReport() {
  // Open the email modal instead of using prompt
  if (window.showSendEmailModal) {
    await window.showSendEmailModal();
  } else {
    alert('Email functionality is loading. Please try again in a moment.');
  }
}

/**
 * Print report
 */
export function printReport() {
  try {
    // Trigger browser print dialog
    window.print();
    console.log('✅ Print dialog opened');
  } catch (error) {
    console.error('Error printing report:', error);
    alert('Error printing report: ' + error.message);
  }
}
