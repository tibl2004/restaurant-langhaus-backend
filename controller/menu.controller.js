const pool = require("../database/index");
const jwt = require("jsonwebtoken");


// =====================================================
// 🔐 AUTH MIDDLEWARE (SIMPEL & STABIL)
// =====================================================
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    req.user.userTypes = req.user.userTypes || [];
    next();
  } catch (err) {
    return res.status(403).json({ error: "Token ungültig" });
  }
};


// =====================================================
// 🧾 HELPER (Cordon Bleu Hinweis)
// =====================================================
const cordonHinweis =
  "Alle Cordon Bleu mit Pommes frites und frischem Gemüse. Auch ohne Panade erhältlich. Fleisch nach Wahl: Rindsfilet Fr. 42.00 / Kalb Fr. 41.00 / Schwein Fr. 35.00";


// =====================================================
// 📦 CONTROLLER
// =====================================================
const menuController = {

  // =====================================================
  // 🆕 CARDS
  // =====================================================
  createCard: async (req, res) => {
    const { name, start_date, end_date, include_in_main_menu } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name erforderlich" });
    }

    const [result] = await pool.query(
      `INSERT INTO menu_card (name, start_date, end_date, include_in_main_menu)
       VALUES (?, ?, ?, ?)`,
      [name, start_date || null, end_date || null, include_in_main_menu ? 1 : 0]
    );

    res.json({ id: result.insertId, name });
  },

  getAllCards: async (req, res) => {
    const [cards] = await pool.query(
      `SELECT * FROM menu_card ORDER BY start_date ASC`
    );
    res.json(cards);
  },

  updateCard: async (req, res) => {
    const { cardId } = req.params;
    const { name, start_date, end_date, include_in_main_menu } = req.body;

    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push("name = ?");
      values.push(name);
    }

    if (start_date !== undefined) {
      fields.push("start_date = ?");
      values.push(start_date);
    }

    if (end_date !== undefined) {
      fields.push("end_date = ?");
      values.push(end_date);
    }

    if (include_in_main_menu !== undefined) {
      fields.push("include_in_main_menu = ?");
      values.push(include_in_main_menu ? 1 : 0);
    }

    if (fields.length === 0) {
      return res.json({ success: true });
    }

    values.push(cardId);

    await pool.query(
      `UPDATE menu_card SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    res.json({ success: true });
  },

  deleteCard: async (req, res) => {
    const { cardId } = req.params;

    await pool.query(`DELETE FROM menu_card WHERE id = ?`, [cardId]);

    res.json({ success: true });
  },


  // =====================================================
  // 📂 CATEGORIES
  // =====================================================
  createCategory: async (req, res) => {
    const { cardId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name erforderlich" });
    }

    const [result] = await pool.query(
      `INSERT INTO menu_category (menu_card_id, name) VALUES (?, ?)`,
      [cardId, name]
    );

    const hinweis =
      name.toLowerCase().includes("cordon") ? cordonHinweis : null;

    res.json({
      id: result.insertId,
      name,
      hinweis
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


  // =====================================================
  // 🍽 ITEMS
  // =====================================================
  createItem: async (req, res) => {
    const { categoryId } = req.params;
    const { name, zutaten, preis, nummer } = req.body;

    if (!name || !preis) {
      return res.status(400).json({ error: "Name und Preis erforderlich" });
    }

    let itemNumber = nummer;

    if (!itemNumber) {
      const [[row]] = await pool.query(
        `SELECT COALESCE(MAX(nummer), 0) AS maxNum FROM menu_item WHERE category_id = ?`,
        [categoryId]
      );

      itemNumber = row.maxNum + 1;
    }

    const [result] = await pool.query(
      `INSERT INTO menu_item (category_id, nummer, name, zutaten, preis)
       VALUES (?, ?, ?, ?, ?)`,
      [categoryId, itemNumber, name, zutaten || "", preis]
    );

    res.json({
      id: result.insertId,
      nummer: itemNumber
    });
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

    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push("name = ?");
      values.push(name);
    }

    if (zutaten !== undefined) {
      fields.push("zutaten = ?");
      values.push(zutaten);
    }

    if (preis !== undefined) {
      fields.push("preis = ?");
      values.push(preis);
    }

    if (nummer !== undefined) {
      fields.push("nummer = ?");
      values.push(nummer);
    }

    if (fields.length === 0) {
      return res.json({ success: true });
    }

    values.push(itemId);

    await pool.query(
      `UPDATE menu_item SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    res.json({ success: true });
  },

  deleteItem: async (req, res) => {
    const { itemId } = req.params;

    await pool.query(`DELETE FROM menu_item WHERE id = ?`, [itemId]);

    res.json({ success: true });
  },


  // =====================================================
  // 📄 MAIN MENU
  // =====================================================
  getSpeisekarte: async (req, res) => {
    try {
      const menu = [];

      const [cards] = await pool.query(
        `SELECT * FROM menu_card
         WHERE include_in_main_menu = 1
         ORDER BY start_date ASC`
      );

      for (const card of cards) {
        const [categories] = await pool.query(
          `SELECT * FROM menu_category
           WHERE menu_card_id = ?
           ORDER BY id`,
          [card.id]
        );

        for (const cat of categories) {
          const [items] = await pool.query(
            `SELECT * FROM menu_item
             WHERE category_id = ?
             ORDER BY nummer`,
            [cat.id]
          );

          if (cat.name?.toLowerCase().includes("cordon")) {
            cat.hinweis = cordonHinweis;
          }

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

module.exports = { menuController, authenticateToken };