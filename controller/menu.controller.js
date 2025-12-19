const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const menuController = {

  // 🔹 JWT Auth Middleware
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Kein Token bereitgestellt.' });

    jwt.verify(token, 'secretKey', (err, user) => {
      if (err) return res.status(403).json({ error: 'Ungültiger Token.' });
      req.user = user;
      next();
    });
  },

  getFullMenu: async (req, res) => {
    try {
      const [categories] = await pool.query(`
        SELECT *
        FROM menu_category
        WHERE start_date <= CURDATE()
          AND (end_date IS NULL OR end_date >= CURDATE())
        ORDER BY id ASC
      `);
  
      const menu = [];
  
      for (let cat of categories) {
        const [items] = await pool.query(
          'SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC',
          [cat.id]
        );
  
        menu.push({
          id: cat.id,
          name: cat.name,
          mwst: cat.mwst,
          start_date: cat.start_date,
          end_date: cat.end_date,
          items
        });
      }
  
      res.json(menu);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Fehler beim Abrufen des Menüs' });
    }
  },  

  // 🔹 Kategorie nach ID abrufen
  getCategoryById: async (req, res) => {
    const { id } = req.params;
    try {
      const [cat] = await pool.query('SELECT * FROM menu_category WHERE id = ?', [id]);
      if (cat.length === 0) return res.status(404).json({ error: 'Kategorie nicht gefunden' });

      const [items] = await pool.query(
        'SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC',
        [id]
      );

      res.json({ ...cat[0], items });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Fehler beim Abrufen der Kategorie' });
    }
  },

  // 🔹 Kategorie nach Name abrufen
  getCategoryByName: async (req, res) => {
    const { name } = req.params;
    try {
      const [cat] = await pool.query('SELECT * FROM menu_category WHERE name = ?', [name]);
      if (cat.length === 0) return res.status(404).json({ error: 'Kategorie nicht gefunden' });

      const [items] = await pool.query(
        'SELECT * FROM menu_item WHERE category_id = ? ORDER BY nummer ASC',
        [cat[0].id]
      );

      res.json({ ...cat[0], items });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Fehler beim Abrufen der Kategorie' });
    }
  },
// 🔹 Drag & Drop Reihenfolge speichern (categoryId aus params)
reorderItems: async (req, res) => {
  const { categoryId } = req.params;
  const { orderedItemIds } = req.body;

  if (!categoryId || !Array.isArray(orderedItemIds)) {
    return res.status(400).json({ error: "Ungültige Daten" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (let i = 0; i < orderedItemIds.length; i++) {
      await connection.query(
        `
        UPDATE menu_item
        SET nummer = ?
        WHERE id = ? AND category_id = ?
        `,
        [i + 1, orderedItemIds[i], categoryId]
      );
    }

    await connection.commit();
    res.json({ message: "Reihenfolge erfolgreich aktualisiert" });

  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: "Fehler beim Aktualisieren der Reihenfolge" });

  } finally {
    connection.release();
  }
},
  // 🔹 Einzelnes Item nach Nummer abrufen
  getItem: async (req, res) => {
    const { nummer } = req.params;
    try {
      const [items] = await pool.query('SELECT * FROM menu_item WHERE nummer = ?', [nummer]);
      if (items.length === 0) return res.status(404).json({ error: 'Item nicht gefunden' });

      res.json(items[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Fehler beim Abrufen des Items' });
    }
  },

  // 🔹 Neues Item hinzufügen (Admin)
  addItem: async (req, res) => {
    const { nummer, category_id, name, zutaten, preis } = req.body;
    if (!nummer || !category_id || !name || !preis) {
      return res.status(400).json({ error: 'Nummer, Kategorie, Name und Preis erforderlich' });
    }
    try {
      await pool.query(
        'INSERT INTO menu_item (nummer, category_id, name, zutaten, preis) VALUES (?, ?, ?, ?, ?)',
        [nummer, category_id, name, zutaten || '', preis]
      );
      res.json({ message: 'Item erfolgreich hinzugefügt' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Fehler beim Hinzufügen des Items' });
    }
  },

  addCategory: async (req, res) => {
    const { name, mwst, start_date, end_date } = req.body;
  
    if (!name) {
      return res.status(400).json({ error: 'Kategorie-Name erforderlich' });
    }
  
    try {
      const [result] = await pool.query(
        `
        INSERT INTO menu_category (name, mwst, start_date, end_date)
        VALUES (?, ?, ?, ?)
        `,
        [
          name,
          mwst || 8.1,
          start_date || new Date(), // heute wenn leer
          end_date || null           // null = unendlich
        ]
      );
  
      res.json({
        message: 'Kategorie erfolgreich erstellt',
        id: result.insertId
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Fehler beim Hinzufügen der Kategorie' });
    }
  }
  

};

module.exports = menuController;
