const express = require("express");
const router = express.Router();
const menuController = require("../controller/menu.controller");

// 🔐 JWT Middleware
const auth = menuController.authenticateToken;

/* =====================================================
   🆕 KARTEN
===================================================== */
// Karte erstellen
router.post("/cards", auth, menuController.createCard);

// Alle Karten abrufen
router.get("/cards", menuController.getAllCards);

// Karte updaten
router.put("/cards/:cardId", auth, menuController.updateCard);

// Karte löschen
router.delete("/cards/:cardId", auth, menuController.deleteCard);

/* =====================================================
   📂 KATEGORIEN
===================================================== */
// Kategorie erstellen
router.post("/cards/:cardId/categories", auth, menuController.createCategory);

// Kategorien einer Karte abrufen (optional)
router.get("/cards/:cardId/categories", menuController.getCategoriesByCard);

/* =====================================================
   🍽️ ITEMS
===================================================== */
// Item erstellen
router.post("/categories/:categoryId/items", auth, menuController.createItem);

// Items einer Kategorie abrufen (optional)
router.get("/categories/:categoryId/items", menuController.getItemsByCategory);

// Item updaten
router.put("/items/:itemId", auth, menuController.updateItem);

// Item löschen
router.delete("/items/:itemId", auth, menuController.deleteItem);

/* =====================================================
   📄 HAUPTSPEISEKARTE
===================================================== */
// Alle Karten + Kategorien + Items für Hauptspeisekarte
router.get("/main-menu", menuController.getSpeisekarte);

/* =====================================================
   📄 PDF GENERIERUNG
===================================================== */
// PDF für eine bestimmte Karte erstellen (Admin)
router.post("/cards/:cardId/pdf", auth, async (req, res) => {
  try {
    const [cards] = await pool.query(`SELECT * FROM menu_card WHERE id = ?`, [req.params.cardId]);
    if (!cards.length) return res.status(404).json({ error: "Karte nicht gefunden" });

    await menuController.generatePdfForCard(cards[0]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PDF Generierung fehlgeschlagen" });
  }
});

module.exports = router;