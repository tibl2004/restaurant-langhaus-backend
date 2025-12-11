const express = require("express");
const router = express.Router();

const menuController = require("../controller/menu.controller");

// =====================
//   🔐 JWT AUTH
// =====================
router.use(menuController.authenticateToken);

// =====================
//   📦 Kategorien
// =====================
router.post("/categories", menuController.createCategory);
router.get("/categories", menuController.getAllCategories);
router.put("/categories/:id", menuController.updateCategory);
router.delete("/categories/:id", menuController.deleteCategory);

// =====================
//   🍽️ Gerichte
// =====================
router.post("/items", menuController.createItem);
router.get("/items/:id", menuController.getItem);

// Gerichte für eine Kategorie
router.get("/category/:id/items", menuController.getItemsByCategory);

// Update Gericht
router.put("/items/:id", menuController.updateItem);

// Delete Gericht
router.delete("/items/:id", menuController.deleteItem);

// Sortieren der Gerichte in Kategorie
router.put("/items/reorder/:categoryId", menuController.reorderItems);

// =======================
//   🃏 Karten (Cards)
// =======================

// Karte anlegen (Admin)
router.post("/cards", menuController.createCard);

// Alle aktiven Karten holen
router.get("/cards", menuController.getAllCards);

// Einzelkarte holen + Kategorien + Items
router.get("/cards/:id", menuController.getCardById);

module.exports = router;
