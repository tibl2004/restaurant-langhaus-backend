const express = require("express");
const path = require("path");
const router = express.Router();

const pool = require("../database/index");
const menuController = require("../controller/menu.controller");
const auth = require("../middleware/auth");

// Kartenliste für die dynamische Navigation
router.get("/cards", menuController.getAllCards);
router.post("/cards", auth, menuController.createCard);
router.put("/cards/:cardId", auth, menuController.updateCard);
router.delete("/cards/:cardId", auth, menuController.deleteCard);

// Kategorien
router.post("/cards/:cardId/categories", auth, menuController.createCategory);
router.get("/cards/:cardId/categories", menuController.getCategoriesByCard);

// Gerichte
router.post("/categories/:categoryId/items", auth, menuController.createItem);
router.get("/categories/:categoryId/items", menuController.getItemsByCategory);
router.put("/items/:itemId", auth, menuController.updateItem);
router.delete("/items/:itemId", auth, menuController.deleteItem);

// Hauptspeisekarte
router.get("/main-menu", menuController.getSpeisekarte);

// PDF wird bei jedem Aufruf neu aus der Datenbank erstellt.
router.get("/cards/:cardId/pdf", async (req, res, next) => {
  try {
    const cardId = Number(req.params.cardId);
    if (!Number.isInteger(cardId) || cardId <= 0) {
      return res.status(400).json({ error: "Ungültige Karten-ID" });
    }

    const [cards] = await pool.query(
      "SELECT * FROM menu_card WHERE id = ? LIMIT 1",
      [cardId]
    );
    if (!cards.length) {
      return res.status(404).json({ error: "Karte nicht gefunden" });
    }

    const pdfPath = await menuController.generatePdfForCard(cards[0]);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", "application/pdf");

    return res.sendFile(path.resolve(pdfPath), {
      headers: {
        "Content-Disposition": `inline; filename="langhaus-karte-${cardId}.pdf"`
      }
    }, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (error) {
    next(error);
  }
});

// Geschützte Admin-Funktion: PDF bewusst neu generieren
router.post("/cards/:cardId/pdf", auth, async (req, res, next) => {
  try {
    const cardId = Number(req.params.cardId);
    const [cards] = await pool.query(
      "SELECT * FROM menu_card WHERE id = ? LIMIT 1",
      [cardId]
    );
    if (!cards.length) {
      return res.status(404).json({ error: "Karte nicht gefunden" });
    }

    const pdfPath = await menuController.generatePdfForCard(cards[0]);
    return res.json({
      success: true,
      message: "PDF wurde aktualisiert",
      fileName: path.basename(pdfPath)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
