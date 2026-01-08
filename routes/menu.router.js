const express = require("express");
const router = express.Router();
const menuController = require("../controller/menu.controller");

// 🔐 Auth
const authenticate = menuController.authenticateToken;

// 🆕 Karten-Routen
router.post("/cards", authenticate, menuController.createCard);           // Karte erstellen
router.get("/cards", menuController.getAllCards);                          // Alle Karten
router.put("/cards/:cardId", authenticate, menuController.updateCard);    // Karte updaten
router.delete("/cards/:cardId", authenticate, menuController.deleteCard); // Karte löschen

// 📂 Kategorien-Routen
router.post("/categories", authenticate, menuController.createCategory);  // Kategorie erstellen
router.get("/categories/:id", menuController.getCategoryById);            // Kategorie mit Items

// 🍽️ Items-Routen
router.post("/items", authenticate, menuController.createItem);           // Item erstellen

// 📄 Speisekarten-Routen
router.get("/speisekarte", menuController.getSpeisekarte);                // Hauptkarte
router.get("/subcard/:cardId", menuController.getSubCardById);           // Unterkarte

module.exports = router;
