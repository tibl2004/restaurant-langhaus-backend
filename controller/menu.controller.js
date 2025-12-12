const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const generateCardPDF = require("../utils/generateCardPDF.js");
const fs = require("fs");
const path = require("path");

// Admin-Check
const checkAdmin = (user) => user?.userTypes?.some((role) => ["admin"].includes(role));

const menuController = {
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Kein Token bereitgestellt." });

    jwt.verify(token, "secretKey", (err, user) => {
      if (err) return res.status(403).json({ error: "Ungültiger Token." });
      req.user = user;
      next();
    });
  },

  // ==================== Kategorien ====================
  createCategory: async (req, res) => {
    try {
      if (!checkAdmin(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen erstellen." });

      const { name, description, card_id } = req.body;
      if (!name) return res.status(400).json({ error: "Name der Kategorie ist Pflicht." });

      const [existing] = await pool.query("SELECT * FROM categories WHERE name=?", [name]);
      if (existing.length > 0) return res.status(400).json({ error: "Kategorie existiert bereits." });

      const [result] = await pool.query(
        "INSERT INTO categories (name, description) VALUES (?, ?)",
        [name, description || null]
      );

      if (card_id) await menuController.generateCardPDF(card_id);
      res.status(201).json({ message: "Kategorie erstellt.", categoryId: result.insertId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Erstellen der Kategorie." });
    }
  },

  updateCategory: async (req, res) => {
    try {
      if (!checkAdmin(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen aktualisieren." });

      const id = req.params.id;
      const { name, description, card_id } = req.body;

      const [existing] = await pool.query("SELECT * FROM categories WHERE id=?", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Kategorie nicht gefunden." });

      await pool.query(
        "UPDATE categories SET name=?, description=? WHERE id=?",
        [name || existing[0].name, description ?? existing[0].description, id]
      );

      if (card_id) await menuController.generateCardPDF(card_id);
      res.json({ message: "Kategorie aktualisiert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Aktualisieren der Kategorie." });
    }
  },

  deleteCategory: async (req, res) => {
    try {
      if (!checkAdmin(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen löschen." });

      const id = req.params.id;
      const { card_id } = req.body;

      const [existing] = await pool.query("SELECT * FROM categories WHERE id=?", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Kategorie nicht gefunden." });

      await pool.query("DELETE FROM categories WHERE id=?", [id]);
      if (card_id) await menuController.generateCardPDF(card_id);
      res.json({ message: "Kategorie gelöscht." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Löschen der Kategorie." });
    }
  },

  // ==================== Gerichte ====================
  createItem: async (req, res) => {
    try {
      if (!checkAdmin(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen erstellen." });

      const { category_id, number, title, description, price, extras, active_from, active_to, card_id } = req.body;
      if (!category_id || !title || !price)
        return res.status(400).json({ error: "Kategorie, Titel und Preis sind Pflicht." });

      const [result] = await pool.query(
        `INSERT INTO menu_items (category_id, number, title, description, price, extras, active_from, active_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          category_id,
          number || null,
          title,
          description || null,
          price,
          extras ? JSON.stringify(extras) : null,
          active_from || null,
          active_to || null
        ]
      );

      if (card_id) await menuController.generateCardPDF(card_id);
      res.status(201).json({ message: "Gericht erstellt.", itemId: result.insertId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Erstellen des Gerichts." });
    }
  },

  updateItem: async (req, res) => {
    try {
      if (!checkAdmin(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen aktualisieren." });

      const id = req.params.id;
      const { category_id, number, title, description, price, extras, active_from, active_to, card_id } = req.body;

      const [existing] = await pool.query("SELECT * FROM menu_items WHERE id=?", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Gericht nicht gefunden." });

      const current = existing[0];
      await pool.query(
        `UPDATE menu_items SET category_id=?, number=?, title=?, description=?, price=?, extras=?, active_from=?, active_to=? WHERE id=?`,
        [
          category_id ?? current.category_id,
          number ?? current.number,
          title ?? current.title,
          description ?? current.description,
          price ?? current.price,
          extras ? JSON.stringify(extras) : current.extras,
          active_from ?? current.active_from,
          active_to ?? current.active_to,
          id
        ]
      );

      if (card_id) await menuController.generateCardPDF(card_id);
      res.json({ message: "Gericht aktualisiert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Gerichts." });
    }
  },

  deleteItem: async (req, res) => {
    try {
      if (!checkAdmin(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen löschen." });

      const id = req.params.id;
      const { card_id } = req.body;

      const [existing] = await pool.query("SELECT * FROM menu_items WHERE id=?", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Gericht nicht gefunden." });

      await pool.query("DELETE FROM menu_items WHERE id=?", [id]);
      if (card_id) await menuController.generateCardPDF(card_id);
      res.json({ message: "Gericht gelöscht." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Löschen des Gerichts." });
    }
  },

  // ==================== Karten ====================
  createCard: async (req, res) => {
    try {
      if (!checkAdmin(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen erstellen." });

      const { name, description, start_date, end_date, is_active, unendlich } = req.body;
      if (!name) return res.status(400).json({ error: "Name der Karte ist Pflicht." });

      const finalEndDate = unendlich ? null : end_date || null;

      const [result] = await pool.query(
        `INSERT INTO cards (name, description, start_date, end_date, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [name, description || null, start_date || null, finalEndDate, is_active ? 1 : 0]
      );

      const newCardId = result.insertId;
      await menuController.generateCardPDF(newCardId);

      res.status(201).json({ message: "Karte erstellt und PDF gespeichert.", cardId: newCardId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Erstellen der Karte." });
    }
  },

  getAllCards: async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM cards
         WHERE is_active=1 AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())
         ORDER BY id ASC`
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Karten." });
    }
  },

  getCardById: async (req, res) => {
    try {
      const cardId = req.params.id;
      const [card] = await pool.query("SELECT * FROM cards WHERE id=?", [cardId]);
      if (!card.length) return res.status(404).json({ error: "Karte nicht gefunden." });

      const [items] = await pool.query(
        `SELECT c.id AS catId, c.name AS catName, mi.title, mi.price, mi.description
         FROM card_categories cc
         JOIN categories c ON cc.category_id = c.id
         LEFT JOIN menu_items mi ON mi.category_id = c.id
         WHERE cc.card_id=?`,
        [cardId]
      );

      res.json({ card: card[0], items });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Karte." });
    }
  },

  // ==================== PDF ====================
  generateCardPDF: async (cardId) => {
    try {
      if (!cardId) return;

      const pdfDir = path.join(__dirname, "../pdf/cards");
      if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

      const [cardRows] = await pool.query(
        `SELECT ca.name AS cardName, c.id AS catId, c.name AS catName, mi.title, mi.price, mi.description
         FROM card_categories cc
         JOIN categories c ON cc.category_id = c.id
         LEFT JOIN menu_items mi ON mi.category_id = c.id
         JOIN cards ca ON cc.card_id = ca.id
         WHERE ca.id=?`,
        [cardId]
      );

      const cardName = cardRows[0]?.cardName || "Karte";
      const categoriesWithItems = [];
      const catMap = {};

      cardRows.forEach((row) => {
        if (!catMap[row.catId]) {
          catMap[row.catId] = { name: row.catName, items: [] };
          categoriesWithItems.push(catMap[row.catId]);
        }
        if (row.title) catMap[row.catId].items.push({ title: row.title, price: row.price, description: row.description });
      });

      await generateCardPDF(cardId, cardName, categoriesWithItems);

    } catch (err) {
      console.error("Fehler beim Erstellen der PDF:", err);
    }
  },

  // ==================== AUTO PDF EVERY 10 SECONDS ====================
  autoGenerateAllPDFs: async () => {
    try {
      const [cards] = await pool.query("SELECT id FROM cards");
      for (const card of cards) {
        await menuController.generateCardPDF(card.id);
      }
      console.log("Alle PDFs automatisch aktualisiert");
    } catch (err) {
      console.error("Fehler bei automatischer PDF-Aktualisierung:", err);
    }
  }
};

// Starte Timer automatisch beim Laden des Controllers
setInterval(() => {
  menuController.autoGenerateAllPDFs();
}, 10000); // alle 10 Sekunden

module.exports = menuController;
