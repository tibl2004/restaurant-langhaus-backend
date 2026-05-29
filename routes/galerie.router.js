const express = require("express");
const router = express.Router();

const galerieController = require("../controller/galerie.controller");

router.get("/", galerieController.getGalerie);

router.post("/upload", galerieController.uploadGalerieBilder);

router.delete("/:id", galerieController.deleteGalerieBild);

module.exports = router;