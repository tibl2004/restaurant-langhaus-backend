const pool = require("../database/index");
const jwt = require("jsonwebtoken");


const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Token ungültig" });
    }

    // ✅ FIX: userTypes hinzufügen
    req.user = {
      id: decoded.id,
      username: decoded.username,
      userTypes: decoded.userTypes || []
    };

    next();
  });
};

const menuController = {

  /* =====================================================
     🔐 JWT AUTH
  ===================================================== */


  /* =====================================================
     🆕 KARTEN
  ===================================================== */
  createCard: async (req, res) => {
    const { name, start_date, end_date, include_in_main_menu } = req.body;
    if (!name) return res.status(400).json({ error: "Name erforderlich" });

    const [result] = await pool.query(
      `INSERT INTO menu_card (name, start_date, end_date, include_in_main_menu) 
       VALUES (?, ?, ?, ?)`,
      [name, start_date || null, end_date || null, include_in_main_menu ? 1 : 0]
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
  
    // 👉 Standard-Hinweis für Cordon Bleu
    let hinweis = null;
  
    if (name && name.toLowerCase().includes("cordon")) {
      hinweis = "Alle Cordon Bleu mit Pommes frites und frischem Gemüse. Auch ohne Panade erhältlich. Fleisch nach Wahl: Rindsfilet Fr. 42.00 / Kalb Fr. 41.00 / Schwein Fr. 35.00";
    }
  
    const [result] = await pool.query(
      `INSERT INTO menu_category (menu_card_id, name) VALUES (?, ?)`,
      [cardId, name]
    );
  
    res.json({
      id: result.insertId,
      name,
      hinweis // 👉 wird direkt zurückgegeben
    });
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
  }

};

module.exports = menuController;