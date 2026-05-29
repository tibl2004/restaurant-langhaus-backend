const express = require("express");
const router = express.Router();
const galerieController = require("../controller/galerie.controller");

/* ================= GET GALERIE ================= */
router.get(
  "/",
  galerieController.getGalerie
);

/* ================= UPLOAD ================= */
router.post(
  "/upload",
  galerieController.uploadGalerieBilder
);

/* ================= DELETE ================= */
router.delete(
  "/:id",
  galerieController.deleteGalerieBild
);

module.exports = router;