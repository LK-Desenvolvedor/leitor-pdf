const Citation = require("../models/Citation");

exports.createCitation = async (req, res) => {
  try {
    const { pdfName, pdfPath, text, page, notes, color } = req.body;
    const userId = req.userId;

    if (!pdfPath || !text || page === undefined) {
      return res.status(400).json({ message: "pdfPath, text e page são obrigatórios" });
    }

    const citation = new Citation({
      userId,
      pdfName,
      pdfPath,
      text,
      page,
      notes: notes || "",
      color: color || "yellow"
    });

    await citation.save();
    res.status(201).json({ message: "Citação criada com sucesso", citation });
  } catch (error) {
    console.error("Erro ao criar citação:", error);
    res.status(500).json({ message: "Erro ao criar citação" });
  }
};

exports.getCitationsByPDF = async (req, res) => {
  try {
    const { pdfPath } = req.params;
    const userId = req.userId;

    if (!pdfPath) {
      return res.status(400).json({ message: "pdfPath é obrigatório" });
    }

    const citations = await Citation.find({ userId, pdfPath }).sort({ page: 1, createdAt: -1 });

    res.status(200).json(citations);
  } catch (error) {
    console.error("Erro ao obter citações:", error);
    res.status(500).json({ message: "Erro ao obter citações" });
  }
};

exports.getAllCitations = async (req, res) => {
  try {
    const userId = req.userId;

    const citations = await Citation.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json(citations);
  } catch (error) {
    console.error("Erro ao obter citações:", error);
    res.status(500).json({ message: "Erro ao obter citações" });
  }
};

exports.updateCitation = async (req, res) => {
  try {
    const { citationId } = req.params;
    const { text, notes, color, page } = req.body;
    const userId = req.userId;

    const citation = await Citation.findOne({ _id: citationId, userId });

    if (!citation) {
      return res.status(404).json({ message: "Citação não encontrada" });
    }

    if (text) citation.text = text;
    if (notes !== undefined) citation.notes = notes;
    if (color) citation.color = color;
    if (page !== undefined) citation.page = page;
    citation.updatedAt = new Date();

    await citation.save();
    res.status(200).json({ message: "Citação atualizada com sucesso", citation });
  } catch (error) {
    console.error("Erro ao atualizar citação:", error);
    res.status(500).json({ message: "Erro ao atualizar citação" });
  }
};

exports.deleteCitation = async (req, res) => {
  try {
    const { citationId } = req.params;
    const userId = req.userId;

    const result = await Citation.findOneAndDelete({ _id: citationId, userId });

    if (!result) {
      return res.status(404).json({ message: "Citação não encontrada" });
    }

    res.status(200).json({ message: "Citação deletada com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar citação:", error);
    res.status(500).json({ message: "Erro ao deletar citação" });
  }
};

exports.deleteCitations = async (req, res) => {
  try {
    const { citationIds } = req.body;
    const userId = req.userId;

    if (!Array.isArray(citationIds) || citationIds.length === 0) {
      return res.status(400).json({ message: "citationIds deve ser um array não vazio" });
    }

    const result = await Citation.deleteMany({ _id: { $in: citationIds }, userId });

    res.status(200).json({ message: `${result.deletedCount} citações deletadas com sucesso` });
  } catch (error) {
    console.error("Erro ao deletar citações:", error);
    res.status(500).json({ message: "Erro ao deletar citações" });
  }
};

exports.getCitationsForExport = async (req, res) => {
  try {
    const { citationIds } = req.body;
    const userId = req.userId;

    if (!Array.isArray(citationIds) || citationIds.length === 0) {
      return res.status(400).json({ message: "citationIds deve ser um array não vazio" });
    }

    const citations = await Citation.find({ _id: { $in: citationIds }, userId }).sort({ page: 1 });

    res.status(200).json(citations);
  } catch (error) {
    console.error("Erro ao obter citações para exportação:", error);
    res.status(500).json({ message: "Erro ao obter citações para exportação" });
  }
};
