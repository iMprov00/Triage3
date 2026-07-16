import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CellHookData } from "jspdf-autotable";

export type PdfKeyValue = { label: string; value: string };

export type PdfSection =
  | { type: "keyValue"; heading: string; items: PdfKeyValue[] }
  | { type: "table"; heading: string; headers: string[]; rows: string[][] }
  | { type: "text"; heading: string; lines: string[] };

export type HospitalPdfOptions = {
  institutionName?: string;
  documentTitle: string;
  subtitle?: string;
  patientRows: PdfKeyValue[];
  sections: PdfSection[];
};

const INSTITUTION_NAME = 'КГБУЗ "АККПЦ"';
const FONT_REGULAR = "DejaVuSans";
const FONT_BOLD = "DejaVuSans-Bold";
const MARGIN = 14;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

let fontDataPromise: Promise<{ regular: string; bold: string }> | null = null;

function loadFontData(): Promise<{ regular: string; bold: string }> {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all([
      fetch("/fonts/DejaVuSans.ttf").then((r) => r.arrayBuffer()),
      fetch("/fonts/DejaVuSans-Bold.ttf").then((r) => r.arrayBuffer()),
    ]).then(([regular, bold]) => ({
      regular: arrayBufferToBase64(regular),
      bold: arrayBufferToBase64(bold),
    }));
  }
  return fontDataPromise;
}

async function ensureFonts(doc: jsPDF): Promise<void> {
  const { regular, bold } = await loadFontData();
  doc.addFileToVFS("DejaVuSans.ttf", regular);
  doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
  doc.addFont("DejaVuSans.ttf", FONT_REGULAR, "normal");
  doc.addFont("DejaVuSans-Bold.ttf", FONT_BOLD, "normal");
}

function applyCellFont(data: CellHookData): void {
  if (data.section === "head" || data.column.index === 0) {
    data.cell.styles.font = FONT_BOLD;
  } else {
    data.cell.styles.font = FONT_REGULAR;
  }
  data.cell.styles.fontStyle = "normal";
}

function baseTableOptions(startY: number) {
  return {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid" as const,
    styles: {
      font: FONT_REGULAR,
      fontStyle: "normal" as const,
      fontSize: 9,
      cellPadding: 2,
      lineColor: [120, 120, 120] as [number, number, number],
      lineWidth: 0.2,
      textColor: [20, 20, 20] as [number, number, number],
      overflow: "linebreak" as const,
    },
    headStyles: {
      font: FONT_BOLD,
      fontStyle: "normal" as const,
      fillColor: [240, 244, 248] as [number, number, number],
      textColor: [30, 30, 30] as [number, number, number],
    },
    didParseCell: applyCellFont,
  };
}

function setRegular(doc: jsPDF, size: number): void {
  doc.setFont(FONT_REGULAR, "normal");
  doc.setFontSize(size);
}

function setBold(doc: jsPDF, size: number): void {
  doc.setFont(FONT_BOLD, "normal");
  doc.setFontSize(size);
}

function drawHeader(doc: jsPDF, opts: HospitalPdfOptions, y: number): number {
  const institution = opts.institutionName || INSTITUTION_NAME;
  setBold(doc, 11);
  doc.text(institution, PAGE_W / 2, y, { align: "center" });
  y += 6;

  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 7;

  setBold(doc, 13);
  doc.text(opts.documentTitle, PAGE_W / 2, y, { align: "center" });
  y += 6;

  if (opts.subtitle) {
    setRegular(doc, 10);
    doc.text(opts.subtitle, PAGE_W / 2, y, { align: "center" });
    y += 5;
  }

  setRegular(doc, 9);
  const formedAt = new Date().toLocaleString("ru-RU");
  doc.text(`Дата формирования: ${formedAt}`, PAGE_W - MARGIN, y, { align: "right" });
  y += 8;

  setBold(doc, 10);
  doc.text("Данные пациента", MARGIN, y);
  y += 4;

  autoTable(doc, {
    ...baseTableOptions(y),
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: CONTENT_W - 52 },
    },
    body: opts.patientRows.map((row) => [row.label, row.value]),
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  return y;
}

function drawSectionHeading(doc: jsPDF, heading: string, y: number): number {
  setBold(doc, 10);
  doc.text(heading, MARGIN, y);
  y += 2;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 5;
}

function drawFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const footerY = 285;
    setRegular(doc, 8);
    doc.setTextColor(90, 90, 90);
    doc.text(`Стр. ${i} из ${pageCount}`, PAGE_W - MARGIN, footerY, { align: "right" });
    doc.setTextColor(20, 20, 20);

    if (i === pageCount) {
      setRegular(doc, 9);
      doc.text(
        "Врач _______________________________________     Медсестра ____________________________________",
        MARGIN,
        footerY - 10,
      );
    }
  }
}

export async function openHospitalPdf(opts: HospitalPdfOptions): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await ensureFonts(doc);

  let y = MARGIN + 4;
  y = drawHeader(doc, opts, y);

  for (const section of opts.sections) {
    if (y > 250) {
      doc.addPage();
      y = MARGIN;
    }
    y = drawSectionHeading(doc, section.heading, y);

    if (section.type === "keyValue") {
      autoTable(doc, {
        ...baseTableOptions(y),
        columnStyles: {
          0: { cellWidth: 58 },
          1: { cellWidth: CONTENT_W - 58 },
        },
        body: section.items.map((item) => [item.label, item.value]),
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    } else if (section.type === "table") {
      autoTable(doc, {
        ...baseTableOptions(y),
        head: [section.headers],
        body: section.rows.length > 0 ? section.rows : [["—", "—"]],
        styles: {
          ...baseTableOptions(y).styles,
          fontSize: 8.5,
        },
        headStyles: {
          ...baseTableOptions(y).headStyles,
          fontSize: 9,
        },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    } else {
      setRegular(doc, 9);
      for (const line of section.lines) {
        if (y > 275) {
          doc.addPage();
          y = MARGIN;
        }
        const wrapped = doc.splitTextToSize(line, CONTENT_W) as string[];
        doc.text(wrapped, MARGIN, y);
        y += wrapped.length * 4.5 + 1;
      }
      y += 4;
    }
  }

  drawFooter(doc);

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `triage-report-${Date.now()}.pdf`;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
