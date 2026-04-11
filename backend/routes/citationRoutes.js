const express = require("express");
const router = express.Router();
const citationController = require("../controllers/citationController");
const auth = require("../middleware/auth");

router.post("/create", auth, citationController.createCitation);
router.get("/pdf/:pdfPath", auth, citationController.getCitationsByPDF);
router.get("/", auth, citationController.getAllCitations);
router.put("/:citationId", auth, citationController.updateCitation);
router.delete("/:citationId", auth, citationController.deleteCitation);
router.post("/delete-multiple", auth, citationController.deleteCitations);
router.post("/export-data", auth, citationController.getCitationsForExport);

module.exports = router;