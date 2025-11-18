const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, "logo" + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const logoController = {
  getLogo: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM logos LIMIT 1");
      if (!rows.length) return res.status(404).json({ error: "Kein Logo gefunden." });

      const logoPath = rows[0].image;
      const fullUrl = `${req.protocol}://${req.get("host")}/${logoPath}`; // volle URL für Frontend
      res.json({ logoUrl: fullUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen des Logos." });
    }
  },

  uploadLogo: [
    upload.single("logo"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Keine Datei hochgeladen." });

        const logoPath = "uploads/" + req.file.filename;

        const [existing] = await pool.query("SELECT * FROM logos LIMIT 1");
        if (existing.length > 0) {
          await pool.query("UPDATE logos SET image = ? WHERE id = ?", [logoPath, existing[0].id]);
        } else {
          await pool.query("INSERT INTO logos (image) VALUES (?)", [logoPath]);
        }

        const fullUrl = `${req.protocol}://${req.get("host")}/${logoPath}`;
        res.status(200).json({ message: "Logo erfolgreich hochgeladen.", logoUrl: fullUrl });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler beim Hochladen des Logos." });
      }
    },
  ],
};

module.exports = logoController;
