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


// =====================
// Kategorien (menu_category)
// =====================

// Kategorie erstellen (cardId aus params)
router.post("/cards/:cardId/categories", authenticate, menuController.createCategory);

// Alle Kategorien + Items einer Karte abrufen (NEU!)
router.get("/card/:cardId/categories", menuController.getCategoriesByCardId);
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
