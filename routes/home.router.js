const express = require("express");
const router = express.Router();
const homeController = require("../controller/home.controller");



// 🔹 Home-Content abrufen (GET) – öffentlich
router.get("/", homeController.getHomeContent);

// 🔹 Home-Content aktualisieren (PUT) – Admin / Vorstand
router.put("/", authenticate, homeController.updateHomeContent);

module.exports = router;
