const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');

const adminController = {

  // 🔹 JWT Auth
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

  // 🔹 Admin erstellen (nur einmal)
  createAdmin: async (req, res) => {
    try {
      const { username, password, email } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Benutzername und Passwort erforderlich." });

      const [existing] = await pool.query("SELECT * FROM admin LIMIT 1");
      if (existing.length > 0) return res.status(400).json({ error: "Admin existiert bereits." });

      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query("INSERT INTO admin (username, passwort, email) VALUES (?, ?, ?)", [username, hashedPassword, email || null]);

      res.status(201).json({ message: "Admin erfolgreich erstellt." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Erstellen des Admins." });
    }
  },

 

  getProfile: async (req, res) => {
    try {
      const { id } = req.user;
  
      const [rows] = await pool.query(
        "SELECT id, username, email FROM admin WHERE id = ?",
        [id]
      );
  
      if (!rows.length) {
        return res.status(404).json({ error: "Admin nicht gefunden" });
      }
  
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Profil konnte nicht geladen werden" });
    }
  },
  

  // 🔹 Admin Profil aktualisieren
  updateProfile: async (req, res) => {
    try {
      const { id } = req.user;
      const { username, password, email } = req.body;

      const updates = [];
      const params = [];

      if (username) { updates.push("username = ?"); params.push(username); }
      if (password) { 
        const hashed = await bcrypt.hash(password, 10);
        updates.push("passwort = ?"); params.push(hashed);
      }
      if (email) { updates.push("email = ?"); params.push(email); }

      if (updates.length === 0) return res.status(400).json({ error: "Keine Daten zum Aktualisieren." });

      params.push(id);
      await pool.query(`UPDATE admin SET ${updates.join(", ")} WHERE id = ?`, params);

      res.json({ message: "Admin-Profil aktualisiert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Profils." });
    }
  }

};

module.exports = adminController;
