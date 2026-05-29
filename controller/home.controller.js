const pool = require("../database/index"); // mysql2/promise
const jwt = require("jsonwebtoken");


const rotateHomeImageIfNeeded = async () => {

  const now = new Date();

  const [[rotation]] = await pool.query(
    "SELECT * FROM home_rotation LIMIT 1"
  );

  // 🟢 FIRST RUN
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

  const lastSwitch = new Date(rotation.last_switch);

  const hoursPassed =
    (now.getTime() - lastSwitch.getTime()) /
    1000 / 60 / 60;

  // 🔥 24h CHECK
  if (hoursPassed < 24) {
    return rotation.galerie_id;
  }

  // 🔁 NEXT IMAGE (SORTED STABLE)
  const [[next]] = await pool.query(
    "SELECT id FROM galerie WHERE id > ? ORDER BY id ASC LIMIT 1",
    [rotation.galerie_id]
  );

  let nextId;

  if (next) {
    nextId = next.id;
  } else {
    const [[first]] = await pool.query(
      "SELECT id FROM galerie ORDER BY id ASC LIMIT 1"
    );

    nextId = first?.id;
  }

  // ❗ SAFETY CHECK (WICHTIG)
  if (!nextId) return rotation.galerie_id;

  await pool.query(
    "UPDATE home_rotation SET galerie_id = ?, last_switch = ?",
    [nextId, now]
  );

  return nextId;
};
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

    // ✅ FIX: userTypes hinzufügen
    req.user = {
      id: decoded.id,
      username: decoded.username,
      userTypes: decoded.userTypes || []
    };

    next();
  });
};
// 🔹 Home Controller
const homeController = {

  // 🔹 Home Content abrufen
  getHomeContent: async (req, res) => {
    try {
  
      const galerieId = await rotateHomeImageIfNeeded();
  
      const [[home]] = await pool.query(
        "SELECT willkommen_text, willkommen_link, blinktext FROM home_content LIMIT 1"
      );
  
      let bild = null;
  
      if (galerieId) {
  
        const [[img]] = await pool.query(
          "SELECT bild FROM galerie WHERE id = ?",
          [galerieId]
        );
  
        if (img?.bild) {
  
          bild = `${req.protocol}://${req.get("host")}${img.bild}`;
        }
      }
  
      // 🔥 CRITICAL: NO CACHE (SONST BLEIBT BILD ALT)
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
  
      res.status(200).json({
        bild,
        willkommenText: home?.willkommen_text || "",
        willkommenLink: home?.willkommen_link || "",
        blinkText: home?.blinktext || "",
      });
  
    } catch (err) {
      console.error("Home Fehler:", err);
      res.status(500).json({ error: "Home konnte nicht geladen werden" });
    }
  },

  // 🔹 Home Content aktualisieren (nur Texte)
  updateHomeContent: async (req, res) => {
    try {
      const { userTypes } = req.user;
      if (!userTypes?.includes("admin") && !userTypes?.includes("vorstand"))
        return res.status(403).json({ error: "Nur Admins oder Vorstände dürfen aktualisieren." });

      const { willkommenText, willkommenLink, blinkText } = req.body;

      // Existierenden Content abrufen
      const [existing] = await pool.query(
        "SELECT id FROM home_content LIMIT 1"
      );

      if (!existing.length) {
        // Wenn kein Eintrag existiert → CREATE
        await pool.query(
          "INSERT INTO home_content (willkommen_text, willkommen_link, blinktext) VALUES (?, ?, ?)",
          [willkommenText || "", willkommenLink || "", blinkText || ""]
        );
      } else {
        const id = existing[0].id;
        await pool.query(
          "UPDATE home_content SET willkommen_text = ?, willkommen_link = ?, blinktext = ?, aktualisiert_am = NOW() WHERE id = ?",
          [willkommenText || "", willkommenLink || "", blinkText || "", id]
        );
      }

      res.status(200).json({ message: "Home-Content erfolgreich aktualisiert." });
    } catch (err) {
      console.error("Fehler beim Aktualisieren:", err);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Home-Contents." });
    }
  }
};

module.exports = homeController;
