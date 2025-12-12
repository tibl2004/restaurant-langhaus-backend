const express = require("express");
const router = express.Router();

const menuController = require("../controller/menu.controller");

// =====================
router.get("/categories", menuController.getAllCategories);
router.get("/category/:id/items", menuController.getItemsByCategory);
router.get("/items/:id", menuController.getItem);

// Alle aktiven Karten holen
router.get("/cards", menuController.getAllCards);

// Einzelkarte holen + Kategorien + Items
router.get("/cards/:id", menuController.getCardById);
// Gerichte für eine Kategorie
router.get("/category/:id/items", menuController.getItemsByCategory);


//   🔐 JWT AUTH
// =====================
router.use(menuController.authenticateToken);

// =====================
//   📦 Kategorien
// =====================
router.post("/categories", menuController.createCategory);
router.put("/categories/:id", menuController.updateCategory);
router.delete("/categories/:id", menuController.deleteCategory);

// =====================
//   🍽️ Gerichte
// =====================
router.post("/items", menuController.createItem);


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


module.exports = router;
