const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const auth = require("../middleware/auth");

/* ================= MULTER ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/galerie");

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    cb(null, dir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      "galerie_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substring(2) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Nur Bilder erlaubt!"), false);
    }
    cb(null, true);
  },
});

/* ================= CONTROLLER ================= */
const galerieController = {

  /* ========== GET ========== */
  async getGalerie(req, res) {
    try {
      const [rows] = await pool.query(
        "SELECT id, bild, erstellt_am FROM galerie ORDER BY id DESC"
      );

      res.json(
        rows.map((r) => ({
          id: r.id,

          // FIXED URL
          bild: `${req.protocol}://${req.get("host")}${r.bild}`,

          erstellt_am: r.erstellt_am,
        }))
      );

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Laden" });
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

        for (const file of req.files) {
          const dbPath = `/uploads/galerie/${file.filename}`;

          await pool.query(
            "INSERT INTO galerie (bild) VALUES (?)",
            [dbPath]
          );
        }

        res.status(201).json({
          message: "Upload erfolgreich",
          count: req.files.length,
        });

      } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.status(500).json({ error: "Upload fehlgeschlagen" });
      }
    }
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

        if (!rows.length) {
          return res.status(404).json({ error: "Nicht gefunden" });
        }

        let filePath = rows[0].bild;

        // remove leading slash
        if (filePath.startsWith("/")) {
          filePath = filePath.slice(1);
        }

        const fullPath = path.join(__dirname, "..", filePath);

        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }

        await pool.query("DELETE FROM galerie WHERE id = ?", [id]);

        res.json({ message: "Gelöscht" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete fehlgeschlagen" });
      }
    }
  ]
};

module.exports = galerieController;