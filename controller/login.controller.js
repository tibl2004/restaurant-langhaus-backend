const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

/*
========================
ENV CHECK
========================
*/

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET fehlt!");
  process.exit(1);
}

const loginController = {

  /*
  ========================
  TOKEN AUTH
  ========================
  */

  authenticateToken: (req, res, next) => {

    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        error: "Kein Token bereitgestellt"
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {

      if (err) {
        return res.status(403).json({
          error: "Token ungültig"
        });
      }

      req.user = user;
      next();

    });

  },

  /*
  ========================
  ADMIN LOGIN
  ========================
  */

  login: async (req, res) => {

    try {

      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          error: "Benutzername und Passwort erforderlich"
        });
      }

      const [rows] = await pool.query(
        "SELECT id, username, passwort FROM admin WHERE username=? LIMIT 1",
        [username]
      );

      if (rows.length === 0) {
        return res.status(401).json({
          error: "Login fehlgeschlagen"
        });
      }

      const admin = rows[0];

      const validPassword = await bcrypt.compare(password, admin.passwort);

      if (!validPassword) {
        return res.status(401).json({
          error: "Login fehlgeschlagen"
        });
      }

      /*
      ========================
      JWT TOKEN
      ========================
      */

      const token = jwt.sign(
        {
          id: admin.id,
          username: admin.username,
          userTypes: ["admin"]   // 👈 wichtig für deine Admin-Prüfung
        },
        process.env.JWT_SECRET,
        {
          expiresIn: process.env.JWT_EXPIRES || "8h",
          issuer: "restaurant-backend"
        }
      );

      res.json({
        message: "Login erfolgreich",
        token
      });

    } catch (err) {

      console.error("Login Fehler:", err);

      res.status(500).json({
        error: "Server Fehler beim Login"
      });

    }

  }

};

module.exports = loginController;