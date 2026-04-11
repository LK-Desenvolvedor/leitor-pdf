const mongoose = require("mongoose");

const readingProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  pdfName: {
    type: String,
    required: true
  },
  pdfPath: {
    type: String,
    required: true
  },
  currentPage: {
    type: Number,
    default: 1
  },
  totalPages: {
    type: Number,
    default: 0
  },
  readingMode: {
    type: String,
    enum: ["scroll", "pagination"],
    default: "pagination"
  },
  scrollPosition: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

readingProgressSchema.index({ userId: 1, pdfPath: 1 }, { unique: true });

const ReadingProgress = mongoose.model("ReadingProgress", readingProgressSchema);

module.exports = ReadingProgress;
