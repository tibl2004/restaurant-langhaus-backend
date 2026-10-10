const express = require("express");
const router = express.Router();

const galerieController = require("../controller/galerie.controller");

// Falls du eine Auth-Middleware hast, hier einbinden und bei
// POST und DELETE davorsetzen, z. B.:
// const { verifyToken } = require("../middleware/auth");

// GET /api/galerie  -> alle Bilder
router.get("/", galerieController.getGalerie);

// POST /api/galerie  UND  POST /api/galerie/upload
// -> Bilder hochladen (FormData-Feld: "bilder")
// Beide Pfade funktionieren, damit das Frontend nicht angepasst werden muss.
router.post(
  ["/", "/upload"],
  // verifyToken,
  galerieController.uploadMiddleware,
  galerieController.uploadGalerie
);

// DELETE /api/galerie/:id -> Bild löschen
router.delete(
  "/:id",
  // verifyToken,
  galerieController.deleteGalerie
);

module.exports = router;