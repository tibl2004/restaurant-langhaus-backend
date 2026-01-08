const express = require("express");
const router = express.Router();
const menuController = require("../controller/menu.controller");

// 🔐 Middleware für JWT-Auth
const authenticate = menuController.authenticateToken;

// =====================
// Karten (menu_card)
// =====================

// Alle Karten abrufen
router.get("/cards", menuController.getAllCards);

// Karte erstellen
router.post("/cards", authenticate, menuController.createCard);

// Karte aktualisieren
router.put("/cards/:cardId", authenticate, menuController.updateCard);

// Karte löschen
router.delete("/cards/:cardId", authenticate, menuController.deleteCard);

// Unterkarte einzeln abrufen
router.get("/cards/:cardId", menuController.getSubCardById);

// =====================
// Kategorien (menu_category)
// =====================

// Kategorie erstellen (cardId aus params)
router.post("/cards/:cardId/categories", authenticate, menuController.createCategory);

// Einzelne Kategorie inkl. Items abrufen
router.get("/categories/:id", menuController.getCategoryById);

// =====================
// Items (menu_item)
// =====================

// Item erstellen (categoryId aus params)
router.post("/categories/:categoryId/items", authenticate, menuController.createItem);

// =====================
// Speisekarte + andere Hauptkarten
// =====================

// Feste Karte "Speisekarte" + weitere Hauptkarten
router.get("/speisekarte", menuController.getSpeisekarte);

module.exports = router;
