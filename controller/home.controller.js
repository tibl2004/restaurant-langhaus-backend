const pool = require("../database/index"); // mysql2/promise
const jwt = require("jsonwebtoken");


// 🔹 Home Rotation: alle 12h nächstes Galerie-Bild
const rotateHomeImageIfNeeded = async () => {
  const now = new Date();

  // Prüfen, ob schon ein Eintrag in home_rotation existiert
  const [rotationRows] = await pool.query(
    "SELECT * FROM home_rotation LIMIT 1"
  );

  // 🟢 Erststart: noch keine Rotation → erstes Galerie-Bild nehmen
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

  // Noch keine 12 Stunden vergangen → aktuelles Bild behalten
  if (diffHours < 12) return rotation.galerie_id;

  // 🔁 Nächstes Galerie-Bild
  const [next] = await pool.query(
    "SELECT id FROM galerie WHERE id > ? ORDER BY id ASC LIMIT 1",
    [rotation.galerie_id]
  );

  let nextId;
  if (next.length) {
    nextId = next[0].id;
  } else {
    // Wenn Ende erreicht → wieder von vorne
    const [first] = await pool.query(
      "SELECT id FROM galerie ORDER BY id ASC LIMIT 1"
    );
    nextId = first[0].id;
  }

  // Rotation aktualisieren
  await pool.query(
    "UPDATE home_rotation SET galerie_id = ?, last_switch = ?",
    [nextId, now]
  );

  return nextId;
};

// 🔹 Home Controller
const homeController = {

    // 🔐 JWT Auth
    authenticateToken: (req, res, next) => {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Kein Token" });
  
      jwt.verify(token, "secretKey", (err, user) => {
        if (err) return res.status(403).json({ error: "Ungültiger Token" });
        req.user = user;
        next();
      });
    },
  // 🔹 Home Content abrufen
  getHomeContent: async (req, res) => {
    try {
      // aktuelles Galerie-Bild ermitteln
      const galerieId = await rotateHomeImageIfNeeded();

      // Willkommenstext, Willkommenlink, Blinktext aus home_content
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
          // URL für Frontend
          bild = `${req.protocol}://${req.get("host")}${img.bild.startsWith("/") ? "" : "/"}${img.bild}`;
        }
      }

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
