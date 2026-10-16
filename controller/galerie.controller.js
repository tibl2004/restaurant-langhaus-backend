const pool = require("../database/index");
const multer = require("multer");
const path = require("path");

// ==========================================
// KONFIGURATION
// ==========================================

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 20;

const ALLOWED_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif"
];

const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
];

// ==========================================
// MULTER – SPEICHERUNG IM ARBEITSSPEICHER
// Keine lokalen Dateien / kein Render-Disk
// ==========================================

const storage = multer.memoryStorage();

const upload = multer({
    storage,

    limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILES
    },

    fileFilter: (req, file, cb) => {
        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        if (
            !ALLOWED_EXTENSIONS.includes(extension) ||
            !ALLOWED_MIME_TYPES.includes(file.mimetype)
        ) {
            return cb(
                new Error(
                    "Erlaubt sind JPG-, PNG-, WEBP- und GIF-Bilder."
                )
            );
        }

        cb(null, true);
    }
});

// ==========================================
// UPLOAD-MIDDLEWARE
// POST /api/galerie
// Formularfeld: bilder
// ==========================================

exports.uploadMiddleware = (req, res, next) => {
    upload.array("bilder", MAX_FILES)(
        req,
        res,
        (error) => {
            if (!error) {
                return next();
            }

            console.error(
                "Galerie-Upload-Fehler:",
                error.message
            );

            if (error instanceof multer.MulterError) {
                const messages = {
                    LIMIT_FILE_SIZE:
                        "Ein Bild darf maximal 10 MB gross sein.",

                    LIMIT_FILE_COUNT:
                        "Es dürfen maximal 20 Bilder gleichzeitig hochgeladen werden.",

                    LIMIT_UNEXPECTED_FILE:
                        'Das Upload-Feld muss "bilder" heissen.'
                };

                return res.status(400).json({
                    message:
                        messages[error.code] ||
                        "Fehler beim Hochladen der Bilder."
                });
            }

            return res.status(400).json({
                message: error.message ||
                    "Ungültiger Bild-Upload."
            });
        }
    );
};

// ==========================================
// MIME-TYPE SICHERHEIT
// ==========================================

function isAllowedImage(file) {
    const extension = path
        .extname(file.originalname)
        .toLowerCase();

    return (
        ALLOWED_EXTENSIONS.includes(extension) &&
        ALLOWED_MIME_TYPES.includes(file.mimetype)
    );
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
                mime_type,
                created_at
             FROM galerie
             ORDER BY id DESC`
        );

        const galerie = rows.map((bild) => ({
            id: bild.id,

            // Bilder aus der Datenbank werden über
            // einen separaten Endpunkt ausgeliefert.
            bild_url: bild.mime_type
                ? `/api/galerie/${bild.id}/bild`
                : bild.bild_url,

            dateiname: bild.dateiname,
            mime_type: bild.mime_type,
            created_at: bild.created_at
        }));

        return res.status(200).json(galerie);

    } catch (error) {
        console.error(
            "Fehler beim Abrufen der Galerie:",
            error
        );

        return res.status(500).json({
            message:
                "Die Galerie konnte nicht geladen werden."
        });
    }
};

// ==========================================
// EINZELNES BILD AUSLIEFERN
// GET /api/galerie/:id/bild
// ==========================================

exports.getGalerieBild = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^\d+$/.test(id)) {
            return res.status(400).json({
                message: "Ungültige Bild-ID."
            });
        }

        const [rows] = await pool.query(
            `SELECT bild, mime_type
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

        const image = rows[0];

        if (!image.bild || !image.mime_type) {
            return res.status(404).json({
                message:
                    "Für dieses Bild sind keine gespeicherten Bilddaten vorhanden."
            });
        }

        if (!ALLOWED_MIME_TYPES.includes(image.mime_type)) {
            return res.status(415).json({
                message: "Nicht unterstützter Bildtyp."
            });
        }

        res.setHeader(
            "Content-Type",
            image.mime_type
        );

        res.setHeader(
            "X-Content-Type-Options",
            "nosniff"
        );

        res.setHeader(
            "Cache-Control",
            "public, max-age=86400"
        );

        return res.status(200).send(image.bild);

    } catch (error) {
        console.error(
            "Fehler beim Ausliefern des Bildes:",
            error
        );

        return res.status(500).json({
            message:
                "Das Bild konnte nicht geladen werden."
        });
    }
};

// ==========================================
// BILDER HOCHLADEN
// POST /api/galerie
// Multipart-FormData: bilder
// ==========================================

exports.uploadGalerie = async (req, res) => {
    const files = req.files || [];

    if (files.length === 0) {
        return res.status(400).json({
            message:
                "Bitte mindestens ein Bild auswählen."
        });
    }

    // Zusätzliche Prüfung vor dem Speichern.
    for (const file of files) {
        if (!isAllowedImage(file)) {
            return res.status(400).json({
                message:
                    "Ein Bild besitzt einen ungültigen Dateityp."
            });
        }

        if (!file.buffer || file.buffer.length === 0) {
            return res.status(400).json({
                message:
                    "Eine Bilddatei ist leer oder ungültig."
            });
        }
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        const insertedImages = [];

        for (const file of files) {
            const extension = path
                .extname(file.originalname)
                .toLowerCase();

            const dateiname =
                `galerie-${Date.now()}-${Math.round(
                    Math.random() * 1e9
                )}${extension}`;

            const [result] = await connection.query(
                `INSERT INTO galerie (
                    bild_url,
                    dateiname,
                    bild,
                    mime_type
                )
                VALUES (?, ?, ?, ?)`,
                [
                    null,
                    dateiname,
                    file.buffer,
                    file.mimetype
                ]
            );

            insertedImages.push({
                id: result.insertId,
                bild_url:
                    `/api/galerie/${result.insertId}/bild`,
                dateiname,
                mime_type: file.mimetype
            });
        }

        await connection.commit();

        return res.status(201).json({
            message:
                "Bilder wurden erfolgreich in der Datenbank gespeichert.",

            bilder: insertedImages
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Rollback fehlgeschlagen:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Fehler beim Speichern der Galerie:",
            error
        );

        return res.status(500).json({
            message:
                "Die Bilder konnten nicht gespeichert werden."
        });

    } finally {
        if (connection) {
            connection.release();
        }
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
            `DELETE FROM galerie
             WHERE id = ?`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message:
                    "Bild wurde nicht gefunden."
            });
        }

        return res.status(200).json({
            message:
                "Bild wurde erfolgreich gelöscht."
        });

    } catch (error) {
        console.error(
            "Fehler beim Löschen des Bildes:",
            error
        );

        return res.status(500).json({
            message:
                "Das Bild konnte nicht gelöscht werden."
        });
    }
};