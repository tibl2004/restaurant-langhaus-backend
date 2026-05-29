const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const auth = require("../middleware/auth");

/*
====================================
UPLOAD ORDNER
====================================
*/

const uploadDir = path.join(__dirname, "../uploads/galerie");

/*
====================================
MULTER
====================================
*/

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
  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Nur Bilder erlaubt"), false);
    }
    cb(null, true);
  },
});

/*
====================================
HELPER
====================================
*/

const buildImageUrl = (req, filePath) => {
  return `${req.protocol}://${req.get("host")}/uploads${filePath}`;
};

/*
====================================
CONTROLLER
====================================
*/

const galerieController = {

  async getGalerie(req, res) {
    try {
      const [rows] = await pool.query(`
        SELECT id, bild, erstellt_am
        FROM galerie
        ORDER BY id DESC
      `);

      const data = rows.map((item) => ({
        id: item.id,
        bild: buildImageUrl(req, item.bild),
        erstellt_am: item.erstellt_am,
      }));

      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Laden" });
    }
  },

  uploadGalerieBilder: [
    auth,
    upload.array("bilder", 20),

    async (req, res) => {
      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: "Keine Bilder erhalten" });
        }

        const values = req.files.map((file) => [
          `/galerie/${file.filename}`,
        ]);

        await pool.query(
          "INSERT INTO galerie (bild) VALUES ?",
          [values]
        );

        res.status(201).json({
          message: "Upload erfolgreich",
          count: req.files.length,
        });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Upload fehlgeschlagen" });
      }
    },
  ],

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
          return res.status(404).json({ error: "Nicht gefunden" });
        }

        const bildPfad = rows[0].bild; // /galerie/xyz.jpg

        const fullPath = path.join(
          __dirname,
          "../uploads",
          bildPfad
        );

        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }

        await pool.query(
          "DELETE FROM galerie WHERE id = ?",
          [id]
        );

        res.json({ message: "Bild gelöscht" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete fehlgeschlagen" });
      }
    },
  ],
};

module.exports = galerieController;