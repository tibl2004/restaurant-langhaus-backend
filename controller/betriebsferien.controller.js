const pool = require("../database/index");
const auth = require("../middleware/auth.js");
/* =========================
   CONTROLLER
========================= */
const betriebsferienController = {

  /* =========================
     PUBLIC – ALLE LADEN
  ========================= */
  getAktiveBetriebsferien: async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM betriebsferien
         WHERE CURDATE() BETWEEN von AND bis
         ORDER BY von ASC`
      );
  
      res.json({
        active: rows.length > 0,
        ferien: rows
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Laden" });
    }
  },

  /* =========================
     ADMIN – HINZUFÜGEN
  ========================= */
  addBetriebsferien: [
    authenticateToken,
    async (req, res) => {
      try {
        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admin erlaubt" });
        }

        const { von, bis, beschreibung } = req.body;

        if (!von || !bis) {
          return res.status(400).json({ error: "Von/Bis erforderlich" });
        }

        await pool.query(
          "INSERT INTO betriebsferien (von, bis, beschreibung) VALUES (?, ?, ?)",
          [von, bis, beschreibung || null]
        );

        res.status(201).json({ message: "Betriebsferien hinzugefügt" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler beim Speichern" });
      }
    }
  ],

  /* =========================
     ADMIN – UPDATE
  ========================= */
  updateBetriebsferien: [
    authenticateToken,
    async (req, res) => {
      try {
        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admin erlaubt" });
        }

        const { id } = req.params;
        const { von, bis, beschreibung } = req.body;

        const [rows] = await pool.query(
          "SELECT * FROM betriebsferien WHERE id=?",
          [id]
        );

        if (!rows.length) {
          return res.status(404).json({ error: "Nicht gefunden" });
        }

        await pool.query(
          "UPDATE betriebsferien SET von=?, bis=?, beschreibung=? WHERE id=?",
          [
            von || rows[0].von,
            bis || rows[0].bis,
            beschreibung || rows[0].beschreibung,
            id
          ]
        );

        res.json({ message: "Aktualisiert" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler beim Update" });
      }
    }
  ],

  /* =========================
     ADMIN – DELETE
  ========================= */
  deleteBetriebsferien: [
    authenticateToken,
    async (req, res) => {
      try {
        if (!req.user.userTypes.includes("admin")) {
          return res.status(403).json({ error: "Nur Admin erlaubt" });
        }

        const { id } = req.params;

        const [result] = await pool.query(
          "DELETE FROM betriebsferien WHERE id=?",
          [id]
        );

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: "Nicht gefunden" });
        }

        res.json({ message: "Gelöscht" });

      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fehler beim Löschen" });
      }
    }
  ]
};

module.exports = betriebsferienController;