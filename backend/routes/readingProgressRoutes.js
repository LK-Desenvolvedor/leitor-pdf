const express = require("express");
const router = express.Router();
const readingProgressController = require("../controllers/readingProgressController");
const auth = require("../middleware/auth");

router.post("/save", auth, readingProgressController.saveProgress);
router.get("/:pdfPath", auth, readingProgressController.getProgress);
router.get("/", auth, readingProgressController.getAllProgress);
router.delete("/:pdfPath", auth, readingProgressController.deleteProgress);

module.exports = router;