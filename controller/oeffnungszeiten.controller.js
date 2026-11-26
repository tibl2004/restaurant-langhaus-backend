const pool = require("../database/index");
const authenticateToken = require("../middleware/auth");
const requireAdmin = authenticateToken.requireAdmin;

// ======================================
// KONSTANTEN
// ======================================

const WOCHEN_ORDER = [
  "Mo",
  "Di",
  "Mi",
  "Do",
  "Fr",
  "Sa",
  "So"
];

// ======================================
// HILFSFUNKTIONEN
// ======================================

const isValidDay = (day) => {
  return WOCHEN_ORDER.includes(day);
};

const isValidTime = (time) => {
  if (time === null || time === "") {
    return true;
  }

  return (
    typeof time === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)
  );
};

const formatTime = (time) => {
  if (!time) return null;

  return String(time).slice(0, 5);
};

const normalizeCategory = (category) => {
  if (
    category === undefined ||
    category === null ||
    (typeof category === "string" && category.trim() === "")
  ) {
    return null;
  }

  return category.trim();
};

const validateTimeBlock = (
  wochentag,
  von,
  bis,
  kategorie
) => {
  if (!isValidDay(wochentag)) {
    return "Ungültiger Wochentag.";
  }

  if (!isValidTime(von) || !isValidTime(bis)) {
    return "Ungültiges Zeitformat.";
  }

  if ((von === null) !== (bis === null)) {
    return "Von und Bis müssen gemeinsam angegeben werden.";
  }

  if (
    typeof kategorie === "string" &&
    kategorie.length > 100
  ) {
    return "Die Kategorie darf maximal 100 Zeichen lang sein.";
  }

  return null;
};

const compressDays = (days) => {
  const sorted = [...new Set(days)].sort(
    (a, b) =>
      WOCHEN_ORDER.indexOf(a) -
      WOCHEN_ORDER.indexOf(b)
  );

  if (sorted.length === 0) return [];

  const ranges = [];

  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];

    if (
      WOCHEN_ORDER.indexOf(current) ===
      WOCHEN_ORDER.indexOf(prev) + 1
    ) {
      prev = current;
    } else {
      ranges.push(
        start === prev ? start : `${start} – ${prev}`
      );

      start = current;
      prev = current;
    }
  }

  ranges.push(
    start === prev ? start : `${start} – ${prev}`
  );

  return ranges;
};

// ======================================
// CONTROLLER
// ======================================

const oeffnungszeitenController = {

  // ====================================
  // ÖFFENTLICHE ÖFFNUNGSZEITEN ABRUFEN
  // ====================================

  getOeffnungszeiten: async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT *
        FROM oeffnungszeiten
        ORDER BY
          FIELD(wochentag, 'Mo','Di','Mi','Do','Fr','Sa','So'),
          kategorie,
          von
      `);

      const grouped = {};

      for (const row of rows) {
        const category =
          row.kategorie?.trim() || "__DEFAULT__";

        const day = row.wochentag;

        if (!grouped[category]) {
          grouped[category] = {};
        }

        if (!grouped[category][day]) {
          grouped[category][day] = [];
        }

        if (row.von && row.bis) {
          grouped[category][day].push({
            von: formatTime(row.von),
            bis: formatTime(row.bis)
          });
        }
      }

      const output = [];

      for (const category of Object.keys(grouped)) {
        const days = grouped[category];
        const patterns = {};

        for (const day of WOCHEN_ORDER) {
          if (!days[day]) continue;

          const times = days[day];

          const pattern = times.length === 0
            ? "geschlossen"
            : times
                .map(t => `${t.von} – ${t.bis}`)
                .join("|");

          if (!patterns[pattern]) {
            patterns[pattern] = [];
          }

          patterns[pattern].push(day);
        }

        const entries = [];

        for (const pattern of Object.keys(patterns)) {
          entries.push({
            wochentage: compressDays(patterns[pattern]),
            geschlossen: pattern === "geschlossen",
            zeiten: pattern === "geschlossen"
              ? ["geschlossen"]
              : pattern.split("|")
          });
        }

        output.push({
          kategorie: category === "__DEFAULT__"
            ? null
            : category,
          eintraege: entries
        });
      }

      return res.status(200).json(output);

    } catch (err) {
      console.error("GET ÖFFNUNGSZEITEN:", err);

      return res.status(500).json({
        error: "Fehler beim Abrufen der Öffnungszeiten."
      });
    }
  },

  // ====================================
  // ADMIN: ALLE ZEITBLÖCKE ABRUFEN
  // ====================================

  getOeffzeitenForEdit: [
    authenticateToken,
    requireAdmin,

    async (req, res) => {
      try {
        const [rows] = await pool.query(`
          SELECT *
          FROM oeffnungszeiten
          ORDER BY
            kategorie,
            FIELD(wochentag, 'Mo','Di','Mi','Do','Fr','Sa','So'),
            von
        `);

        const grouped = {};

        for (const row of rows) {
          const category =
            row.kategorie?.trim() || "__DEFAULT__";

          if (!grouped[category]) {
            grouped[category] = [];
          }

          grouped[category].push({
            ...row,
            von: formatTime(row.von),
            bis: formatTime(row.bis)
          });
        }

        return res.status(200).json(grouped);

      } catch (err) {
        console.error("ADMIN GET ÖFFNUNGSZEITEN:", err);

        return res.status(500).json({
          error: "Fehler beim Laden der Öffnungszeiten."
        });
      }
    }
  ],

  // ====================================
  // ADMIN: ZEITBLOCK BEARBEITEN
  // ====================================

  updateZeitblock: [
    authenticateToken,
    requireAdmin,

    async (req, res) => {
      try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
          return res.status(400).json({
            error: "Ungültige ID."
          });
        }

        const [rows] = await pool.query(
          "SELECT * FROM oeffnungszeiten WHERE id = ?",
          [id]
        );

        if (rows.length === 0) {
          return res.status(404).json({
            error: "Zeitblock nicht gefunden."
          });
        }

        const old = rows[0];
        const body = req.body || {};

        if (
          body.kategorie !== undefined &&
          body.kategorie !== null &&
          typeof body.kategorie !== "string"
        ) {
          return res.status(400).json({
            error: "Ungültige Kategorie."
          });
        }

        const wochentag =
          body.wochentag ?? old.wochentag;

        const von = body.von === undefined
          ? formatTime(old.von)
          : body.von || null;

        const bis = body.bis === undefined
          ? formatTime(old.bis)
          : body.bis || null;

        const kategorie = body.kategorie === undefined
          ? old.kategorie
          : normalizeCategory(body.kategorie);

        const validationError = validateTimeBlock(
          wochentag,
          von,
          bis,
          kategorie
        );

        if (validationError) {
          return res.status(400).json({
            error: validationError
          });
        }

        await pool.query(
          `UPDATE oeffnungszeiten
           SET wochentag = ?,
               von = ?,
               bis = ?,
               kategorie = ?
           WHERE id = ?`,
          [
            wochentag,
            von,
            bis,
            kategorie,
            id
          ]
        );

        return res.status(200).json({
          message: "Öffnungszeiten erfolgreich aktualisiert."
        });

      } catch (err) {
        console.error("UPDATE ÖFFNUNGSZEITEN:", err);

        return res.status(500).json({
          error: "Fehler beim Aktualisieren der Öffnungszeiten."
        });
      }
    }
  ],

  // ====================================
  // ADMIN: NEUEN ZEITBLOCK HINZUFÜGEN
  // ====================================

  addZeitblock: [
    authenticateToken,
    requireAdmin,

    async (req, res) => {
      try {
        const body = req.body || {};

        const {
          wochentag,
          von,
          bis,
          kategorie
        } = body;

        if (
          kategorie !== undefined &&
          kategorie !== null &&
          typeof kategorie !== "string"
        ) {
          return res.status(400).json({
            error: "Ungültige Kategorie."
          });
        }

        const newVon = von || null;
        const newBis = bis || null;
        const newCategory = normalizeCategory(kategorie);

        const validationError = validateTimeBlock(
          wochentag,
          newVon,
          newBis,
          newCategory
        );

        if (validationError) {
          return res.status(400).json({
            error: validationError
          });
        }

        const [result] = await pool.query(
          `INSERT INTO oeffnungszeiten
           (wochentag, von, bis, kategorie)
           VALUES (?, ?, ?, ?)`,
          [
            wochentag,
            newVon,
            newBis,
            newCategory
          ]
        );

        return res.status(201).json({
          message: "Öffnungszeiten erfolgreich hinzugefügt.",
          id: result.insertId
        });

      } catch (err) {
        console.error("ADD ÖFFNUNGSZEITEN:", err);

        return res.status(500).json({
          error: "Fehler beim Hinzufügen der Öffnungszeiten."
        });
      }
    }
  ],

  // ====================================
  // ADMIN: ZEITBLOCK LÖSCHEN
  // ====================================

  deleteZeitblock: [
    authenticateToken,
    requireAdmin,

    async (req, res) => {
      try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
          return res.status(400).json({
            error: "Ungültige ID."
          });
        }

        const [result] = await pool.query(
          "DELETE FROM oeffnungszeiten WHERE id = ?",
          [id]
        );

        if (result.affectedRows === 0) {
          return res.status(404).json({
            error: "Zeitblock nicht gefunden."
          });
        }

        return res.status(200).json({
          message: "Öffnungszeiten erfolgreich gelöscht."
        });

      } catch (err) {
        console.error("DELETE ÖFFNUNGSZEITEN:", err);

        return res.status(500).json({
          error: "Fehler beim Löschen der Öffnungszeiten."
        });
      }
    }
  ]
};

module.exports = oeffnungszeitenController;