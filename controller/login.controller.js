const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");

/*
========================
ENV CHECK
========================
*/
if (!process.env.JWT_SECRET) {
  console.error("⚠️ JWT_SECRET fehlt! Bitte in der .env setzen!");
  process.exit(1);
}

/*
========================
RATE LIMIT (ANTI BRUTEFORCE)
========================
*/
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5, // max 5 Versuche pro IP
  message: { error: "Zu viele Login-Versuche. Bitte später erneut." }
});

/*
========================
HELPER: INPUT VALIDATION
========================
*/
const validateInput = (username, password) => {
  if (
    typeof username !== "string" ||
    typeof password !== "string"
  ) return false;

  if (
    username.length < 3 ||
    username.length > 50 ||
    password.length < 6 ||
    password.length > 100
  ) return false;

  return true;
};

/*
========================
LOGIN CONTROLLER
========================
*/
const loginController = {

  loginLimiter, // 👈 in Route benutzen!

  /*
  ========================
  TOKEN AUTH (JWT)
  ========================
  */
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Nicht autorisiert" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: "Token ungültig" });
      }

      req.user = {
        id: decoded.id,
        username: decoded.username
      };

      next();
    });
  },

  /*
  ========================
  ADMIN LOGIN (SECURE)
  ========================
  */
  login: async (req, res) => {
    try {
      const { username, password } = req.body;

      // 🔒 Input Validation
      if (!validateInput(username, password)) {
        return res.status(400).json({
          error: "Ungültige Eingaben"
        });
      }

      // 🔹 Admin laden
      const [rows] = await pool.query(
        "SELECT id, username, passwort, login_attempts, locked_until FROM admin WHERE username=? LIMIT 1",
        [username]
      );

      if (rows.length === 0) {
        await fakeDelay();
        return res.status(401).json({ error: "Login fehlgeschlagen" });
      }

      const admin = rows[0];

      // 🔒 Account Lock prüfen
      if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
        return res.status(403).json({
          error: "Account vorübergehend gesperrt"
        });
      }

      // 🔹 Passwort prüfen
      const validPassword = await bcrypt.compare(password, admin.passwort);

      if (!validPassword) {
        await handleFailedLogin(admin);
        return res.status(401).json({ error: "Login fehlgeschlagen" });
      }

      // 🔒 Reset Login Attempts
      await pool.query(
        "UPDATE admin SET login_attempts = 0, locked_until = NULL WHERE id=?",
        [admin.id]
      );

      // 🔹 JWT Token
      const token = jwt.sign(
        {
          id: admin.id,
          username: admin.username
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "2h", // kürzer = sicherer
          issuer: "restaurant-backend",
          audience: "admin"
        }
      );

      // 🔒 Token sicherer senden (Cookie statt JSON optional)
      res.json({
        message: "Login erfolgreich",
        token
      });

    } catch (err) {
      console.error("Login Fehler:", err.message);
      res.status(500).json({ error: "Server Fehler" });
    }
  }

};

/*
========================
SECURITY HELPERS
========================
*/

// ⏳ Fake Delay gegen Timing Attacks
const fakeDelay = () =>
  new Promise(resolve => setTimeout(resolve, 500));

// 🚫 Failed Login Handling
const handleFailedLogin = async (admin) => {
  let attempts = (admin.login_attempts || 0) + 1;
  let lockTime = null;

  if (attempts >= 5) {
    lockTime = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
    attempts = 0;
  }

  await pool.query(
    "UPDATE admin SET login_attempts=?, locked_until=? WHERE id=?",
    [attempts, lockTime, admin.id]
  );
};

module.exports = loginController;