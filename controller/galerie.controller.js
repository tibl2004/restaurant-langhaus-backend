
const pool = require("../database/index");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ==========================================
// KONFIGURATION
// ==========================================

// Render Persistent Disk muss unter /var/data gemountet sein.
// In Render als Environment Variable setzen:
// UPLOAD_DIR=/var/data/uploads

const uploadDir =
  process.env.UPLOAD_DIR || "/var/data/uploads";

// Verzeichnis erstellen, sofern es nicht existiert.
// Funktioniert nur, wenn der Speicherort beschreibbar ist.
fs.mkdirSync(uploadDir, { recursive: true });

// ==========================================
// MULTER KONFIGURATION
// ==========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const allowedExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif"
    ];

    if (!allowedExtensions.includes(extension)) {
      return cb(new Error("Dieses Bildformat ist nicht erlaubt."));
    }

    const uniqueName =
      `galerie-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20
  },

  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error("Erlaubt sind JPG-, PNG-, WEBP- und GIF-Bilder.")
      );
    }

    cb(null, true);
  }
});

// ==========================================
// BILD-URL ERSTELLEN
// ==========================================

function getImageUrl(filename) {
  const baseUrl = (
    process.env.API_BASE_URL ||
    "https://DEIN-BACKEND.onrender.com"
  ).replace(/\/+$/, "");

  return `${baseUrl}/uploads/${encodeURIComponent(filename)}`;
}

// ==========================================
// GALERIE ABRUFEN
// GET /api/galerie
// ==========================================

exports.getGalerie = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         id,
         bild_url,
         dateiname,
         created_at
       FROM galerie
       ORDER BY id DESC`
    );

    const galerie = rows.map((bild) => ({
      id: bild.id,

      // Vorhandene URLs bleiben kompatibel.
      bild_url: bild.dateiname
        ? getImageUrl(bild.dateiname)
        : bild.bild_url,

      dateiname: bild.dateiname,
      created_at: bild.created_at
    }));

    return res.status(200).json(galerie);
  } catch (error) {
    console.error("Fehler beim Abrufen der Galerie:", error);

    return res.status(500).json({
      message: "Die Galerie konnte nicht geladen werden."
    });
  }
};

// ==========================================
// BILDER HOCHLADEN
// POST /api/galerie
// Multipart-FormData: bilder
// ==========================================

exports.uploadGalerie = async (req, res) => {
  const uploadedFiles = req.files || [];

  try {
    if (uploadedFiles.length === 0) {
      return res.status(400).json({
        message: "Bitte mindestens ein Bild auswählen."
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const insertedImages = [];

      for (const file of uploadedFiles) {
        const bildUrl = getImageUrl(file.filename);

        const [result] = await connection.query(
          `INSERT INTO galerie (bild_url, dateiname)
           VALUES (?, ?)`,
          [bildUrl, file.filename]
        );

        insertedImages.push({
          id: result.insertId,
          bild_url: bildUrl,
          dateiname: file.filename
        });
      }

      await connection.commit();

      return res.status(201).json({
        message: "Bilder wurden erfolgreich hochgeladen.",
        bilder: insertedImages
      });
    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    } finally {
      connection.release();
    }
  } catch (error) {
    // Bei Datenbankfehlern keine ungenutzten Uploads liegen lassen.
    for (const file of uploadedFiles) {
      try {
        fs.unlinkSync(file.path);
      } catch (unlinkError) {
        console.error(
          "Temporäres Bild konnte nicht entfernt werden:",
          unlinkError.message
        );
      }
    }

    console.error("Fehler beim Hochladen:", error);

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
      `SELECT id, dateiname
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

    await pool.query(
      "DELETE FROM galerie WHERE id = ?",
      [id]
    );

    if (bild.dateiname) {
      const filePath = path.join(uploadDir, bild.dateiname);

      // Nur Dateien direkt aus dem Galerie-Verzeichnis löschen.
      if (path.basename(bild.dateiname) === bild.dateiname) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error(
            "Bilddatei konnte nicht gelöscht werden:",
            fileError.message
          );
        }
      }
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

// ==========================================
// MULTER-MIDDLEWARE EXPORTIEREN
// ==========================================

exports.uploadMiddleware = upload.array("bilder", 20);
