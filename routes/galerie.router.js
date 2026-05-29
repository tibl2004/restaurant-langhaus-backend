const express = require("express");
const router = express.Router();
const galerieController = require("../controller/galerie.controller");

// 🔹 Galerie abrufen
router.get(
  "/",
  galerieController.getGalerie
);

// 🔹 Bilder hochladen
// (auth + multer sind bereits im Controller integriert)
router.post(
  "/upload",
  galerieController.uploadGalerieBilder
);

// 🔹 Bild löschen
router.delete(
  "/:id",
  galerieController.deleteGalerieBild
);

module.exports = router;