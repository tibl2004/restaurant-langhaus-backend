const express = require("express");
const router = express.Router();
const homeController = require("../controller/home.controller");
const auth = require("../middleware/auth.js");


// 🔹 Home-Content abrufen (GET) – öffentlich
router.get("/", homeController.getHomeContent);

// 🔹 Home-Content aktualisieren (PUT) – Admin / Vorstand
router.put("/", auth, homeController.updateHomeContent);

module.exports = router;
