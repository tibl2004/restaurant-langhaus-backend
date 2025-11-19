const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");

// 🔹 Multer Speicher
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads/galerie");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, "galerie_" + Date.now() + "_" + Math.random().toString(36).substring(7) + path.extname(file.originalname));
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

const galerieController = {
  authenticateToken,

  // 🔹 Galerie auslesen
  getGalerie: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT id, bild, erstellt_am FROM galerie ORDER BY id DESC");

      const galerie = rows.map((item) => ({
        id: item.id,
        bild: `${req.protocol}://${req.get("host")}/${item.bild}`,
        erstellt_am: item.erstellt_am,
      }));

      res.status(200).json(galerie);
    } catch (err) {
      console.error("Fehler beim Abrufen der Galerie:", err);
      res.status(500).json({ error: "Fehler beim Abrufen der Galerie." });
    }
  },

  // 🔹 Mehrere Bilder hochladen
  uploadGalerieBilder: [
    upload.array("bilder", 20), // ⬅️ Mehrfach-Upload erlaubt
    async (req, res) => {
      try {
        const { userTypes } = req.user;
        if (!userTypes || !userTypes.includes("vorstand")) {
          return res.status(403).json({ error: "Nur Vorstände dürfen Bilder hochladen." });
        }

        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: "Mindestens ein Bild ist erforderlich." });
        }

        const insertedImages = [];

        for (const file of req.files) {
          const filePath = "uploads/galerie/" + file.filename;

          await pool.query("INSERT INTO galerie (bild) VALUES (?)", [filePath]);

          insertedImages.push(`${req.protocol}://${req.get("host")}/${filePath}`);
        }

        res.status(201).json({
          message: "Bilder erfolgreich hochgeladen.",
          bilder: insertedImages,
        });
      } catch (err) {
        console.error("Fehler beim Hochladen der Galerie-Bilder:", err);
        res.status(500).json({ error: "Fehler beim Hochladen der Galerie-Bilder." });
      }
    },
  ],

  // 🔹 Einzelnes Galerie-Bild löschen
  deleteGalerieBild: async (req, res) => {
    try {
      const { userTypes } = req.user;
      if (!userTypes || !userTypes.includes("vorstand")) {
        return res.status(403).json({ error: "Nur Vorstände dürfen Bilder löschen." });
      }

      const { id } = req.params;

      const [rows] = await pool.query("SELECT bild FROM galerie WHERE id = ?", [id]);
      if (!rows.length) return res.status(404).json({ error: "Bild nicht gefunden." });

      const bildPath = rows[0].bild;
      const fullPath = path.join(__dirname, "../", bildPath);

      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

      await pool.query("DELETE FROM galerie WHERE id = ?", [id]);

      res.status(200).json({ message: "Bild erfolgreich gelöscht." });
    } catch (err) {
      console.error("Fehler beim Löschen des Galerie-Bildes:", err);
      res.status(500).json({ error: "Fehler beim Löschen des Galerie-Bildes." });
    }
  },

  uploadMiddleware: upload,
};

module.exports = galerieController;
