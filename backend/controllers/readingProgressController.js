const ReadingProgress = require("../models/ReadingProgress");
exports.saveProgress = async (req, res) => {
  try {
    const { pdfName, pdfPath, currentPage, totalPages, readingMode, scrollPosition } = req.body;
    const userId = req.userId;

    if (!pdfPath) {
      return res.status(400).json({ message: "pdfPath é obrigatório" });
    }

    let progress = await ReadingProgress.findOne({ userId, pdfPath });

    if (progress) {
      progress.currentPage = currentPage || progress.currentPage;
      progress.totalPages = totalPages || progress.totalPages;
      progress.readingMode = readingMode || progress.readingMode;
      progress.scrollPosition = scrollPosition !== undefined ? scrollPosition : progress.scrollPosition;
      progress.lastUpdated = new Date();
    } else {
      progress = new ReadingProgress({
        userId,
        pdfName,
        pdfPath,
        currentPage: currentPage || 1,
        totalPages: totalPages || 0,
        readingMode: readingMode || "pagination",
        scrollPosition: scrollPosition || 0
      });
    }

    await progress.save();
    res.status(200).json({ message: "Progresso salvo com sucesso", progress });
  } catch (error) {
    console.error("Erro ao salvar progresso:", error);
    res.status(500).json({ message: "Erro ao salvar progresso de leitura" });
  }
};

exports.getProgress = async (req, res) => {
  try {
    const { pdfPath } = req.params;
    const userId = req.userId;

    if (!pdfPath) {
      return res.status(400).json({ message: "pdfPath é obrigatório" });
    }

    const progress = await ReadingProgress.findOne({ userId, pdfPath });

    if (!progress) {
      return res.status(404).json({ message: "Progresso não encontrado" });
    }

    res.status(200).json(progress);
  } catch (error) {
    console.error("Erro ao obter progresso:", error);
    res.status(500).json({ message: "Erro ao obter progresso de leitura" });
  }
};

exports.getAllProgress = async (req, res) => {
  try {
    const userId = req.userId;

    const progressList = await ReadingProgress.find({ userId }).sort({ lastUpdated: -1 });

    res.status(200).json(progressList);
  } catch (error) {
    console.error("Erro ao obter progressos:", error);
    res.status(500).json({ message: "Erro ao obter progressos de leitura" });
  }
};

exports.deleteProgress = async (req, res) => {
  try {
    const { pdfPath } = req.params;
    const userId = req.userId;

    const result = await ReadingProgress.findOneAndDelete({ userId, pdfPath });

    if (!result) {
      return res.status(404).json({ message: "Progresso não encontrado" });
    }

    res.status(200).json({ message: "Progresso deletado com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar progresso:", error);
    res.status(500).json({ message: "Erro ao deletar progresso de leitura" });
  }
};
