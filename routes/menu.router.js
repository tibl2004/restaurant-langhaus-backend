const express = require("express");
const router = express.Router();
const menuController = require("../controller/menu.controller");

// 🔐 Auth Middleware
const authenticate = menuController.authenticateToken;

// ===============================================
// 🆕 Karten
// ===============================================
router.post("/cards", authenticate, menuController.createCard);           // Karte erstellen
router.get("/cards", menuController.getAllCards);                          // Alle Karten abrufen
router.put("/cards/:cardId", authenticate, menuController.updateCard);    // Karte updaten
router.delete("/cards/:cardId", authenticate, menuController.deleteCard); // Karte löschen

// ===============================================
// 📂 Kategorien
// ===============================================
router.post("/categories", authenticate, menuController.createCategory);  // Kategorie erstellen
router.get("/categories/:id", menuController.getCategoryById);            // Kategorie mit Items abrufen

// ===============================================
// 🍽️ Items
// ===============================================
router.post("/items", authenticate, menuController.createItem);           // Item erstellen (inkl. nummer aus Body)

// ===============================================
// 📄 Speisekarten
// ===============================================
router.get("/speisekarte", menuController.getSpeisekarte);                // Alle Karten mit include_in_main_menu = 1
router.get("/subcard/:cardId", menuController.getSubCardById);           // Einzelne Unterkarte mit Kategorien & Items

module.exports = router;
