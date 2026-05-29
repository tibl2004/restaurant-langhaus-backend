const express = require("express");
const router = express.Router();

const {
  menuController,
  authenticateToken
} = require("../controller/menu.controller");


// =====================================================
// 🔐 AUTH (optional für geschützte Routes)
// =====================================================


// =====================================================
// 📦 CARDS
// =====================================================
router.post("/cards", authenticateToken, menuController.createCard);
router.get("/cards", menuController.getAllCards);
router.put("/cards/:cardId", authenticateToken, menuController.updateCard);
router.delete("/cards/:cardId", authenticateToken, menuController.deleteCard);


// =====================================================
// 📂 CATEGORIES
// =====================================================
router.post("/categories/:cardId", authenticateToken, menuController.createCategory);
router.get("/categories/:cardId", menuController.getCategoriesByCard);


// =====================================================
// 🍽 ITEMS
// =====================================================
router.post("/items/:categoryId", authenticateToken, menuController.createItem);
router.get("/items/:categoryId", menuController.getItemsByCategory);
router.put("/items/:itemId", authenticateToken, menuController.updateItem);
router.delete("/items/:itemId", authenticateToken, menuController.deleteItem);


// =====================================================
// 📄 MAIN MENU
// =====================================================
router.get("/speisekarte", menuController.getSpeisekarte);


module.exports = router;