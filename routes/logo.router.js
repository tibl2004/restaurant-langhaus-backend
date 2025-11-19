const express = require("express");
const router = express.Router();
const logoController = require("../controller/logo.controller");

// Alle Logos abrufen
router.get("/all", logoController.getAllLogos);

// Aktuelles Logo abrufen
router.get("/", logoController.getCurrentLogo);

// Neues Logo hochladen
router.post("/", logoController.uploadLogo);

module.exports = router;
