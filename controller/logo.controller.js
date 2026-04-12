const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken"); // ✅ FIX 1

/* =========================
   AUTH MIDDLEWARE
========================= */
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

    req.user = {
      id: decoded.id,
      username: decoded.username,
      userTypes: decoded.userTypes || []
    };

    next();
  });
};

/* =========================
   MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "_" + Math.round(Math.random() * 1e9);
    cb(null, "logo_" + uniqueSuffix + path.extname(file.originalname));
  },
});

// 🔒 Nur Bilder erlauben (WICHTIG)
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Nur Bilder erlaubt"), false);
    }
    cb(null, true);
  },
});

/* =========================
   CONTROLLER
========================= */
const logoController = {

  // 🔹 Alle Logos
  getAllLogos: async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM logos ORDER BY created_at DESC"
      );

      const logos = rows.map((row) => ({
        id: row.id,
        logoUrl: `${req.protocol}://${req.get("host")}/${row.image}`,
        created_at: row.created_at,
        isActive: row.isActive,
      }));

      res.json(logos);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Logos." });
    }
  },

  // 🔹 Aktives Logo
  getCurrentLogo: async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM logos WHERE isActive = 1 LIMIT 1"
      );

      if (!rows.length) {
        return res.status(404).json({ error: "Kein aktives Logo gefunden." });
      }

      const fullUrl = `${req.protocol}://${req.get("host")}/${rows[0].image}`;
      res.json({ logoUrl: fullUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen." });
    }
  },

  // 🔥 UPLOAD (JETZT SICHER & FUNKTIONIERT)
  uploadLogo: [
    authenticateToken, // ✅ FIX 2
    upload.single("logo"),

    async (req, res) => {
      try {
        // 🔒 ADMIN CHECK
        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admin erlaubt" });
        }

        if (!req.file) {
          return res.status(400).json({ error: "Keine Datei hochgeladen." });
        }

        const logoPath = "uploads/" + req.file.filename;

        // Alte deaktivieren
        await pool.query("UPDATE logos SET isActive = 0");

        // Neues speichern
        await pool.query(
          "INSERT INTO logos (image, isActive, created_at) VALUES (?, 1, NOW())",
          [logoPath]
        );

        const fullUrl = `${req.protocol}://${req.get("host")}/${logoPath}`;

        res.status(201).json({
          message: "Logo erfolgreich hochgeladen",
          logoUrl: fullUrl,
        });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Upload fehlgeschlagen" });
      }
    },
  ],

  uploadMiddleware: upload,
};

module.exports = logoController;