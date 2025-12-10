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
        "SELECT * FROM oeffnungszeiten ORDER BY FIELD(wochentag,'Mo','Di','Mi','Do','Fr','Sa','So'), kategorie, von"
      );
  
      // Zwischenspeicher: { kategorie -> { wochentag -> [ {von,bis} ] } }
      const tmp = {};
  
      for (const row of rows) {
        const cat = row.kategorie || "";
        const wt = row.wochentag;
  
        if (!tmp[cat]) tmp[cat] = {};
        if (!tmp[cat][wt]) tmp[cat][wt] = [];
  
        // Falls geschlossen (keine Zeit), NICHT Zeiteintrag hinzufügen
        if (row.von && row.bis) {
          tmp[cat][wt].push({ von: row.von, bis: row.bis });
        }
      }
  
      // Jetzt erzeugen wir eine Liste für die Ausgabe
      const output = [];
  
      for (const cat of Object.keys(tmp)) {
        const tage = tmp[cat];
  
        // Wir müssen gleiche Zeitmuster zusammenfassen
        const patternGroups = {};
  
        for (const wt of Object.keys(tage)) {
          const times = tage[wt];
  
          // geschlossen → Kennzeichnung
          const isClosed = times.length === 0;
  
          // Muster erzeugen: z.B. "09:00-12:00 | 13:00-18:00"
          const pattern = isClosed
            ? "geschlossen"
            : times.map(t => `${t.von}-${t.bis}`).join(" | ");
  
          if (!patternGroups[pattern]) patternGroups[pattern] = [];
          patternGroups[pattern].push(wt);
        }
  
        // Ausgabe formatieren
        for (const pattern of Object.keys(patternGroups)) {
          const closed = pattern === "geschlossen";
  
          output.push({
            kategorie: cat || null,
            wochentage: patternGroups[pattern].join(", "),
            geschlossen: closed,
            zeiten: closed ? null : pattern.replace(/\-/g, " – ")
          });
        }
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
