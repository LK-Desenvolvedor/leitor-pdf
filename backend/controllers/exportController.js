const Citation = require("../models/Citation");
const { exportToTxt, exportToPdf, exportToDocx } = require("../utils/citationExporter");

exports.exportTxt = async (req, res) => {
  try {
    const { citationIds, style, pdfName } = req.body;
    const userId = req.userId;

    if (!Array.isArray(citationIds) || citationIds.length === 0) {
      return res.status(400).json({ message: "citationIds deve ser um array não vazio" });
    }

    const citations = await Citation.find({ _id: { $in: citationIds }, userId }).sort({ page: 1 });

    if (citations.length === 0) {
      return res.status(404).json({ message: "Nenhuma citação encontrada" });
    }

    const content = exportToTxt(citations, style || "ABNT", pdfName || "Citações");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="citacoes_${Date.now()}.txt"`);
    res.send(content);
  } catch (error) {
    console.error("Erro ao exportar para TXT:", error);
    res.status(500).json({ message: "Erro ao exportar para TXT" });
  }
};

exports.exportPdf = async (req, res) => {
  try {
    const { citationIds, style, pdfName } = req.body;
    const userId = req.userId;

    if (!Array.isArray(citationIds) || citationIds.length === 0) {
      return res.status(400).json({ message: "citationIds deve ser um array não vazio" });
    }

    const citations = await Citation.find({ _id: { $in: citationIds }, userId }).sort({ page: 1 });

    if (citations.length === 0) {
      return res.status(404).json({ message: "Nenhuma citação encontrada" });
    }

    const pdfBuffer = await exportToPdf(citations, style || "ABNT", pdfName || "Citações");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="citacoes_${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Erro ao exportar para PDF:", error);
    res.status(500).json({ message: "Erro ao exportar para PDF" });
  }
};

exports.exportDocx = async (req, res) => {
  try {
    const { citationIds, style, pdfName } = req.body;
    const userId = req.userId;

    if (!Array.isArray(citationIds) || citationIds.length === 0) {
      return res.status(400).json({ message: "citationIds deve ser um array não vazio" });
    }

    const citations = await Citation.find({ _id: { $in: citationIds }, userId }).sort({ page: 1 });

    if (citations.length === 0) {
      return res.status(404).json({ message: "Nenhuma citação encontrada" });
    }

    const docxBuffer = await exportToDocx(citations, style || "ABNT", pdfName || "Citações");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="citacoes_${Date.now()}.docx"`);
    res.send(docxBuffer);
  } catch (error) {
    console.error("Erro ao exportar para DOCX:", error);
    res.status(500).json({ message: "Erro ao exportar para DOCX" });
  }
};
