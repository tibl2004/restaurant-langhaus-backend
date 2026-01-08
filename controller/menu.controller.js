const pool = require("../database/index");
const jwt = require("jsonwebtoken");

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

    const [result] = await pool.query(
      `INSERT INTO menu_card (name, start_date, end_date, include_in_main_menu) VALUES (?, ?, ?, ?)`,
      [name, start_date || null, end_date || null, include_in_main_menu ? 1 : 0]
    );

    res.json({ id: result.insertId, name, start_date, end_date, include_in_main_menu });
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

  getCategoryById: async (req, res) => {
    const { id } = req.params;
    const [[category]] = await pool.query(`SELECT * FROM menu_category WHERE id = ?`, [id]);
    if (!category) return res.status(404).json({ error: "Kategorie nicht gefunden" });

    const [items] = await pool.query(`SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC`, [id]);
    res.json({ ...category, items });
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

  // 📄 Unterkarte einzeln
  getSubCardById: async (req, res) => {
    const { cardId } = req.params;
    try {
      const [[card]] = await pool.query(`SELECT * FROM menu_card WHERE id = ?`, [cardId]);
      if (!card) return res.status(404).json({ error: "Unterkarte nicht gefunden" });

      const [categories] = await pool.query(`SELECT * FROM menu_category WHERE menu_card_id = ? ORDER BY id ASC`, [cardId]);
      for (const cat of categories) {
        const [items] = await pool.query(`SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC`, [cat.id]);
        cat.items = items;
      }

      res.json({ card, categories });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Laden der Unterkarte" });
    }
  }

};

module.exports = menuController;
