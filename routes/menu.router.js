const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const menuController = require("../controller/menu.controller");

// =============================
//  📌 Öffentliche GET-Routen
// =============================

// Alle Kategorien
router.get("/categories", menuController.getAllCategories);

// Items einer Kategorie
router.get("/category/:id/items", menuController.getItemsByCategory);

// Einzelnes Item
router.get("/items/:id", menuController.getItem);

// Aktive Karten
router.get("/cards", menuController.getAllCards);

// Einzelkarte (mit Kategorien + Items)
router.get("/cards/:id", menuController.getCardById);

// =============================
//  📄 PDF ROUTEN (PUBLIC)
// =============================

// PDF abrufen
router.get("/cards/:id/pdf", async (req, res) => {
  try {
    const cardId = req.params.id;

    const filePath = path.join(__dirname, "..", "pdf", "cards", `card_${cardId}.pdf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "PDF nicht gefunden. Bitte zuerst generieren." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=card_${cardId}.pdf`);

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Laden der PDF." });
  }
});

// PDF neu generieren
router.get("/cards/:id/pdf/generate", async (req, res) => {
  try {
    const cardId = req.params.id;

    await menuController.generateCardPDF(cardId);

    res.json({ message: "PDF erfolgreich erstellt." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Generieren der PDF." });
  }
});

// =============================
//  🔐 Ab hier Auth Pflicht
// =============================
router.use(menuController.authenticateToken);

// =============================
//  📦 Kategorien (Admin)
// =============================
router.post("/categories", menuController.createCategory);
router.put("/categories/:id", menuController.updateCategory);
router.delete("/categories/:id", menuController.deleteCategory);

// =============================
//  🍽️ Gerichte (Admin)
// =============================
router.post("/items", menuController.createItem);
router.put("/items/:id", menuController.updateItem);
router.delete("/items/:id", menuController.deleteItem);

// Sortierung Items
router.put("/items/reorder/:categoryId", menuController.reorderItems);

// =============================
//  🃏 Karten (Admin)
// =============================
router.post("/cards", menuController.createCard);

module.exports = router;
