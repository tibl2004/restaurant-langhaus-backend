const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");

/* =========================
   Multer Speicher (wie Home)
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/galerie");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      "galerie_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substring(7) +
        path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage });

/* =========================
   Token Middleware
========================= */
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

  /* =========================
     Galerie abrufen
  ========================= */
  getGalerie: async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT id, bild, erstellt_am FROM galerie ORDER BY id DESC"
      );

      res.status(200).json(
        rows.map((item) => ({
          id: item.id,
          bild: `${req.protocol}://${req.get("host")}/${item.bild}`,
          erstellt_am: item.erstellt_am,
        }))
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Galerie." });
    }
  },

  /* =========================
     Bilder hochladen
  ========================= */
  uploadGalerieBilder: [
    authenticateToken,          // ✅ WICHTIG
    upload.array("bilder", 20),
    async (req, res) => {
      try {
        const { userTypes } = req.user;

        if (!userTypes?.includes("admin"))
          return res.status(403).json({ error: "Nur Admins dürfen Bilder hochladen." });

        if (!req.files || req.files.length === 0)
          return res.status(400).json({ error: "Mindestens ein Bild erforderlich." });

        const bilder = [];

        for (const file of req.files) {
          const bildPath = "uploads/galerie/" + file.filename;
          await pool.query("INSERT INTO galerie (bild) VALUES (?)", [bildPath]);
          bilder.push(`${req.protocol}://${req.get("host")}/${bildPath}`);
        }

        res.status(201).json({
          message: "Galerie-Bilder erfolgreich hochgeladen.",
          bilder,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Upload fehlgeschlagen." });
      }
    },
  ],

  /* =========================
     Bild löschen
  ========================= */
  deleteGalerieBild: [
    authenticateToken,
    async (req, res) => {
      try {
        const { userTypes } = req.user;
        if (!userTypes?.includes("vorstand"))
          return res.status(403).json({ error: "Nur Vorstände dürfen löschen." });

        const { id } = req.params;

        const [rows] = await pool.query("SELECT bild FROM galerie WHERE id = ?", [id]);
        if (!rows.length) return res.status(404).json({ error: "Bild nicht gefunden." });

        const fullPath = path.join(__dirname, "../", rows[0].bild);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

        await pool.query("DELETE FROM galerie WHERE id = ?", [id]);

        res.status(200).json({ message: "Bild gelöscht." });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Löschen fehlgeschlagen." });
      }
    },
  ],
};

module.exports = galerieController;
