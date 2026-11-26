const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET fehlt in der .env-Datei!");
}

// ======================================
// LOGIN LIMITER
// ======================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Zu viele Login-Versuche. Bitte später erneut versuchen."
  }
});

// ======================================
// LOGIN
// ======================================

const login = async (req, res) => {
  try {
    const { username, passwort } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof passwort !== "string" ||
      !username.trim() ||
      !passwort
    ) {
      return res.status(400).json({
        error: "Benutzername und Passwort sind erforderlich."
      });
    }

    const [admins] = await pool.query(
      `SELECT id, username, passwort
       FROM admin
       WHERE username = ?
       LIMIT 1`,
      [username.trim()]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        error: "Benutzername oder Passwort falsch."
      });
    }

    const admin = admins[0];

    const passwordCorrect = await bcrypt.compare(
      passwort,
      admin.passwort
    );

    if (!passwordCorrect) {
      return res.status(401).json({
        error: "Benutzername oder Passwort falsch."
      });
    }

    // ======================================
    // JWT TOKEN ERSTELLEN
    // ======================================

    const user = {
      id: admin.id,
      username: admin.username,
      userTypes: ["admin"]
    };

    const token = jwt.sign(
      user,
      process.env.JWT_SECRET,
      {
        expiresIn: "2h",
        issuer: "restaurant-backend",
        audience: "admin"
      }
    );

    return res.status(200).json({
      message: "Login erfolgreich.",
      token,
      user
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);

    return res.status(500).json({
      error: "Fehler beim Login."
    });
  }
};

module.exports = {
  login,
  loginLimiter
};