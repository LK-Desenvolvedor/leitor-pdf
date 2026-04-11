const mongoose = require("mongoose");

const citationSchema = new mongoose.Schema({
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
  text: {
    type: String,
    required: true
  },
  page: {
    type: Number,
    required: true
  },
  notes: {
    type: String,
    default: ""
  },
  color: {
    type: String,
    default: "yellow"
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

citationSchema.index({ userId: 1, pdfPath: 1 });
citationSchema.index({ userId: 1, createdAt: -1 });

const Citation = mongoose.model("Citation", citationSchema);

module.exports = Citation;
