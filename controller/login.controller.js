"use strict";

/*
================================================================
 ADMIN LOGIN CONTROLLER (gehärtet)
================================================================

 DB-MIGRATION (einmalig ausführen):

   ALTER TABLE admin
     ADD COLUMN token_version INT NOT NULL DEFAULT 0,
     MODIFY login_attempts INT NOT NULL DEFAULT 0;

 ROUTEN (Beispiel):

   router.post("/login",  login.loginLimiter, login.login);
   router.post("/logout", login.authenticateToken, login.logout);
   router.use("/admin",   login.authenticateToken);   // alle Admin-Routen schützen

 APP-EINSTELLUNGEN (index.js / app.js):

   app.set("trust proxy", 1);                 // wenn hinter nginx/Proxy/Hosting
   app.use(helmet());
   app.use(express.json({ limit: "10kb" }));
   // CORS nur mit eigener Frontend-Domain + credentials: true,
   // wenn Frontend und Backend auf verschiedenen Domains laufen.

 .env:

   JWT_SECRET=<mindestens 32 zufällige Bytes, z. B. node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
   NODE_ENV=production
   # Nur wenn dein Frontend den Token noch aus dem JSON liest (nicht empfohlen):
   # AUTH_LEGACY_BEARER=true
*/

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const pool = require("../database/index");

/*
========================
KONFIGURATION
========================
*/
const IS_PROD = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET) < 32) {
  console.error("JWT_SECRET fehlt oder ist zu kurz (mindestens 32 Zeichen/Bytes)!");
  process.exit(1);
}

const CONFIG = Object.freeze({
  bcryptCost: 12,
  maxAttempts: 5,          // Fehlversuche pro Konto bis zur Sperre
  lockMinutes: 15,         // Dauer der Sperre
  tokenTtlSeconds: 2 * 60 * 60,
  issuer: "restaurant-backend",
  audience: "admin",
  // "__Host-" erzwingt Secure + Path=/ + keine Domain (nur in Produktion über HTTPS möglich)
  cookieName: IS_PROD ? "__Host-admin_token" : "admin_token",
  legacyBearer: process.env.AUTH_LEGACY_BEARER === "true",
});

const GENERIC_LOGIN_ERROR = { error: "Login fehlgeschlagen" };
const GENERIC_AUTH_ERROR = { error: "Nicht autorisiert" };

// Dummy-Hash: bcrypt läuft auch bei unbekanntem Benutzer (gleiche Antwortzeit)
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), CONFIG.bcryptCost);

/*
========================
RATE LIMIT (pro IP)
========================
*/
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Zu viele Login-Versuche. Bitte später erneut versuchen." },
});

/*
========================
HELPER
========================
*/
const logSecurity = (event, req, extra = {}) => {
  // JSON.stringify verhindert Log-Injection (Zeilenumbrüche etc.)
  console.warn(
    JSON.stringify({ ts: new Date().toISOString(), event, ip: req.ip, ...extra })
  );
};

const parseLoginBody = (body) => {
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return null;
  }
  const username = body.username.trim();
  const password = body.password;

  if (username.length < 3 || username.length > 50) return null;
  // bcrypt verarbeitet nur die ersten 72 Bytes
  if (password.length < 1 || Buffer.byteLength(password, "utf8") > 72) return null;

  return { username, password };
};

const parseCookies = (header = "") =>
  header.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      acc[key] = decodeURIComponent(val);
    } catch {
      /* ungültig kodiertes Cookie ignorieren */
    }
    return acc;
  }, {});

const cookieOptions = () => ({
  httpOnly: true,       // nicht per JavaScript lesbar (Schutz vor Token-Diebstahl via XSS)
  secure: IS_PROD,      // nur über HTTPS
  sameSite: "strict",   // Schutz vor CSRF
  path: "/",
});

const extractToken = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[CONFIG.cookieName]) return cookies[CONFIG.cookieName];

  if (CONFIG.legacyBearer) {
    const header = req.headers["authorization"];
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7).trim();
    }
  }
  return null;
};

// Atomar in SQL: kein Race-Condition-Problem bei parallelen Anfragen.
// Hinweis: MySQL wertet SET-Zuweisungen von links nach rechts aus,
// deshalb steht locked_until VOR login_attempts.
const registerFailedAttempt = (adminId) =>
  pool.execute(
    `UPDATE admin SET
       locked_until = IF(COALESCE(login_attempts, 0) + 1 >= ${CONFIG.maxAttempts},
                         DATE_ADD(NOW(), INTERVAL ${CONFIG.lockMinutes} MINUTE),
                         locked_until),
       login_attempts = IF(COALESCE(login_attempts, 0) + 1 >= ${CONFIG.maxAttempts},
                           0,
                           COALESCE(login_attempts, 0) + 1)
     WHERE id = ?`,
    [adminId]
  );

/*
========================
PASSWORT-HELFER (beim Anlegen/Ändern von Admins verwenden)
========================
*/
const validateNewPassword = (password) => {
  if (typeof password !== "string") throw new Error("Passwort ungültig");
  if (password.length < 12) throw new Error("Passwort muss mindestens 12 Zeichen haben");
  if (Buffer.byteLength(password, "utf8") > 72) throw new Error("Passwort ist zu lang (max. 72 Bytes)");
};

const hashPassword = async (password) => {
  validateNewPassword(password);
  return bcrypt.hash(password, CONFIG.bcryptCost);
};

/*
========================
CONTROLLER
========================
*/
const loginController = {
  loginLimiter,
  hashPassword,
  validateNewPassword,

  /*
  ---------- Token prüfen (Middleware) ----------
  */
  authenticateToken: async (req, res, next) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json(GENERIC_AUTH_ERROR);

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET, {
          algorithms: ["HS256"],          // Algorithmus fest vorgeben
          issuer: CONFIG.issuer,
          audience: CONFIG.audience,
        });
      } catch {
        return res.status(401).json(GENERIC_AUTH_ERROR);
      }

      // Konto muss noch existieren und die Token-Version muss passen
      // (Logout / Passwortänderung macht alte Tokens ungültig)
      const [rows] = await pool.execute(
        "SELECT id, username, token_version FROM admin WHERE id = ? LIMIT 1",
        [decoded.sub]
      );
      const admin = rows[0];

      if (!admin || admin.token_version !== decoded.tv) {
        return res.status(401).json(GENERIC_AUTH_ERROR);
      }

      req.user = { id: admin.id, username: admin.username };
      next();
    } catch (err) {
      console.error("Auth Fehler:", err.message);
      res.status(500).json({ error: "Server Fehler" });
    }
  },

  /*
  ---------- Login ----------
  */
  login: async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
      const input = parseLoginBody(req.body);
      if (!input) return res.status(400).json({ error: "Ungültige Eingaben" });

      const { username, password } = input;

      const [rows] = await pool.execute(
        `SELECT id, username, passwort, token_version,
                (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
           FROM admin WHERE username = ? LIMIT 1`,
        [username]
      );
      const admin = rows[0];

      // Immer bcrypt ausführen (auch bei unbekanntem Benutzer oder gesperrtem Konto)
      const passwordOk = await bcrypt.compare(password, admin ? admin.passwort : DUMMY_HASH);

      const locked = !!(admin && Number(admin.is_locked) === 1);

      if (!admin || locked || !passwordOk) {
        if (admin && !locked && !passwordOk) {
          await registerFailedAttempt(admin.id);
        }
        logSecurity("login_failed", req, {
          username,
          reason: !admin ? "unknown_user" : locked ? "locked" : "bad_password",
        });
        // Immer dieselbe Antwort: verrät weder Existenz noch Sperrstatus
        return res.status(401).json(GENERIC_LOGIN_ERROR);
      }

      // Hash bei Bedarf auf aktuellen Kostenfaktor anheben
      let newHash = null;
      if (bcrypt.getRounds(admin.passwort) < CONFIG.bcryptCost) {
        newHash = await bcrypt.hash(password, CONFIG.bcryptCost);
      }

      await pool.execute(
        "UPDATE admin SET login_attempts = 0, locked_until = NULL, passwort = COALESCE(?, passwort) WHERE id = ?",
        [newHash, admin.id]
      );

      const token = jwt.sign(
        { sub: String(admin.id), tv: admin.token_version },
        JWT_SECRET,
        {
          algorithm: "HS256",
          expiresIn: CONFIG.tokenTtlSeconds,
          issuer: CONFIG.issuer,
          audience: CONFIG.audience,
          jwtid: crypto.randomUUID(),
        }
      );

      res.cookie(CONFIG.cookieName, token, {
        ...cookieOptions(),
        maxAge: CONFIG.tokenTtlSeconds * 1000,
      });

      logSecurity("login_success", req, { username });

      const body = { message: "Login erfolgreich" };
      if (CONFIG.legacyBearer) body.token = token; // nur für Übergangszeit
      return res.json(body);
    } catch (err) {
      console.error("Login Fehler:", err.message);
      return res.status(500).json({ error: "Server Fehler" });
    }
  },

  /*
  ---------- Logout (macht alle bisherigen Tokens ungültig) ----------
  */
  logout: async (req, res) => {
    try {
      await pool.execute(
        "UPDATE admin SET token_version = token_version + 1 WHERE id = ?",
        [req.user.id]
      );
      res.clearCookie(CONFIG.cookieName, cookieOptions());
      res.set("Cache-Control", "no-store");
      return res.json({ message: "Abgemeldet" });
    } catch (err) {
      console.error("Logout Fehler:", err.message);
      return res.status(500).json({ error: "Server Fehler" });
    }
  },
};

module.exports = loginController;