
const pool = require("../database/index");

// ==========================================
// GALERIE ABRUFEN
// GET /api/galerie
// ==========================================

exports.getGalerie = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, bild_url, dateiname, created_at
       FROM galerie
       ORDER BY id DESC`
    );

    return res.status(200).json(rows);

  } catch (error) {
    console.error("Fehler beim Abrufen der Galerie:", error);

    return res.status(500).json({
      message: "Die Galerie konnte nicht geladen werden."
    });
  }
};


// ==========================================
// BILDER IN MYSQL SPEICHERN
// POST /api/galerie
//
// Erwartet JSON:
//
// {
//   "bilder": [
//     {
//       "url": "https://example.com/bild.jpg",
//       "name": "bild.jpg"
//     }
//   ]
// }
// ==========================================

exports.uploadGalerie = async (req, res) => {
  const bilder = req.body.bilder;

  try {
    if (!Array.isArray(bilder) || bilder.length === 0) {
      return res.status(400).json({
        message: "Bitte mindestens einen Bildlink angeben."
      });
    }

    if (bilder.length > 20) {
      return res.status(400).json({
        message: "Maximal 20 Bilder auf einmal erlaubt."
      });
    }

    for (const bild of bilder) {
      if (
        !bild.url ||
        typeof bild.url !== "string" ||
        !bild.name ||
        typeof bild.name !== "string"
      ) {
        return res.status(400).json({
          message: "Ungültige Bildinformationen."
        });
      }

      // Nur gültige HTTP- und HTTPS-Links erlauben
      let parsedUrl;

      try {
        parsedUrl = new URL(bild.url);
      } catch {
        return res.status(400).json({
          message: "Ungültiger Bildlink."
        });
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return res.status(400).json({
          message: "Nur HTTP- und HTTPS-Bildlinks sind erlaubt."
        });
      }

      if (!/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(parsedUrl.pathname + parsedUrl.search)) {
        return res.status(400).json({
          message: "Ungültiger Bildlink. Erlaubt sind JPG, JPEG, PNG, WEBP und GIF."
        });
      }

      if (bild.name.length > 255) {
        return res.status(400).json({
          message: "Der Dateiname ist zu lang."
        });
      }
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const insertedImages = [];

      for (const bild of bilder) {
        const [result] = await connection.query(
          `INSERT INTO galerie
           (bild_url, dateiname)
           VALUES (?, ?)`,
          [
            bild.url,
            bild.name
          ]
        );

        insertedImages.push({
          id: result.insertId,
          bild_url: bild.url,
          dateiname: bild.name
        });
      }

      await connection.commit();

      return res.status(201).json({
        message: "Bilder wurden erfolgreich gespeichert.",
        bilder: insertedImages
      });

    } catch (dbError) {
      await connection.rollback();
      throw dbError;

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error("Fehler beim Speichern der Galerie:", error);

    return res.status(500).json({
      message: "Die Bilder konnten nicht gespeichert werden."
    });
  }
};


// ==========================================
// BILD LÖSCHEN
// DELETE /api/galerie/:id
// ==========================================

exports.deleteGalerie = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        message: "Ungültige Bild-ID."
      });
    }

    const [result] = await pool.query(
      "DELETE FROM galerie WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Bild wurde nicht gefunden."
      });
    }

    return res.status(200).json({
      message: "Bild wurde erfolgreich gelöscht."
    });

  } catch (error) {
    console.error("Fehler beim Löschen:", error);

    return res.status(500).json({
      message: "Das Bild konnte nicht gelöscht werden."
    });
  }
};
