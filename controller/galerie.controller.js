const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const auth = require("../middleware/auth");

/* ================= MULTER ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/galerie");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      "galerie_" +
        Date.now() +
        "_" +
        Math.random().toString(36).slice(2) +
        path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Nur Bilder erlaubt"), false);
    }
    cb(null, true);
  },
});

/* ================= CONTROLLER ================= */
const galerieController = {

  async getGalerie(req, res) {
    try {
      const [rows] = await pool.query(
        "SELECT id, bild, erstellt_am FROM galerie ORDER BY id DESC"
      );

      res.json(
        rows.map((r) => ({
          id: r.id,
          bild: `${req.protocol}://${req.get("host")}${r.bild}`,
          erstellt_am: r.erstellt_am,
        }))
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Galerie konnte nicht geladen werden" });
    }
  },

  uploadGalerieBilder: [
    auth,
    upload.array("bilder", 20),

    async (req, res) => {
      try {
        console.log("USER:", req.user);
        console.log("FILES:", req.files);

        if (!req.user) {
          return res.status(401).json({ error: "Nicht eingeloggt" });
        }

        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admins erlaubt" });
        }

        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: "Keine Bilder erhalten" });
        }

        for (const file of req.files) {
          await pool.query(
            "INSERT INTO galerie (bild) VALUES (?)",
            ["/uploads/galerie/" + file.filename]
          );
        }

        res.status(201).json({ message: "Upload erfolgreich" });

      } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.status(500).json({ error: err.message || "Upload fehlgeschlagen" });
      }
    },
  ],
};

module.exports = galerieController;