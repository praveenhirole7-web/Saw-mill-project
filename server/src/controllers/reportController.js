'use strict';

const PDFDocument = require('pdfkit');
const reportService = require('../services/reportService');
const { ok } = require('../utils/respond');

class ReportController {
  async dashboard(req, res, next) {
    try {
      return ok(res, await reportService.dashboard());
    } catch (err) {
      return next(err);
    }
  }

  async types(req, res, next) {
    try {
      return ok(res, reportService.listTypes());
    } catch (err) {
      return next(err);
    }
  }

  async get(req, res, next) {
    try {
      return ok(res, await reportService.getReport(req.params.type, req.query));
    } catch (err) {
      return next(err);
    }
  }

  async csv(req, res, next) {
    try {
      const file = await reportService.exportCsv(req.params.type, req.query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      return res.status(200).send(file.content);
    } catch (err) {
      return next(err);
    }
  }

  async pdf(req, res, next) {
    try {
      const report = await reportService.getReport(req.params.type, {
        ...req.query,
        limit: 1000,
        offset: 0,
      }, true);
      const filename = `${report.type}-report.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ margin: 42, size: 'A4', layout: 'landscape' });
      doc.on('error', next);
      doc.pipe(res);
      doc.fontSize(18).fillColor('#193826').text(report.title);
      doc.moveDown(0.35).fontSize(9).fillColor('#444444').text(report.description);
      if (req.query.from || req.query.to) {
        doc.moveDown(0.25).text(`Period: ${req.query.from || 'start'} to ${req.query.to || 'today'}`);
      }
      doc.moveDown(0.7);

      const headers = report.columns;
      const left = doc.page.margins.left;
      const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const cellWidth = usableWidth / Math.max(1, headers.length);
      const drawHeader = () => {
        const y = doc.y;
        doc.fontSize(7).fillColor('#ffffff');
        doc.rect(left, y, usableWidth, 22).fill('#193826');
        headers.forEach((header, index) => {
          doc.fillColor('#ffffff').text(header.replaceAll('_', ' '), left + index * cellWidth + 3, y + 6, {
            width: cellWidth - 6,
            height: 14,
            ellipsis: true,
          });
        });
        doc.y = y + 22;
      };
      drawHeader();
      doc.fontSize(7).fillColor('#222222');
      if (!report.items.length) {
        doc.moveDown(0.5).fontSize(10).text('No records match the selected filters.');
      } else {
        for (const [rowIndex, item] of report.items.entries()) {
          const y = doc.y;
          const rowHeight = 25;
          if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            drawHeader();
          }
          const currentY = doc.y;
          if (rowIndex % 2 === 1) {
            doc.rect(left, currentY, usableWidth, rowHeight).fill('#f1f5f2');
          }
          headers.forEach((header, index) => {
            const value = item[header];
            const text = value === null || value === undefined ? '' : String(value);
            doc.fillColor('#222222').text(text, left + index * cellWidth + 3, currentY + 6, {
              width: cellWidth - 6,
              height: 14,
              ellipsis: true,
            });
          });
          doc.y = currentY + rowHeight;
        }
      }
      doc.end();
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ReportController();
