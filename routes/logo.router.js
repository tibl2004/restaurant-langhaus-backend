const express = require("express");
const router = express.Router();
const logoController = require("../controller/logo.controller");

// GET Logo
router.get("/", logoController.getLogo);

// POST Logo hochladen
router.post("/", logoController.uploadLogo);

module.exports = router;
