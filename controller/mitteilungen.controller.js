const pool = require("../database/index");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const isAdmin = (req, res) => {
  if (!Array.isArray(req.user?.userTypes) || !req.user.userTypes.includes("admin")) {
    res.status(403).json({ error: "Nur Admin erlaubt" });
    return false;
  }
  return true;
};

const uploadImage = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve(null);
  const stream = cloudinary.uploader.upload_stream(
    { folder: "langhaus/mitteilungen", resource_type: "image" },
    (error, result) => error ? reject(error) : resolve(result.secure_url)
  );
  streamifier.createReadStream(file.buffer).pipe(stream);
});

const mitteilungController = {
  // Öffentlich: nur Mitteilungen anzeigen, deren Zeitraum heute einschliesst.
  getAktive: async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, titel, text, bild, von, bis
         FROM mitteilungen
         WHERE CURDATE() BETWEEN von AND bis
         ORDER BY von ASC, id DESC`
      );
      res.json({ active: rows.length > 0, mitteilungen: rows });
    } catch (err) {
      console.error("Mitteilungen laden:", err);
      res.status(500).json({ error: "Mitteilungen konnten nicht geladen werden." });
    }
  },

  // Admin: alle Mitteilungen auflisten.
  getAlle: [
    require("../middleware/auth.js"),
    async (req, res) => {
      if (!isAdmin(req, res)) return;
      try {
        const [rows] = await pool.query(
          "SELECT id, titel, text, bild, von, bis FROM mitteilungen ORDER BY von DESC, id DESC"
        );
        res.json(rows);
      } catch (err) {
        console.error("Alle Mitteilungen laden:", err);
        res.status(500).json({ error: "Mitteilungen konnten nicht geladen werden." });
      }
    }
  ],

  erstellen: [
    require("../middleware/auth.js"),
    async (req, res) => {
      if (!isAdmin(req, res)) return;
      try {
        const { titel, text, von, bis } = req.body;
        if (!titel?.trim() || !text?.trim() || !von || !bis) {
          return res.status(400).json({ error: "Titel, Text, Startdatum und Enddatum sind erforderlich." });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis) || bis < von) {
          return res.status(400).json({ error: "Bitte gültige Daten eingeben. Das Enddatum darf nicht vor dem Startdatum liegen." });
        }
        const bild = req.file ? await uploadImage(req.file) : null;
        const [result] = await pool.query(
          "INSERT INTO mitteilungen (titel, `text`, bild, von, bis) VALUES (?, ?, ?, ?, ?)",
          [titel.trim(), text.trim(), bild, von, bis]
        );
        res.status(201).json({ message: "Mitteilung erstellt.", id: result.insertId });
      } catch (err) {
        console.error("Mitteilung erstellen:", err);
        res.status(500).json({ error: "Mitteilung konnte nicht gespeichert werden." });
      }
    }
  ],

  bearbeiten: [
    require("../middleware/auth.js"),
    async (req, res) => {
      if (!isAdmin(req, res)) return;
      try {
        const { id } = req.params;
        const [rows] = await pool.query("SELECT * FROM mitteilungen WHERE id = ?", [id]);
        if (!rows.length) return res.status(404).json({ error: "Mitteilung nicht gefunden." });

        const current = rows[0];
        const titel = req.body.titel ?? current.titel;
        const text = req.body.text ?? current.text;
        const von = req.body.von ?? String(current.von).slice(0, 10);
        const bis = req.body.bis ?? String(current.bis).slice(0, 10);

        if (!String(titel).trim() || !String(text).trim() || !von || !bis || bis < von) {
          return res.status(400).json({ error: "Bitte Titel, Text und einen gültigen Zeitraum angeben." });
        }

        const bild = req.file ? await uploadImage(req.file) : current.bild;
        await pool.query(
          "UPDATE mitteilungen SET titel = ?, `text` = ?, bild = ?, von = ?, bis = ? WHERE id = ?",
          [String(titel).trim(), String(text).trim(), bild, von, bis, id]
        );
        res.json({ message: "Mitteilung aktualisiert." });
      } catch (err) {
        console.error("Mitteilung bearbeiten:", err);
        res.status(500).json({ error: "Mitteilung konnte nicht aktualisiert werden." });
      }
    }
  ],

  loeschen: [
    require("../middleware/auth.js"),
    async (req, res) => {
      if (!isAdmin(req, res)) return;
      try {
        const [result] = await pool.query("DELETE FROM mitteilungen WHERE id = ?", [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Mitteilung nicht gefunden." });
        res.json({ message: "Mitteilung gelöscht." });
      } catch (err) {
        console.error("Mitteilung löschen:", err);
        res.status(500).json({ error: "Mitteilung konnte nicht gelöscht werden." });
      }
    }
  ]
};

module.exports = mitteilungController;