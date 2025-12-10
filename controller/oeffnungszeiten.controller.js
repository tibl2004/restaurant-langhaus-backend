const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const oeffnungszeitenController = {

  // 🔹 JWT Auth Middleware
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Kein Token bereitgestellt.' });

    jwt.verify(token, 'secretKey', (err, user) => {
      if (err) return res.status(403).json({ error: 'Ungültiger Token.' });
      req.user = user;
      next();
    });
  },

  // 🔹 Öffnungszeiten abrufen + zusammenfassen
  getOeffnungszeiten: async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM oeffnungszeiten ORDER BY FIELD(wochentag,'Mo','Di','Mi','Do','Fr','Sa','So'), kategorie, von"
      );

      const grouped = [];
      let prev = null;

      for (const row of rows) {
        const cat = row.kategorie || "";
        const von = row.von;
        const bis = row.bis;

        // Falls geschlossen → zusammenfassen
        const closed = !von && !bis;

        if (
          prev &&
          prev.kategorie === cat &&
          prev.closed === closed &&
          prev.von === von &&
          prev.bis === bis
        ) {
          prev.wochentage.push(row.wochentag);
        } else {
          prev = {
            id: row.id,
            kategorie: cat,
            closed,
            von,
            bis,
            wochentage: [row.wochentag]
          };
          grouped.push(prev);
        }
      }

      // Ausgabe schöner machen
      const result = grouped.map(g => ({
        kategorie: g.kategorie || null,
        wochentage: g.wochentage.join(", "),
        geschlossen: g.closed,
        zeiten: g.closed ? null : `${g.von} – ${g.bis}`
      }));

      res.status(200).json(result);
    } catch (err) {
      console.error("Fehler beim Abrufen der Öffnungszeiten:", err);
      res.status(500).json({ error: "Fehler beim Abrufen der Öffnungszeiten." });
    }
  },

  // 🔹 Zeitblock hinzufügen
  addZeitblock: async (req, res) => {
    try {
      const { wochentag, von, bis, kategorie } = req.body;

      if (!wochentag) return res.status(400).json({ error: "Wochentag erforderlich." });

      const closed = (!von || !bis); 

      const cat = kategorie || null;

      await pool.query(
        "INSERT INTO oeffnungszeiten (wochentag, von, bis, kategorie) VALUES (?, ?, ?, ?)",
        [
          wochentag,
          closed ? null : von,
          closed ? null : bis,
          cat
        ]
      );

      res.status(201).json({ message: "Zeitblock hinzugefügt" });
    } catch (err) {
      console.error("Fehler beim Hinzufügen:", err);
      res.status(500).json({ error: "Fehler beim Speichern." });
    }
  },

  // 🔹 Zeitblock löschen
  deleteZeitblock: async (req, res) => {
    try {
      const { id } = req.params;

      const [result] = await pool.query(
        "DELETE FROM oeffnungszeiten WHERE id = ?",
        [id]
      );

      if (result.affectedRows === 0)
        return res.status(404).json({ error: "Eintrag nicht gefunden." });

      res.status(200).json({ message: "Zeitblock gelöscht" });

    } catch (err) {
      console.error("Fehler beim Löschen:", err);
      res.status(500).json({ error: "Fehler beim Löschen." });
    }
  }
};

module.exports = oeffnungszeitenController;
