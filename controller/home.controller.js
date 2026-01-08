const pool = require("../database/index"); // mysql2/promise
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");

// 🔹 Multer Speicher für Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/home");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      "home_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substring(7) +
        path.extname(file.originalname)
    );
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

// 🔹 Home Rotation: alle 12h neues Bild
const rotateHomeImageIfNeeded = async () => {
  const now = new Date();

  const [rotationRows] = await pool.query(
    "SELECT * FROM home_rotation LIMIT 1"
  );

  if (!rotationRows.length) {
    const [first] = await pool.query(
      "SELECT id FROM galerie ORDER BY id ASC LIMIT 1"
    );
    if (!first.length) return null;

    await pool.query(
      "INSERT INTO home_rotation (galerie_id, last_switch) VALUES (?, ?)",
      [first[0].id, now]
    );
    return first[0].id;
  }

  const rotation = rotationRows[0];
  const lastSwitch = new Date(rotation.last_switch);
  const diffHours = (now - lastSwitch) / 1000 / 60 / 60;

  if (diffHours < 12) return rotation.galerie_id;

  const [next] = await pool.query(
    "SELECT id FROM galerie WHERE id > ? ORDER BY id ASC LIMIT 1",
    [rotation.galerie_id]
  );

  let nextId;
  if (next.length) {
    nextId = next[0].id;
  } else {
    const [first] = await pool.query(
      "SELECT id FROM galerie ORDER BY id ASC LIMIT 1"
    );
    nextId = first[0].id;
  }

  await pool.query(
    "UPDATE home_rotation SET galerie_id = ?, last_switch = ?",
    [nextId, now]
  );

  return nextId;
};

// 🔹 Home Controller
const homeController = {
  authenticateToken,

  // 🔹 Home Content abrufen
  getHomeContent: async (req, res) => {
    try {
      const galerieId = await rotateHomeImageIfNeeded();

      const [[home]] = await pool.query(
        "SELECT willkommen_text, willkommen_link FROM home_content LIMIT 1"
      );

      let bild = null;
      if (galerieId) {
        const [[img]] = await pool.query(
          "SELECT bild FROM galerie WHERE id = ?",
          [galerieId]
        );
        if (img?.bild) {
          bild = `${req.protocol}://${req.get("host")}/${img.bild}`;
        }
      }

      res.status(200).json({
        bild,
        willkommenText: home?.willkommen_text || "",
        willkommenLink: home?.willkommen_link || "",
      });
    } catch (err) {
      console.error("Home Fehler:", err);
      res.status(500).json({ error: "Home konnte nicht geladen werden" });
    }
  },

  // 🔹 Home Content erstellen
  createHomeContent: [
    authenticateToken,
    upload.single("bild"),
    async (req, res) => {
      try {
        const { userTypes } = req.user;
        if (!userTypes?.includes("admin"))
          return res.status(403).json({ error: "Nur Admins dürfen Inhalte erstellen." });

        const { willkommenText, willkommenLink } = req.body;

        if (!req.file || !willkommenText || !willkommenLink)
          return res.status(400).json({ error: "Bild, Text und Link sind erforderlich." });

        const [existing] = await pool.query("SELECT id FROM home_content LIMIT 1");
        if (existing.length > 0)
          return res.status(400).json({ error: "Home-Content existiert bereits. Bitte UPDATE verwenden." });

        const bildPath = "uploads/home/" + req.file.filename;

        await pool.query(
          "INSERT INTO home_content (bild, willkommen_text, willkommen_link) VALUES (?, ?, ?)",
          [bildPath, willkommenText, willkommenLink]
        );

        res.status(201).json({
          message: "Home-Content erstellt.",
          bild: `${req.protocol}://${req.get("host")}/${bildPath}`,
        });
      } catch (err) {
        console.error("Fehler beim Erstellen:", err);
        res.status(500).json({ error: "Fehler beim Erstellen des Home-Contents." });
      }
    },
  ],

  // 🔹 Home Content aktualisieren
  updateHomeContent: [
    authenticateToken,
    upload.single("bild"),
    async (req, res) => {
      try {
        const { userTypes } = req.user;
        if (!userTypes?.includes("admin") && !userTypes?.includes("vorstand"))
          return res.status(403).json({ error: "Nur Admins oder Vorstände dürfen aktualisieren." });

        const { willkommenText, willkommenLink } = req.body;

        const [existing] = await pool.query(
          "SELECT id, bild, willkommen_text, willkommen_link FROM home_content LIMIT 1"
        );

        if (!existing.length)
          return res.status(400).json({ error: "Kein Content vorhanden. Bitte CREATE verwenden." });

        const old = existing[0];
        let bildPath = old.bild;

        if (req.file) {
          bildPath = "uploads/home/" + req.file.filename;
          const oldFullPath = path.join(__dirname, "../", old.bild);
          if (fs.existsSync(oldFullPath)) fs.unlinkSync(oldFullPath);
        }

        await pool.query(
          "UPDATE home_content SET bild = ?, willkommen_text = ?, willkommen_link = ?, aktualisiert_am = NOW() WHERE id = ?",
          [
            bildPath,
            willkommenText || old.willkommen_text,
            willkommenLink || old.willkommen_link,
            old.id,
          ]
        );

        res.status(200).json({
          message: "Home-Content erfolgreich aktualisiert.",
          bild: `${req.protocol}://${req.get("host")}/${bildPath}`,
          willkommenText: willkommenText || old.willkommen_text,
          willkommenLink: willkommenLink || old.willkommen_link,
        });
      } catch (err) {
        console.error("Fehler beim Aktualisieren:", err);
        res.status(500).json({ error: "Fehler beim Aktualisieren des Home-Contents." });
      }
    },
  ],

  // 🔹 Home Content löschen
  deleteHomeContent: [
    authenticateToken,
    async (req, res) => {
      try {
        const { userTypes } = req.user;
        if (!userTypes?.includes("vorstand"))
          return res.status(403).json({ error: "Nur Vorstände dürfen löschen." });

        const [existing] = await pool.query("SELECT id, bild FROM home_content LIMIT 1");
        if (!existing.length) return res.status(404).json({ error: "Kein Home-Content vorhanden." });

        const fullPath = path.join(__dirname, "../", existing[0].bild);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

        await pool.query("DELETE FROM home_content WHERE id = ?", [existing[0].id]);

        res.status(200).json({ message: "Home-Content gelöscht." });
      } catch (err) {
        console.error("Fehler beim Löschen:", err);
        res.status(500).json({ error: "Fehler beim Löschen des Home-Contents." });
      }
    },
  ],

  uploadMiddleware: upload,
};

module.exports = homeController;
