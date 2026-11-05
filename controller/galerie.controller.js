
const pool = require("../database/index");
const ImageKit = require("@imagekit/nodejs");

// ==========================================
// IMAGEKIT KONFIGURATION
// ==========================================

if (!process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_PUBLIC_KEY) {
  throw new Error("ImageKit API-Schlüssel fehlen in der .env-Datei.");
}

const imagekit = new ImageKit({
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY
});

const PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY;

// ==========================================
// AUTHENTIFIZIERUNG FÜR REACT
// GET /api/galerie/upload-auth
// ==========================================

exports.getUploadAuth = async (req, res) => {
  try {
    const authParams = imagekit.helper.getAuthenticationParameters();

    return res.status(200).json({
      ...authParams,
      publicKey: PUBLIC_KEY
    });

  } catch (error) {
    console.error("ImageKit Auth-Fehler:", error);

    return res.status(500).json({
      message: "Upload-Authentifizierung fehlgeschlagen."
    });
  }
};

// ==========================================
// GALERIE ABRUFEN
// GET /api/galerie
// ==========================================

exports.getGalerie = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, bild_url, dateiname, imagekit_file_id, created_at
       FROM galerie
       ORDER BY id DESC`
    );

    return res.status(200).json(
      rows.map((bild) => ({
        id: bild.id,
        bild_url: bild.bild_url,
        dateiname: bild.dateiname,
        imagekit_file_id: bild.imagekit_file_id,
        created_at: bild.created_at
      }))
    );

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
// {
//   "bilder": [
//     {
//       "fileId": "...",
//       "url": "...",
//       "name": "..."
//     }
//   ]
// }
// ==========================================

exports.uploadGalerie = async (req, res) => {
  const bilder = req.body.bilder;

  try {
    if (!Array.isArray(bilder) || bilder.length === 0) {
      return res.status(400).json({
        message: "Bitte mindestens ein Bild hochladen."
      });
    }

    if (bilder.length > 20) {
      return res.status(400).json({
        message: "Maximal 20 Bilder auf einmal erlaubt."
      });
    }

    for (const bild of bilder) {
      if (
        !bild.fileId ||
        typeof bild.fileId !== "string" ||
        !bild.url ||
        typeof bild.url !== "string" ||
        !bild.name ||
        typeof bild.name !== "string"
      ) {
        return res.status(400).json({
          message: "Ungültige Bildinformationen."
        });
      }

      if (
        !bild.url.startsWith(process.env.IMAGEKIT_URL_ENDPOINT + "/")
      ) {
        return res.status(400).json({
          message: "Ungültige ImageKit-Bildadresse."
        });
      }

      if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(bild.name)) {
        return res.status(400).json({
          message: "Ungültiger Bilddateiname."
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
           (bild_url, dateiname, imagekit_file_id)
           VALUES (?, ?, ?)`,
          [
            bild.url,
            bild.name,
            bild.fileId
          ]
        );

        insertedImages.push({
          id: result.insertId,
          bild_url: bild.url,
          dateiname: bild.name,
          imagekit_file_id: bild.fileId
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

    const [rows] = await pool.query(
      `SELECT id, imagekit_file_id
       FROM galerie
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Bild wurde nicht gefunden."
      });
    }

    const bild = rows[0];

    // Bild zuerst aus ImageKit entfernen
    if (bild.imagekit_file_id) {
      await imagekit.files.delete(bild.imagekit_file_id);
    }

    // Danach Datenbankeintrag entfernen
    await pool.query(
      "DELETE FROM galerie WHERE id = ?",
      [id]
    );

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
