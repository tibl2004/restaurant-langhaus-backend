const pool = require("../database/index");
const jwt = require("jsonwebtoken");

/* =========================
   AUTH MIDDLEWARE (FIXED)
========================= */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Token ungültig" });
    }

    req.user = {
      id: decoded.id,
      username: decoded.username,
      userTypes: decoded.userTypes || []
    };

    next();
  });
};

/* =========================
   CONTROLLER
========================= */
const oeffnungszeitenController = {

  /* =========================
     PUBLIC – GET
  ========================= */
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
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen" });
    }
  },

  /* =========================
     ADMIN – EDIT DATA
  ========================= */
  getOeffzeitenForEdit: [
    authenticateToken,
    async (req, res) => {
      try {
        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admin erlaubt" });
        }

        const [rows] = await pool.query(
          `SELECT * 
           FROM oeffnungszeiten
           ORDER BY kategorie, FIELD(wochentag,'Mo','Di','Mi','Do','Fr','Sa','So'), von`
        );

        const tmp = {};

        for (const row of rows) {
          const catKey = row.kategorie?.trim() || "__DEFAULT__";
          if (!tmp[catKey]) tmp[catKey] = [];
          tmp[catKey].push(row);
        }

        res.json(tmp);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler beim Laden" });
      }
    }
  ],

  updateZeitblock: [
    authenticateToken,
    async (req, res) => {
      try {
        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admin erlaubt" });
        }

        const { id } = req.params;
        const { wochentag, von, bis, kategorie } = req.body;

        const [rows] = await pool.query(
          "SELECT * FROM oeffnungszeiten WHERE id = ?",
          [id]
        );

        if (!rows.length) {
          return res.status(404).json({ error: "Nicht gefunden" });
        }

        await pool.query(
          "UPDATE oeffnungszeiten SET wochentag=?, von=?, bis=?, kategorie=? WHERE id=?",
          [
            wochentag || rows[0].wochentag,
            von || null,
            bis || null,
            kategorie || rows[0].kategorie,
            id
          ]
        );

        res.json({ message: "Aktualisiert" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler" });
      }
    }
  ],

  addZeitblock: [
    authenticateToken,
    async (req, res) => {
      try {
        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admin erlaubt" });
        }

        const { wochentag, von, bis, kategorie } = req.body;

        await pool.query(
          "INSERT INTO oeffnungszeiten (wochentag, von, bis, kategorie) VALUES (?, ?, ?, ?)",
          [wochentag, von || null, bis || null, kategorie || null]
        );

        res.status(201).json({ message: "Hinzugefügt" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler" });
      }
    }
  ],

  deleteZeitblock: [
    authenticateToken,
    async (req, res) => {
      try {
        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admin erlaubt" });
        }

        const { id } = req.params;

        await pool.query("DELETE FROM oeffnungszeiten WHERE id = ?", [id]);

        res.json({ message: "Gelöscht" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler" });
      }
    }
  ]
};

module.exports = oeffnungszeitenController;