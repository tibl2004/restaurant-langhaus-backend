const express = require("express");
const router = express.Router();
const menuController = require("../controller/menu.controller");

const pool = require("../database/index"); // ✅ FEHLT → JETZT FIX


// 🔐 Middleware für JWT-Auth
const authenticate = menuController.authenticateToken;


// 🔗 Aktuelle PDF-URL einer Karte abrufen
router.get("/cards/:cardId/pdf", async (req, res) => {
  try {
    const { cardId } = req.params;

    const [[card]] = await pool.query(
      `SELECT id, name, pdf_path FROM menu_card WHERE id = ? LIMIT 1`,
      [cardId]
    );

    if (!card || !card.pdf_path) {
      return res.status(404).json({ error: "PDF noch nicht generiert" });
    }

    // 🔥 DAS ist die URL, die du im Browser öffnen kannst
    res.json({
      cardId: card.id,
      name: card.name,
      pdf_url: card.pdf_path
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Abrufen der PDF" });
  }
});


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
