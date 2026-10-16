const express = require("express");
const router = express.Router();

const galerieController = require("../controller/galerie.controller");
const auth = require("../middleware/auth");

// Galerie öffentlich abrufen
router.get(
    "/",
    galerieController.getGalerie
);

// Bilddaten aus der Datenbank ausliefern
router.get(
    "/:id/bild",
    galerieController.getGalerieBild
);

// Bilder hochladen – nur mit Authentifizierung
router.post(
    "/",
    auth,
    galerieController.uploadMiddleware,
    galerieController.uploadGalerie
);

// Bilder löschen – nur mit Authentifizierung
router.delete(
    "/:id",
    auth,
    galerieController.deleteGalerie
);

module.exports = router;