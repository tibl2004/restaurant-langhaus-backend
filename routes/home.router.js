const express = require("express");
const router = express.Router();
const homeController = require("../controller/home.controller");

// 🔒 GET Home-Content
router.get("/", homeController.getHomeContent);

// 🔒 POST Home-Content erstellen (Admins)
router.post(
  "/",
  homeController.authenticateToken,
  homeController.uploadMiddleware.single("bild"),
  homeController.createHomeContent[1] // Create-Funktion
);

// 🔒 PUT Home-Content aktualisieren (Admins + Vorstände)
router.put(
  "/",
  homeController.authenticateToken,
  homeController.uploadMiddleware.single("bild"),
  homeController.updateHomeContent[1] // Update-Funktion
);

// 🔒 DELETE Home-Content (Vorstände)
router.delete(
  "/",
  homeController.authenticateToken,
  homeController.deleteHomeContent
);

module.exports = router;
