const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const cron = require("node-cron");

// 📂 Ordner für PDFs
const uploadsDir = path.join(__dirname, "../uploads/menu");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const menuController = {

  /* =====================================================
     🔐 JWT AUTH
  ===================================================== */
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Kein Token" });

    jwt.verify(token, "secretKey", (err, user) => {
      if (err) return res.status(403).json({ error: "Ungültiger Token" });
      req.user = user;
      next();
    });
  },

  /* =====================================================
     🆕 KARTEN
  ===================================================== */
  createCard: async (req, res) => {
    const { name, start_date, end_date, include_in_main_menu } = req.body;
    if (!name) return res.status(400).json({ error: "Name erforderlich" });

    const [result] = await pool.query(
      `INSERT INTO menu_card (name, pdf_path, start_date, end_date, include_in_main_menu) 
       VALUES (?, ?, ?, ?, ?)`,
      [name, null, start_date || null, end_date || null, include_in_main_menu ? 1 : 0]
    );

    res.json({ id: result.insertId, name });
  },

  getAllCards: async (req, res) => {
    const [cards] = await pool.query(`SELECT * FROM menu_card ORDER BY start_date ASC`);
    res.json(cards);
  },

  updateCard: async (req, res) => {
    const { cardId } = req.params;
    const { name, start_date, end_date, include_in_main_menu } = req.body;

    await pool.query(
      `UPDATE menu_card SET 
        name = COALESCE(?, name),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        include_in_main_menu = COALESCE(?, include_in_main_menu)
      WHERE id = ?`,
      [name || null, start_date || null, end_date || null,
       include_in_main_menu !== undefined ? (include_in_main_menu ? 1 : 0) : null, cardId]
    );

    res.json({ success: true });
  },

  deleteCard: async (req, res) => {
    const { cardId } = req.params;
    await pool.query(`DELETE FROM menu_card WHERE id = ?`, [cardId]);
    res.json({ success: true });
  },

  /* =====================================================
     📂 KATEGORIEN
  ===================================================== */
  createCategory: async (req, res) => {
    const { cardId } = req.params;
    const { name } = req.body;

    const [result] = await pool.query(
      `INSERT INTO menu_category (menu_card_id, name) VALUES (?, ?)`,
      [cardId, name]
    );

    res.json({ id: result.insertId, name });
  },

  getCategoriesByCard: async (req, res) => {
    const { cardId } = req.params;
    const [categories] = await pool.query(
      `SELECT * FROM menu_category WHERE menu_card_id = ? ORDER BY id`,
      [cardId]
    );
    res.json(categories);
  },

  /* =====================================================
     🍽️ ITEMS
  ===================================================== */
  createItem: async (req, res) => {
    const { categoryId } = req.params;
    const { name, zutaten, preis, nummer } = req.body;

    if (!categoryId || !name || !preis)
      return res.status(400).json({ error: "Category ID, Name und Preis erforderlich" });

    let itemNumber = nummer;
    if (itemNumber === undefined || itemNumber === null) {
      const [[{ max }]] = await pool.query(
        `SELECT COALESCE(MAX(nummer), 0) AS max FROM menu_item WHERE category_id = ?`,
        [categoryId]
      );
      itemNumber = max + 1;
    }

    const [result] = await pool.query(
      `INSERT INTO menu_item (category_id, nummer, name, zutaten, preis) VALUES (?, ?, ?, ?, ?)`,
      [categoryId, itemNumber, name, zutaten || "", preis]
    );

    res.json({ id: result.insertId, nummer: itemNumber });
  },

  getItemsByCategory: async (req, res) => {
    const { categoryId } = req.params;
    const [items] = await pool.query(
      `SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer`,
      [categoryId]
    );
    res.json(items);
  },

  updateItem: async (req, res) => {
    const { itemId } = req.params;
    const { name, zutaten, preis, nummer } = req.body;

    await pool.query(
      `UPDATE menu_item SET 
        name = COALESCE(?, name),
        zutaten = COALESCE(?, zutaten),
        preis = COALESCE(?, preis),
        nummer = COALESCE(?, nummer)
      WHERE id = ?`,
      [name || null, zutaten || null, preis || null, nummer || null, itemId]
    );

    res.json({ success: true });
  },

  deleteItem: async (req, res) => {
    const { itemId } = req.params;
    await pool.query(`DELETE FROM menu_item WHERE id = ?`, [itemId]);
    res.json({ success: true });
  },

  /* =====================================================
     📄 HAUPTSPEISEKARTE
  ===================================================== */
  getSpeisekarte: async (req, res) => {
    try {
      const menu = [];
      // Nur Karten, die include_in_main_menu=1 haben
      const [cards] = await pool.query(
        `SELECT * FROM menu_card WHERE include_in_main_menu = 1 ORDER BY start_date ASC`
      );

      for (const card of cards) {
        const [categories] = await pool.query(
          `SELECT * FROM menu_category WHERE menu_card_id = ? ORDER BY id`,
          [card.id]
        );

        for (const cat of categories) {
          const [items] = await pool.query(
            `SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer`,
            [cat.id]
          );
          cat.items = items;
        }

        menu.push({ card, categories });
      }

      res.json(menu);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Laden der Speisekarte" });
    }
  },

  /* =====================================================
     📄 PDF GENERIEREN
  ===================================================== */
  generatePdfForCard: async (card) => {
    try {
      // prüfen ob Änderungen vorhanden
      const [[check]] = await pool.query(`
        SELECT 
          GREATEST(
            IFNULL((SELECT MAX(updated_at) FROM menu_card WHERE id=?), '1970-01-01'),
            IFNULL((SELECT MAX(updated_at) FROM menu_category WHERE menu_card_id=?), '1970-01-01'),
            IFNULL((SELECT MAX(updated_at) FROM menu_item 
              WHERE category_id IN (
                SELECT id FROM menu_category WHERE menu_card_id=?
              )), '1970-01-01')
          ) AS last_change,
          last_generated_at
        FROM menu_card WHERE id=?`,
        [card.id, card.id, card.id, card.id]
      );

      if (check.last_generated_at &&
          new Date(check.last_change) <= new Date(check.last_generated_at)) {
        console.log(`⏭️ Keine Änderungen für ${card.name}`);
        return;
      }

      // Daten laden
      const [categories] = await pool.query(
        `SELECT * FROM menu_category WHERE menu_card_id = ? ORDER BY id`,
        [card.id]
      );

      for (const cat of categories) {
        const [items] = await pool.query(
          `SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer`,
          [cat.id]
        );
        cat.items = items;
      }

      // alten PDF löschen
      if (card.pdf_path) {
        const oldPath = path.join(__dirname, "../", card.pdf_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // PDF erstellen
      const fileName = `menu_card_${card.id}.pdf`;
      const pdfPath = path.join(uploadsDir, fileName);

      const doc = new PDFDocument({ margin: 40 });
      doc.pipe(fs.createWriteStream(pdfPath));

      doc.fontSize(22).text(card.name, { align: "center" });
      doc.moveDown();

      for (const cat of categories) {
        doc.fontSize(16).text(cat.name, { underline: true });
        doc.moveDown(0.5);

        for (const item of cat.items) {
          doc.fontSize(12).text(
            `${item.nummer}. ${item.name} .......... Fr. ${Number(item.preis).toFixed(2)}`
          );
          if (item.zutaten) {
            doc.fontSize(9).fillColor("gray").text(item.zutaten);
            doc.fillColor("black");
          }
        }
        doc.moveDown();
      }

      doc.end();

      const relativePath = `/uploads/menu/${fileName}`;
      await pool.query(
        `UPDATE menu_card SET pdf_path=?, last_generated_at=NOW() WHERE id=?`,
        [relativePath, card.id]
      );

      console.log(`✅ PDF aktualisiert: ${card.name}`);

    } catch (err) {
      console.error("❌ PDF Fehler:", err);
    }
  }
};

/* =====================================================
   🕒 CRONJOB: PDFs prüfen
===================================================== */
cron.schedule("*/5 * * * *", async () => {
  try {
    const [cards] = await pool.query(`SELECT * FROM menu_card`);
    for (const card of cards) {
      await menuController.generatePdfForCard(card);
    }
    console.log("🕒 PDF Check abgeschlossen");
  } catch (err) {
    console.error("❌ Cron Fehler:", err);
  }
});

module.exports = menuController;