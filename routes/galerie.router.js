const express = require("express");
const router = express.Router();
const galerieController = require("../controller/galerie.controller");

// 🔹 Galerie abrufen
router.get(
  "/",
  galerieController.getGalerie
);

// 🔹 Mehrere Bilder hochladen
router.post(
  "/upload",
  galerieController.authenticateToken,
  galerieController.uploadGalerieBilder
);

// 🔹 Einzelnes Bild löschen
router.delete(
  "/:id",
  galerieController.authenticateToken,
  galerieController.deleteGalerieBild
);

module.exports = router;
