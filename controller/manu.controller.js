const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const checkAdminVorstand = (user) =>
  user?.userTypes?.some((role) => ["vorstand", "admin"].includes(role));

const menuController = {
  // JWT Auth
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
      if (!checkAdminVorstand(req.user))
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen erstellen." });

      const { name, description } = req.body;
      if (!name) return res.status(400).json({ error: "Name der Kategorie ist Pflicht." });

      const [existing] = await pool.query("SELECT * FROM categories WHERE name=?", [name]);
      if (existing.length > 0) return res.status(400).json({ error: "Kategorie existiert bereits." });

      await pool.query("INSERT INTO categories (name, description) VALUES (?, ?)", [name, description || null]);
      res.status(201).json({ message: "Kategorie erstellt." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Erstellen der Kategorie." });
    }
  },

  getAllCategories: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM categories ORDER BY id ASC");
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Kategorien." });
    }
  },

  updateCategory: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user))
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen aktualisieren." });

      const id = req.params.id;
      const [existing] = await pool.query("SELECT * FROM categories WHERE id=?", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Kategorie nicht gefunden." });

      const { name, description } = req.body;
      await pool.query("UPDATE categories SET name=?, description=? WHERE id=?", [
        name || existing[0].name,
        description !== undefined ? description : existing[0].description,
        id
      ]);
      res.json({ message: "Kategorie aktualisiert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Aktualisieren der Kategorie." });
    }
  },

  deleteCategory: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user))
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen löschen." });

      const id = req.params.id;
      const [existing] = await pool.query("SELECT * FROM categories WHERE id=?", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Kategorie nicht gefunden." });

      await pool.query("DELETE FROM categories WHERE id=?", [id]);
      res.json({ message: "Kategorie gelöscht." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Löschen der Kategorie." });
    }
  },

  // ==================== Gerichte ====================
  createItem: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user))
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen erstellen." });

      const { category_id, number, title, description, price, extras, active_from, active_to } = req.body;
      if (!category_id || !title || !price) return res.status(400).json({ error: "Kategorie, Titel und Preis sind Pflicht." });

      await pool.query(
        `INSERT INTO menu_items 
          (category_id, number, title, description, price, extras, active_from, active_to)
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

      res.status(201).json({ message: "Gericht erstellt." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Erstellen des Gerichts." });
    }
  },

  getItem: async (req, res) => {
    try {
      const id = req.params.id;
      const [rows] = await pool.query("SELECT * FROM menu_items WHERE id=?", [id]);
      if (rows.length === 0) return res.status(404).json({ error: "Gericht nicht gefunden." });

      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen des Gerichts." });
    }
  },

  getItemsByCategory: async (req, res) => {
    try {
      // ID aus URL-Parameter holen
      const categoryId = req.params.id;
  
      const [rows] = await pool.query(
        `SELECT * FROM menu_items 
         WHERE category_id=? 
         AND (active_from IS NULL OR active_from <= NOW()) 
         AND (active_to IS NULL OR active_to >= NOW())
         ORDER BY number ASC`,
        [categoryId]
      );
  
      if (rows.length === 0) return res.status(404).json({ error: "Keine Gerichte für diese Kategorie." });
  
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Gerichte." });
    }
  },  

  updateItem: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user))
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen aktualisieren." });

      const id = req.params.id;
      const [existing] = await pool.query("SELECT * FROM menu_items WHERE id=?", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Gericht nicht gefunden." });

      const current = existing[0];
      const { category_id, number, title, description, price, extras, active_from, active_to } = req.body;

      const updatedValues = [
        category_id !== undefined ? category_id : current.category_id,
        number !== undefined ? number : current.number,
        title !== undefined ? title : current.title,
        description !== undefined ? description : current.description,
        price !== undefined ? price : current.price,
        extras !== undefined ? JSON.stringify(extras) : current.extras,
        active_from !== undefined ? active_from : current.active_from,
        active_to !== undefined ? active_to : current.active_to,
        current.id
      ];

      await pool.query(
        `UPDATE menu_items 
         SET category_id=?, number=?, title=?, description=?, price=?, extras=?, active_from=?, active_to=? 
         WHERE id=?`,
        updatedValues
      );

      res.json({ message: "Gericht aktualisiert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Gerichts." });
    }
  },

  deleteItem: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user))
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen löschen." });

      const id = req.params.id;
      const [existing] = await pool.query("SELECT * FROM menu_items WHERE id=?", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Gericht nicht gefunden." });

      await pool.query("DELETE FROM menu_items WHERE id=?", [id]);
      res.json({ message: "Gericht gelöscht." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Löschen des Gerichts." });
    }
  },

  // ==================== Karten ====================
  createCard: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user))
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen erstellen." });

      const { name, description, start_date, end_date, is_active } = req.body;
      if (!name) return res.status(400).json({ error: "Name der Karte ist Pflicht." });

      await pool.query(
        `INSERT INTO cards (name, description, start_date, end_date, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [name, description || null, start_date || null, end_date || null, is_active ? 1 : 0]
      );

      res.status(201).json({ message: "Karte erstellt." });
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
      const [rows] = await pool.query(
        `SELECT c.*, mi.* 
         FROM card_categories cc
         JOIN categories c ON cc.category_id = c.id
         JOIN menu_items mi ON mi.category_id = c.id
         JOIN cards ca ON cc.card_id = ca.id
         WHERE ca.id=? AND ca.is_active=1 
           AND (ca.start_date IS NULL OR ca.start_date <= NOW()) 
           AND (ca.end_date IS NULL OR ca.end_date >= NOW())
           AND (mi.active_from IS NULL OR mi.active_from <= NOW())
           AND (mi.active_to IS NULL OR mi.active_to >= NOW())
         ORDER BY c.id, mi.number`,
        [cardId]
      );

      if (rows.length === 0) return res.status(404).json({ error: "Karte nicht gefunden oder keine aktiven Gerichte." });

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Karte." });
    }
  }
};

module.exports = menuController;
