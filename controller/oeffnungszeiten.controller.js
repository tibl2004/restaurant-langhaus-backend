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

  getOeffnungszeiten: async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT *
         FROM oeffnungszeiten
         ORDER BY
           FIELD(wochentag,'Mo','Di','Mi','Do','Fr','Sa','So'),
           kategorie,
           von`
      );
  
      const WOCHEN_ORDER = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
      const fmt = (t) => (t ? t.slice(0, 5) : null);
  
      // { kategorieKey -> { wochentag -> [zeiten] } }
      const tmp = {};
  
      for (const row of rows) {
        const catKey =
          row.kategorie && row.kategorie.trim() !== ""
            ? row.kategorie.trim()
            : "__DEFAULT__";
  
        if (!tmp[catKey]) tmp[catKey] = {};
        if (!tmp[catKey][row.wochentag]) tmp[catKey][row.wochentag] = [];
  
        if (row.von && row.bis) {
          tmp[catKey][row.wochentag].push({
            von: fmt(row.von),
            bis: fmt(row.bis),
          });
        }
      }
  
      const compressDays = (days) => {
        const sorted = [...days].sort(
          (a, b) => WOCHEN_ORDER.indexOf(a) - WOCHEN_ORDER.indexOf(b)
        );
  
        const ranges = [];
        let start = sorted[0];
        let prev = sorted[0];
  
        for (let i = 1; i < sorted.length; i++) {
          const curr = sorted[i];
          if (WOCHEN_ORDER.indexOf(curr) === WOCHEN_ORDER.indexOf(prev) + 1) {
            prev = curr;
          } else {
            ranges.push(start === prev ? start : `${start} – ${prev}`);
            start = curr;
            prev = curr;
          }
        }
  
        ranges.push(start === prev ? start : `${start} – ${prev}`);
        return ranges;
      };
  
      const output = [];
  
      // 🔥 JETZT: EIN OBJEKT PRO KATEGORIE
      for (const catKey of Object.keys(tmp)) {
        const tage = tmp[catKey];
        const patternGroups = {};
  
        for (const wt of Object.keys(tage)) {
          const times = tage[wt];
          const pattern =
            times.length === 0
              ? "geschlossen"
              : times.map(t => `${t.von} – ${t.bis}`).join("|");
  
          if (!patternGroups[pattern]) patternGroups[pattern] = [];
          patternGroups[pattern].push(wt);
        }
  
        const eintraege = [];
  
        for (const pattern of Object.keys(patternGroups)) {
          eintraege.push({
            wochentage: compressDays(patternGroups[pattern]),
            geschlossen: pattern === "geschlossen",
            zeiten: pattern === "geschlossen" ? ["geschlossen"] : pattern.split("|"),
          });
        }
  
        output.push({
          kategorie: catKey === "__DEFAULT__" ? null : catKey,
          eintraege,
        });
      }
  
      res.status(200).json(output);
  
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
