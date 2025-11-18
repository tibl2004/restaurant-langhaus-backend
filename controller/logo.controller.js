const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

// 🔹 Speicherort für Uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, "logo" + path.extname(file.originalname)); // logo.png, logo.jpg, ...
  },
});

const upload = multer({ storage });

const logoController = {
  // 🔹 Logo abrufen
  getLogo: async (req, res) => {
    try {
      const [logoRows] = await pool.query("SELECT * FROM logos LIMIT 1");
      const logo = logoRows.length > 0 ? logoRows[0].image : null;

      if (!logo) return res.status(404).json({ error: "Kein Logo gefunden." });

      res.json({ logoUrl: logo }); // z.B. { "logoUrl": "uploads/logo.png" }
    } catch (err) {
      console.error("Fehler beim Abrufen des Logos:", err);
      res.status(500).json({ error: "Fehler beim Abrufen des Logos." });
    }
  },

  // 🔹 Logo hochladen
  uploadLogo: [
    upload.single("logo"), // Feldname "logo"
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Keine Datei hochgeladen." });

        const logoPath = "uploads/" + req.file.filename;

        const [existing] = await pool.query("SELECT * FROM logos LIMIT 1");
        if (existing.length > 0) {
          // Update
          await pool.query("UPDATE logos SET image = ? WHERE id = ?", [logoPath, existing[0].id]);
        } else {
          // Insert
          await pool.query("INSERT INTO logos (image) VALUES (?)", [logoPath]);
        }

        res.status(200).json({ message: "Logo erfolgreich hochgeladen.", logoUrl: logoPath });
      } catch (err) {
        console.error("Fehler beim Hochladen des Logos:", err);
        res.status(500).json({ error: "Fehler beim Hochladen des Logos." });
      }
    },
  ],

  uploadMiddleware: upload, // falls extern verwendet
};

module.exports = logoController;
