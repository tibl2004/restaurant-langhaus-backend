const pool = require("../database/index");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");

/* =========================
   AUTH MIDDLEWARE
========================= */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Kein Token bereitgestellt" });
  }

  jwt.verify(token, "secretKey", (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Token ungültig" });
    }
    req.user = user;
    next();
  });
};

/* =========================
   MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/galerie");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
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

const upload = multer({ storage });

/* =========================
   CONTROLLER
========================= */
const galerieController = {
  /* =========================
     PUBLIC – GALERIE LADEN
  ========================= */
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

  /* =========================
     ADMIN – BILDER HOCHLADEN
  ========================= */
  uploadGalerieBilder: [
    authenticateToken,
    upload.array("bilder", 20),
    async (req, res) => {
      try {
        if (!req.user?.userTypes?.includes("admin")) {
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
        console.error(err);
        res.status(500).json({ error: "Upload fehlgeschlagen" });
      }
    },
  ],

  /* =========================
     VORSTAND – BILD LÖSCHEN
  ========================= */
  deleteGalerieBild: [
    authenticateToken,
    async (req, res) => {
      try {
        if (!req.user?.userTypes?.includes("vorstand")) {
          return res.status(403).json({ error: "Nur Vorstand erlaubt" });
        }

        const { id } = req.params;

        const [rows] = await pool.query(
          "SELECT bild FROM galerie WHERE id = ?",
          [id]
        );

        if (!rows.length) {
          return res.status(404).json({ error: "Bild nicht gefunden" });
        }

        const filePath = path.join(__dirname, "../", rows[0].bild);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        await pool.query("DELETE FROM galerie WHERE id = ?", [id]);

        res.json({ message: "Bild gelöscht" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Löschen fehlgeschlagen" });
      }
    },
  ],
};

module.exports = galerieController;
