const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");

// 🔹 Multer Speicher
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads/home");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, "home_" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// 🔹 Token Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Kein Token bereitgestellt." });

  jwt.verify(token, "secretKey", (err, user) => {
    if (err) return res.status(403).json({ error: "Ungültiger Token." });
    req.user = user;
    next();
  });
};

const homeController = {
  authenticateToken,

  // 🔹 Home Content abrufen
  getHomeContent: async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT id, bild, willkommen_text, willkommen_link FROM home_content ORDER BY id DESC LIMIT 1"
      );

      if (!rows.length) return res.status(404).json({ error: "Kein Home-Inhalt gefunden." });

      const content = rows[0];
      const fullUrl = content.bild ? `${req.protocol}://${req.get("host")}/${content.bild}` : null;

      res.status(200).json({
        id: content.id,
        bild: fullUrl,
        willkommenText: content.willkommen_text,
        willkommenLink: content.willkommen_link,
      });
    } catch (err) {
      console.error("Fehler beim Abrufen des Home-Contents:", err);
      res.status(500).json({ error: "Fehler beim Abrufen des Home-Contents." });
    }
  },

  // 🔹 Home Content erstellen
  createHomeContent: [
    upload.single("bild"),
    async (req, res) => {
      try {
        const { userTypes } = req.user;
        if (!userTypes || !userTypes.includes("vorstand")) {
          return res.status(403).json({ error: "Nur Vorstände dürfen Inhalte erstellen." });
        }

        const { willkommenText, willkommenLink } = req.body;
        if (!req.file || !willkommenText || !willkommenLink) {
          return res.status(400).json({ error: "Bild, Text und Link sind erforderlich." });
        }

        // Prüfen, ob bereits ein Eintrag existiert
        const [existing] = await pool.query("SELECT id FROM home_content LIMIT 1");
        if (existing.length > 0) {
          return res.status(400).json({ error: "Home-Content existiert bereits. Bitte UPDATE verwenden." });
        }

        const bildPath = "uploads/" + req.file.filename;
        await pool.query(
          "INSERT INTO home_content (bild, willkommen_text, willkommen_link) VALUES (?, ?, ?)",
          [bildPath, willkommenText, willkommenLink]
        );

        const fullUrl = `${req.protocol}://${req.get("host")}/${bildPath}`;
        res.status(201).json({ message: "Home-Content erstellt.", bild: fullUrl });
      } catch (err) {
        console.error("Fehler beim Erstellen des Home-Contents:", err);
        res.status(500).json({ error: "Fehler beim Erstellen des Home-Contents." });
      }
    },
  ],

  // 🔹 Home Content aktualisieren
  updateHomeContent: [
    upload.single("bild"),
    async (req, res) => {
      try {
        const { userTypes } = req.user;
        if (!userTypes || !userTypes.includes("vorstand")) {
          return res.status(403).json({ error: "Nur Vorstände dürfen Inhalte aktualisieren." });
        }

        const { willkommenText, willkommenLink } = req.body;
        if (!req.file && (!willkommenText || !willkommenLink)) {
          return res.status(400).json({ error: "Mindestens ein Feld muss aktualisiert werden." });
        }

        // Prüfen, ob ein Eintrag existiert
        const [existing] = await pool.query("SELECT id, bild FROM home_content LIMIT 1");
        if (!existing.length) {
          return res.status(400).json({ error: "Kein Home-Content vorhanden. Bitte CREATE verwenden." });
        }

        let bildPath = existing[0].bild;
        if (req.file) bildPath = "uploads/" + req.file.filename;

        await pool.query(
          "UPDATE home_content SET bild = ?, willkommen_text = ?, willkommen_link = ?, aktualisiert_am = NOW() WHERE id = ?",
          [bildPath, willkommenText, willkommenLink, existing[0].id]
        );

        const fullUrl = `${req.protocol}://${req.get("host")}/${bildPath}`;
        res.status(200).json({ message: "Home-Content aktualisiert.", bild: fullUrl });
      } catch (err) {
        console.error("Fehler beim Aktualisieren des Home-Contents:", err);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Home-Contents." });
      }
    },
  ],

  uploadMiddleware: upload,
};

module.exports = homeController;
