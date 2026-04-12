const express = require("express");
const router = express.Router();
const galerieController = require("../controller/galerie.controller");
const auth = require("../middleware/auth");


// 🔹 Galerie abrufen
router.get(
  "/",
  galerieController.getGalerie
);

// 🔹 Mehrere Bilder hochladen
router.post(
  "/upload",
  auth,
  galerieController.uploadGalerieBilder
);


router.delete(
  "/:id",
  auth,
  galerieController.deleteGalerieBild
);

module.exports = router;
