const express = require('express');
const router = express.Router();
const menuController = require('../controller/menu.controller');

// 🔹 Speisekarte
router.get('/', menuController.getFullMenu);

// 🔹 Kategorie nach ID
router.get('/category/id/:id', menuController.getCategoryById);

// 🔹 Kategorie nach Name
router.get('/category/name/:name', menuController.getCategoryByName);

// 🔹 Einzelnes Item
router.get('/item/:nummer', menuController.getItem);

// 🔹 Admin-Routen (JWT)
router.post('/category', menuController.authenticateToken, menuController.addCategory);
router.post('/item', menuController.authenticateToken, menuController.addItem);

module.exports = router;
