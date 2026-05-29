// routes/galerie.router.js

const express = require("express");
const router = express.Router();

const galerieController = require("../controller/galerie.controller");

/*
====================================
GALERIE LADEN
GET /api/galerie
====================================
*/

router.get(
  "/",
  galerieController.getGalerie
);

/*
====================================
BILDER UPLOAD
POST /api/galerie/upload
====================================
*/

router.post(
  "/upload",
  galerieController.uploadGalerieBilder
);

/*
====================================
BILD LÖSCHEN
DELETE /api/galerie/:id
====================================
*/

router.delete(
  "/:id",
  galerieController.deleteGalerieBild
);

module.exports = router;