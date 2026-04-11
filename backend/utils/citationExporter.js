const PDFDocument = require("pdfkit");
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");
const fs = require("fs");
const path = require("path");
const citationStyles = {
  ABNT: (citation, index) => {
    return `${index + 1}. "${citation.text}"\n   Página: ${citation.page}\n   ${citation.notes ? `Nota: ${citation.notes}\n` : ""}\n`;
  },
  APA: (citation, index) => {
    return `(${index + 1}) "${citation.text}" (p. ${citation.page})\n${citation.notes ? `   Nota: ${citation.notes}\n` : ""}\n`;
  },
  Vancouver: (citation, index) => {
    return `[${index + 1}] "${citation.text}" p. ${citation.page}. ${citation.notes ? `Nota: ${citation.notes}` : ""}\n`;
  },
  MLA: (citation, index) => {
    return `"${citation.text}" (${citation.page}). ${citation.notes ? `Nota: ${citation.notes}` : ""}\n`;
  },
  Chicago: (citation, index) => {
    return `${index + 1}. "${citation.text}" página ${citation.page}.\n${citation.notes ? `   Nota: ${citation.notes}\n` : ""}\n`;
  },
  IEEE: (citation, index) => {
    return `[${index + 1}] "${citation.text}," p. ${citation.page}. ${citation.notes ? `Nota: ${citation.notes}` : ""}\n`;
  }
};

function exportToTxt(citations, style = "ABNT", pdfName = "Citações") {
  let content = `CITAÇÕES - ${pdfName}\n`;
  content += `Estilo: ${style}\n`;
  content += `Data: ${new Date().toLocaleString("pt-BR")}\n`;
  content += `${"=".repeat(60)}\n\n`;

  const formatter = citationStyles[style] || citationStyles.ABNT;

  citations.forEach((citation, index) => {
    content += formatter(citation, index);
  });

  return content;
}

async function exportToPdf(citations, style = "ABNT", pdfName = "Citações") {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      doc.fontSize(16).font("Helvetica-Bold").text("CITAÇÕES", { align: "center" });
      doc.fontSize(12).font("Helvetica").text(`Livro: ${pdfName}`, { align: "center" });
      doc.fontSize(10).text(`Estilo: ${style}`, { align: "center" });
      doc.fontSize(9).text(`Data: ${new Date().toLocaleString("pt-BR")}`, { align: "center" });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      const formatter = citationStyles[style] || citationStyles.ABNT;

      citations.forEach((citation, index) => {
        const text = formatter(citation, index);
        doc.fontSize(10).text(text, { align: "left" });
        doc.moveDown(0.5);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function exportToDocx(citations, style = "ABNT", pdfName = "Citações") {
  const paragraphs = [];

  paragraphs.push(
    new Paragraph({
      text: "CITAÇÕES",
      heading: HeadingLevel.HEADING_1,
      alignment: "center"
    })
  );

  paragraphs.push(
    new Paragraph({
      text: `Livro: ${pdfName}`,
      alignment: "center"
    })
  );

  paragraphs.push(
    new Paragraph({
      text: `Estilo: ${style}`,
      alignment: "center"
    })
  );

  paragraphs.push(
    new Paragraph({
      text: `Data: ${new Date().toLocaleString("pt-BR")}`,
      alignment: "center"
    })
  );

  paragraphs.push(new Paragraph({ text: "" }));

  const formatter = citationStyles[style] || citationStyles.ABNT;

  citations.forEach((citation, index) => {
    const text = formatter(citation, index);
    paragraphs.push(
      new Paragraph({
        text: text,
        spacing: { line: 240, after: 200 }
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        children: paragraphs
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

module.exports = {
  exportToTxt,
  exportToPdf,
  exportToDocx,
  citationStyles
};
