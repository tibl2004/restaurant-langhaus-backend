const pool = require("../database/index");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ==========================================
// KONFIGURATION
// ==========================================

// Render Persistent Disk: Mount Path = /var/data
// Environment Variable: UPLOAD_DIR=/var/data/uploads

let uploadDir = process.env.UPLOAD_DIR || "/var/data/uploads";

try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (error) {
  console.error(
    `Upload-Verzeichnis ${uploadDir} nicht beschreibbar:`,
    error.message
  );

  // Fallback nur zum Testen: Dateien gehen bei Redeploy verloren!
  uploadDir = path.join(__dirname, "..", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  console.warn(`Fallback-Verzeichnis wird verwendet: ${uploadDir}`);
}

// Wird auch von app.js für express.static benötigt
exports.uploadDir = uploadDir;

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
];

// ==========================================
// MULTER KONFIGURATION
// ==========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const uniqueName =
      `galerie-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB pro Bild
    files: 20
  },

  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (
      !ALLOWED_EXTENSIONS.includes(extension) ||
      !ALLOWED_MIME_TYPES.includes(file.mimetype)
    ) {
      return cb(
        new Error("Erlaubt sind JPG-, PNG-, WEBP- und GIF-Bilder.")
      );
    }

    cb(null, true);
  }
});

// Middleware mit sauberer Fehlerbehandlung (statt Server-Crash / HTML-Fehler)
exports.uploadMiddleware = (req, res, next) => {
  upload.array("bilder", 20)(req, res, (error) => {
    if (!error) return next();

    console.error("Upload-Fehler:", error.message);

    if (error instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: "Ein Bild ist größer als 10 MB.",
        LIMIT_FILE_COUNT: "Maximal 20 Bilder auf einmal erlaubt.",
        LIMIT_UNEXPECTED_FILE:
          'Falsches Formularfeld. Das Feld muss "bilder" heißen.'
      };

      return res.status(400).json({
        message: messages[error.code] || "Fehler beim Hochladen."
      });
    }

    return res.status(400).json({ message: error.message });
  });
};

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
      `SELECT id, bild_url, dateiname, created_at
       FROM galerie
       ORDER BY id DESC`
    );

    const galerie = rows.map((bild) => ({
      id: bild.id,
      // Alte URLs ohne Dateiname bleiben kompatibel
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
// Multipart-FormData, Feldname: bilder
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
    // Bei Fehlern keine verwaisten Dateien liegen lassen
    for (const file of uploadedFiles) {
      try {
        fs.unlinkSync(file.path);
      } catch (unlinkError) {
        console.error(
          "Bild konnte nicht entfernt werden:",
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
      return res.status(400).json({ message: "Ungültige Bild-ID." });
    }

    const [rows] = await pool.query(
      `SELECT id, dateiname
       FROM galerie
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Bild wurde nicht gefunden." });
    }

    const bild = rows[0];

    await pool.query("DELETE FROM galerie WHERE id = ?", [id]);

    // Nur Dateien direkt aus dem Upload-Verzeichnis löschen
    if (bild.dateiname && path.basename(bild.dateiname) === bild.dateiname) {
      const filePath = path.join(uploadDir, bild.dateiname);

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