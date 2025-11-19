const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

// 🔹 Multer Speicher konfigurieren
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads"); // Persistenter Ordner
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Eindeutiger Dateiname, um Überschreiben zu vermeiden
    const uniqueSuffix = Date.now() + "_" + Math.round(Math.random() * 1e9);
    cb(null, "logo_" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const logoController = {
  // 🔹 Alle Logos abrufen
  getAllLogos: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM logos ORDER BY created_at DESC");
      if (!rows.length) return res.status(404).json({ error: "Keine Logos gefunden." });

      // Volle URL erzeugen
      const logos = rows.map((row) => ({
        id: row.id,
        logoUrl: `${req.protocol}://${req.get("host")}/${row.image}`,
        created_at: row.created_at,
        isActive: row.isActive,
      }));

      res.json(logos);
    } catch (err) {
      console.error("Fehler beim Abrufen der Logos:", err);
      res.status(500).json({ error: "Fehler beim Abrufen der Logos." });
    }
  },

  // 🔹 Aktuelles Logo abrufen (isActive = 1)
  getCurrentLogo: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM logos WHERE isActive = 1 LIMIT 1");
      if (!rows.length) return res.status(404).json({ error: "Kein aktives Logo gefunden." });

      const logoPath = rows[0].image;
      const fullUrl = `${req.protocol}://${req.get("host")}/${logoPath}`;
      res.json({ logoUrl: fullUrl });
    } catch (err) {
      console.error("Fehler beim Abrufen des aktuellen Logos:", err);
      res.status(500).json({ error: "Fehler beim Abrufen des aktuellen Logos." });
    }
  },

  // 🔹 Neues Logo hochladen
  uploadLogo: [
    upload.single("logo"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Keine Datei hochgeladen." });

        const logoPath = "uploads/" + req.file.filename;

        // Optional: Alle Logos auf inaktiv setzen
        await pool.query("UPDATE logos SET isActive = 0");

        // Neues Logo einfügen und als aktiv markieren
        await pool.query("INSERT INTO logos (image, isActive, created_at) VALUES (?, 1, NOW())", [logoPath]);

        const fullUrl = `${req.protocol}://${req.get("host")}/${logoPath}`;
        res.status(201).json({ message: "Logo erfolgreich hochgeladen.", logoUrl: fullUrl });
      } catch (err) {
        console.error("Fehler beim Hochladen des Logos:", err);
        res.status(500).json({ error: "Fehler beim Hochladen des Logos." });
      }
    },
  ],

  uploadMiddleware: upload,
};

module.exports = logoController;
