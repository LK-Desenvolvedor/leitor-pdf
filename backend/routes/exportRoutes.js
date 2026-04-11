const express = require("express");
const router = express.Router();
const exportController = require("../controllers/exportController");
const auth = require("../middleware/auth");

router.post("/txt", auth, exportController.exportTxt);
router.post("/pdf", auth, exportController.exportPdf);
router.post("/docx", auth, exportController.exportDocx);

module.exports = router;