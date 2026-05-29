const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const auth = require("../middleware/auth");

/* ================= MULTER ================= */
const uploadDir = path.join(__dirname, "../uploads/galerie");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      "galerie_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substring(2, 10) +
      path.extname(file.originalname).toLowerCase();

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Schutz
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Nur Bilder erlaubt!"), false);
    }
    cb(null, true);
  },
});

/* ================= HELPER ================= */
const buildImageUrl = (req, filePath) => {
  if (!filePath) return null;

  // immer sauber normalisieren
  const cleanPath = filePath.startsWith("/")
    ? filePath
    : "/" + filePath;

  return `${req.protocol}://${req.get("host")}${cleanPath}`;
};

/* ================= CONTROLLER ================= */
const galerieController = {

  /* ========== GET ========== */
  async getGalerie(req, res) {
    try {
      const [rows] = await pool.query(
        "SELECT id, bild, erstellt_am FROM galerie ORDER BY id DESC"
      );

      const data = rows.map((r) => ({
        id: r.id,
        bild: buildImageUrl(req, r.bild),
        erstellt_am: r.erstellt_am,
      }));

      res.json(data);

    } catch (err) {
      console.error("GET GALERIE ERROR:", err);
      res.status(500).json({ error: "Fehler beim Laden der Galerie" });
    }
  },

  /* ========== UPLOAD ========== */
  uploadGalerieBilder: [
    auth,
    upload.array("bilder", 20),

    async (req, res) => {
      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: "Keine Bilder erhalten" });
        }

        const values = req.files.map((file) => [
          `/uploads/galerie/${file.filename}`,
        ]);

        // Bulk Insert (viel schneller als loop)
        await pool.query(
          "INSERT INTO galerie (bild) VALUES ?",
          [values]
        );

        res.status(201).json({
          message: "Upload erfolgreich",
          count: req.files.length,
        });

      } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.status(500).json({ error: "Upload fehlgeschlagen" });
      }
    },
  ],

  /* ========== DELETE ========== */
  deleteGalerieBild: [
    auth,

    async (req, res) => {
      try {
        const { id } = req.params;

        const [rows] = await pool.query(
          "SELECT bild FROM galerie WHERE id = ?",
          [id]
        );

        if (rows.length === 0) {
          return res.status(404).json({ error: "Bild nicht gefunden" });
        }

        const dbPath = rows[0].bild;
        const fullPath = path.join(__dirname, "..", dbPath);

        // Datei löschen (wenn vorhanden)
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }

        await pool.query("DELETE FROM galerie WHERE id = ?", [id]);

        res.json({ message: "Bild erfolgreich gelöscht" });

      } catch (err) {
        console.error("DELETE ERROR:", err);
        res.status(500).json({ error: "Delete fehlgeschlagen" });
      }
    },
  ],
};

module.exports = galerieController;