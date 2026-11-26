
const pool = require("../database/index"); // mysql2/promise
const jwt = require("jsonwebtoken");

// ==========================================
// HOME BILDROTATION
// Automatischer Wechsel alle 24 Stunden
// ==========================================

const rotateHomeImageIfNeeded = async () => {
  const now = new Date();

  const [[rotation]] = await pool.query(
    "SELECT * FROM home_rotation LIMIT 1"
  );

  // FIRST RUN
  if (!rotation) {
    const [[first]] = await pool.query(
      "SELECT id FROM galerie ORDER BY id ASC LIMIT 1"
    );

    if (!first) return null;

    await pool.query(
      "INSERT INTO home_rotation (galerie_id, last_switch) VALUES (?, ?)",
      [first.id, now]
    );

    return first.id;
  }

  // CHECK LAST SWITCH
  const lastSwitch = new Date(rotation.last_switch);

  const hoursPassed =
    (now.getTime() - lastSwitch.getTime()) / 1000 / 60 / 60;

  // Noch keine 24 Stunden vergangen
  if (hoursPassed < 24) {
    // Prüfen, ob das aktuelle Bild noch existiert
    const [[current]] = await pool.query(
      "SELECT id FROM galerie WHERE id = ?",
      [rotation.galerie_id]
    );

    if (current) return current.id;
  }

  // NEXT IMAGE (STABLE ORDER)
  const [[next]] = await pool.query(
    "SELECT id FROM galerie WHERE id > ? ORDER BY id ASC LIMIT 1",
    [rotation.galerie_id]
  );

  let nextId;

  if (next) {
    nextId = next.id;
  } else {
    // Wieder beim ersten Bild beginnen
    const [[first]] = await pool.query(
      "SELECT id FROM galerie ORDER BY id ASC LIMIT 1"
    );

    nextId = first?.id;
  }

  // SAFETY CHECK
  if (!nextId) return null;

  await pool.query(
    "UPDATE home_rotation SET galerie_id = ?, last_switch = ?",
    [nextId, now]
  );

  return nextId;
};


// ==========================================
// AUTH MIDDLEWARE
// ==========================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "Nicht autorisiert"
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        error: "Token ungültig"
      });
    }

    req.user = {
      id: decoded.id,
      username: decoded.username,
      userTypes: decoded.userTypes || []
    };

    next();
  });
};


// ==========================================
// HOME CONTROLLER
// ==========================================

const homeController = {

  // ========================================
  // HOME CONTENT ABRUFEN
  // GET /api/home
  // ========================================

  getHomeContent: async (req, res) => {
    try {
      const galerieId = await rotateHomeImageIfNeeded();

      const [[home]] = await pool.query(
        `SELECT willkommen_text, willkommen_link, blinktext
         FROM home_content
         LIMIT 1`
      );

      let bild = null;

      if (galerieId) {
        const [[img]] = await pool.query(
          "SELECT bild_url FROM galerie WHERE id = ?",
          [galerieId]
        );

        if (img?.bild_url) {
          // Direkten Bildlink verwenden
          bild = img.bild_url;
        }
      }

      // NO CACHE
      res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, private"
      );
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");

      return res.status(200).json({
        bild,
        willkommenText: home?.willkommen_text || "",
        willkommenLink: home?.willkommen_link || "",
        blinkText: home?.blinktext || ""
      });

    } catch (err) {
      console.error("Home Fehler:", err);

      return res.status(500).json({
        error: "Home konnte nicht geladen werden"
      });
    }
  },


  // ========================================
  // HOME CONTENT AKTUALISIEREN
  // Nur Texte
  // ========================================

  updateHomeContent: async (req, res) => {
    try {
      const { userTypes } = req.user;

      if (
        !userTypes?.includes("admin") &&
        !userTypes?.includes("vorstand")
      ) {
        return res.status(403).json({
          error: "Nur Admins oder Vorstände dürfen aktualisieren."
        });
      }

      const {
        willkommenText,
        willkommenLink,
        blinkText
      } = req.body;

      // EXISTING CONTENT ABRUFEN
      const [existing] = await pool.query(
        "SELECT id FROM home_content LIMIT 1"
      );

      if (!existing.length) {
        // CREATE
        await pool.query(
          `INSERT INTO home_content
           (willkommen_text, willkommen_link, blinktext)
           VALUES (?, ?, ?)`,
          [
            willkommenText || "",
            willkommenLink || "",
            blinkText || ""
          ]
        );

      } else {
        // UPDATE
        const id = existing[0].id;

        await pool.query(
          `UPDATE home_content
           SET willkommen_text = ?,
               willkommen_link = ?,
               blinktext = ?,
               aktualisiert_am = NOW()
           WHERE id = ?`,
          [
            willkommenText || "",
            willkommenLink || "",
            blinkText || "",
            id
          ]
        );
      }

      return res.status(200).json({
        message: "Home-Content erfolgreich aktualisiert."
      });

    } catch (err) {
      console.error("Fehler beim Aktualisieren:", err);

      return res.status(500).json({
        error: "Fehler beim Aktualisieren des Home-Contents."
      });
    }
  }
};

module.exports = homeController;
