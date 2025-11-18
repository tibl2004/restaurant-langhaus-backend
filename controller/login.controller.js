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



  // 🔹 Admin Login
  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich.' });

      const [rows] = await pool.query("SELECT * FROM admin WHERE username = ?", [username]);
      if (rows.length === 0) return res.status(404).json({ error: 'Admin nicht gefunden.' });

      const admin = rows[0];
      const valid = await bcrypt.compare(password, admin.passwort);
      if (!valid) return res.status(401).json({ error: 'Falsches Passwort.' });

      const token = jwt.sign({ id: admin.id, username: admin.username, userTypes: ["admin"] }, "secretKey", { expiresIn: "8h" });

      res.json({ message: "Login erfolgreich", token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Login." });
    }
  },

 

};

module.exports = adminController;
