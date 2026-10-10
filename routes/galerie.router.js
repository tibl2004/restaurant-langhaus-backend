const express = require("express");
const router = express.Router();

const galerieController = require("../controller/galerie.controller");

// Falls du eine Auth-Middleware hast, hier einbinden und bei
// POST und DELETE davorsetzen, z. B.:
// const { verifyToken } = require("../middleware/auth");

// GET /api/galerie  -> alle Bilder
router.get("/", galerieController.getGalerie);

// POST /api/galerie -> Bilder hochladen (FormData-Feld: "bilder")
router.post(
  "/",
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