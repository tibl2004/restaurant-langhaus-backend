const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const cron = require("node-cron"); // ← hier hinzufügen

// Ordner für PDFs
// Ordner für automatisierte PDFs (gleicher wie Multer)
const uploadsDir = path.join(__dirname, "../uploads/menu");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const menuController = {

  // 🔐 JWT Auth
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

// 🆕 Karten
createCard: async (req, res) => {
  const { name, start_date, end_date, include_in_main_menu } = req.body;
  if (!name) return res.status(400).json({ error: "Name erforderlich" });

  // pdf_path ist nach name, wird beim Erstellen auf NULL gesetzt
  const [result] = await pool.query(
    `INSERT INTO menu_card (name, pdf_path, start_date, end_date, include_in_main_menu) 
     VALUES (?, ?, ?, ?, ?)`,
    [name, null, start_date || null, end_date || null, include_in_main_menu ? 1 : 0]
  );

  res.json({
    id: result.insertId,
    name,
    start_date,
    end_date,
    include_in_main_menu,
    pdf_path: null // noch kein PDF vorhanden
  });
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
      [name || null, start_date || null, end_date || null, include_in_main_menu !== undefined ? (include_in_main_menu ? 1 : 0) : null, cardId]
    );

    res.json({ success: true });
  },

  deleteCard: async (req, res) => {
    const { cardId } = req.params;
    await pool.query(`DELETE FROM menu_card WHERE id = ?`, [cardId]);
    res.json({ success: true });
  },

 // 📂 Kategorien
createCategory: async (req, res) => {
  const { cardId } = req.params; // Menü-Karten-ID aus URL
  const { name } = req.body;

  if (!cardId || !name) return res.status(400).json({ error: "Card ID und Name erforderlich" });

  const [result] = await pool.query(
    `INSERT INTO menu_category (menu_card_id, name) VALUES (?, ?)`,
    [cardId, name]
  );

  res.json({
    id: result.insertId,
    menu_card_id: cardId,
    name
  });
},



// 🍽️ Items
createItem: async (req, res) => {
  const { categoryId } = req.params; // Kategorie-ID aus URL
  const { name, zutaten, preis, nummer } = req.body;

  if (!categoryId || !name || !preis)
    return res.status(400).json({ error: "Category ID, Name und Preis erforderlich" });

  let itemNumber = nummer;

  // Wenn keine Nummer angegeben wird, automatisch max + 1
  if (itemNumber === undefined || itemNumber === null) {
    const [[{ max }]] = await pool.query(
      `SELECT COALESCE(MAX(nummer), 0) AS max FROM menu_item WHERE category_id = ?`,
      [categoryId]
    );
    itemNumber = max + 1;
  }

  // Item einfügen
  const [result] = await pool.query(
    `INSERT INTO menu_item (category_id, nummer, name, zutaten, preis) VALUES (?, ?, ?, ?, ?)`,
    [categoryId, itemNumber, name, zutaten || "", preis]
  );

  // Rückgabe inkl. nummer
  res.json({
    id: result.insertId,
    category_id: categoryId,
    nummer: itemNumber,
    name,
    zutaten,
    preis,
  });
},

  // 📄 Speisekarte + andere Hauptkarten
getSpeisekarte: async (req, res) => {
  try {
    const menu = [];

    // 1️⃣ Feste Karte "Speisekarte" abrufen
    const [[speisekarte]] = await pool.query(
      `SELECT * FROM menu_card WHERE name = ? LIMIT 1`,
      ["Speisekarte"]
    );

    if (speisekarte) {
      const [categories] = await pool.query(
        `SELECT * FROM menu_category WHERE menu_card_id = ? ORDER BY id ASC`,
        [speisekarte.id]
      );

      for (const cat of categories) {
        const [items] = await pool.query(
          `SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC`,
          [cat.id]
        );
        cat.items = items;
      }

      menu.push({ card: speisekarte, categories });
    }

    // 2️⃣ Alle anderen Karten mit include_in_main_menu = 1 abrufen
    const [otherCards] = await pool.query(
      `SELECT * FROM menu_card WHERE include_in_main_menu = 1 AND name != ? ORDER BY start_date ASC`,
      ["Speisekarte"]
    );

    for (const card of otherCards) {
      const [categories] = await pool.query(
        `SELECT * FROM menu_category WHERE menu_card_id = ? ORDER BY id ASC`,
        [card.id]
      );

      for (const cat of categories) {
        const [items] = await pool.query(
          `SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC`,
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

// 📂 Alle Kategorien einer Karte abrufen
getCategoriesByCardId: async (req, res) => {
  const { cardId } = req.params;

  try {
    // 1️⃣ Prüfen, ob die Karte existiert
    const [[card]] = await pool.query(`SELECT * FROM menu_card WHERE id = ?`, [cardId]);
    if (!card) return res.status(404).json({ error: "Karte nicht gefunden" });

    // 2️⃣ Kategorien abrufen
    const [categories] = await pool.query(
      `SELECT * FROM menu_category WHERE menu_card_id = ? ORDER BY id ASC`,
      [cardId]
    );

    // Optional: Items pro Kategorie mit abrufen
    for (const cat of categories) {
      const [items] = await pool.query(
        `SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC`,
        [cat.id]
      );
      cat.items = items;
    }

    res.json({ card, categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Laden der Kategorien" });
  }
},


// Funktion, die PDF für eine Karte generiert
generatePdfForCard: async (card) => { 
  try {
    // Kategorien und Items abrufen
    const [categories] = await pool.query(
      `SELECT * FROM menu_category WHERE menu_card_id = ? ORDER BY id ASC`,
      [card.id]
    );

    for (const cat of categories) {
      const [items] = await pool.query(
        `SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC`,
        [cat.id]
      );
      cat.items = items;
    }

    // Alten PDF löschen, wenn vorhanden
    if (card.pdf_path) {
      const oldPath = path.join(__dirname, "../", card.pdf_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // PDF-Dateiname, passend zum Multer-Stil
    const fileName =
      "menu_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substring(7) +
      ".pdf";

    const pdfPath = path.join(uploadsDir, fileName);
    const doc = new PDFDocument();

    doc.pipe(fs.createWriteStream(pdfPath));

    doc.fontSize(20).text(`Karte: ${card.name}`, { underline: true });
    doc.moveDown();

    for (const cat of categories) {
      doc.fontSize(16).text(cat.name, { bold: true });
      for (const item of cat.items) {
        doc.fontSize(12).text(`- ${item.name}: ${item.preis}€`);
      }
      doc.moveDown();
    }

    doc.end();

    // Relativer Pfad für DB
    const relativePath = `/uploads/menu/${fileName}`;
    await pool.query(`UPDATE menu_card SET pdf_path = ? WHERE id = ?`, [
      relativePath,
      card.id,
    ]);

    console.log(`✅ PDF für Karte "${card.name}" aktualisiert: ${relativePath}`);
  } catch (err) {
    console.error(`❌ Fehler beim Generieren der PDF für Karte "${card.name}":`, err);
  }
}

};
cron.schedule("*/2 * * * *", async () => { 
    try {
    const [cards] = await pool.query(`SELECT * FROM menu_card`);
    for (const card of cards) {
      await menuController.generatePdfForCard(card); // <-- hier
    }
    console.log("✅ PDFs wurden automatisch aktualisiert");
  } catch (err) {
    console.error("❌ Fehler beim Abrufen der Karten für PDF-Generierung:", err);
  }
});

module.exports = menuController;
