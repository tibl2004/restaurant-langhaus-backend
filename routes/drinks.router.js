const express = require("express");
const router = express.Router();
const drinksController = require("../controller/drinks.controller");

/* =====================================================
   📄 GET GETRÄNKEKARTE
   GET /api/drinks
===================================================== */
router.get(
  "/",
  drinksController.getDrinksMenu
);

/* =====================================================
   📂 KATEGORIE ERSTELLEN
   POST /api/drinks/category
===================================================== */
router.post(
  "/category",
  drinksController.authenticateToken,
  drinksController.createCategory
);

/* =====================================================
   📂 KATEGORIEN LADEN
   GET /api/drinks/categories
===================================================== */
router.get(
  "/categories",
  drinksController.getCategories
);

/* =====================================================
   📂 KATEGORIE UPDATE
   PUT /api/drinks/category/:categoryId
===================================================== */
router.put(
  "/category/:categoryId",
  drinksController.authenticateToken,
  drinksController.updateCategory
);

/* =====================================================
   📂 KATEGORIE LÖSCHEN
   DELETE /api/drinks/category/:categoryId
===================================================== */
router.delete(
  "/category/:categoryId",
  drinksController.authenticateToken,
  drinksController.deleteCategory
);

/* =====================================================
   🍺 GETRÄNK ERSTELLEN
   POST /api/drinks/drink/:categoryId
===================================================== */
router.post(
  "/drink/:categoryId",
  drinksController.authenticateToken,
  drinksController.createDrink
);

/* =====================================================
   🍺 GETRÄNKE NACH KATEGORIE
   GET /api/drinks/drinks/:categoryId
===================================================== */
router.get(
  "/drinks/:categoryId",
  drinksController.getDrinksByCategory
);

/* =====================================================
   🍺 GETRÄNK UPDATE
   PUT /api/drinks/drink/:drinkId
===================================================== */
router.put(
  "/drink/:drinkId",
  drinksController.authenticateToken,
  drinksController.updateDrink
);

/* =====================================================
   🍺 GETRÄNK LÖSCHEN
   DELETE /api/drinks/drink/:drinkId
===================================================== */
router.delete(
  "/drink/:drinkId",
  drinksController.authenticateToken,
  drinksController.deleteDrink
);

module.exports = router;