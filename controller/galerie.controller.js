
const pool = require("../database/index");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const auth = require("../middleware/auth");

const uploadDir = process.env.UPLOAD_DIR || "/var/data/uploads";
const apiBaseUrl = process.env.API_BASE_URL;

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const extension = (
            path.extname(file.originalname).toLowerCase() || ".jpg"
        );

        cb(null, `${crypto.randomUUID()}${extension}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 20
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/avif"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error("Nur JPG, PNG, WEBP, GIF und AVIF sind erlaubt."));
        }

        cb(null, true);
    }
});

function getBaseUrl(req) {
    const configuredUrl = apiBaseUrl || (
        `${req.protocol}://${req.get("host")}`
    );

    return configuredUrl.replace(/\/+$/, "");
}

function getImageUrl(req, filename) {
    return `${getBaseUrl(req)}/uploads/${encodeURIComponent(filename)}`;
}

function deleteLocalFile(filename) {
    if (!filename) return;

    const safeName = path.basename(filename);
    const filePath = path.join(uploadDir, safeName);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

const galerieController = {
    // GET /api/galerie
    // Öffentliche Galerie laden
    async getGalerie(req, res) {
        try {
            const [rows] = await pool.query(`
                SELECT id, bild_url, dateiname, erstellt_am
                FROM galerie
                ORDER BY id DESC
            `);

            return res.status(200).json(rows.map((row) => ({
                id: row.id,
                bild_url: row.dateiname
                    ? getImageUrl(req, row.dateiname)
                    : row.bild_url,
                dateiname: row.dateiname,
                erstellt_am: row.erstellt_am
            })));
        } catch (error) {
            console.error("Galerie laden:", error);

            return res.status(500).json({
                error: "Galerie konnte nicht geladen werden."
            });
        }
    },

    // POST /api/galerie
    // FormData-Feld: bilder
    uploadGalerieBilder: [
        auth,
        (req, res, next) => {
            upload.array("bilder", 20)(req, res, (error) => {
                if (!error) return next();

                if (error.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({
                        error: "Ein Bild darf maximal 10 MB gross sein."
                    });
                }

                if (error.code === "LIMIT_FILE_COUNT") {
                    return res.status(400).json({
                        error: "Maximal 20 Bilder pro Upload."
                    });
                }

                return res.status(400).json({
                    error: error.message || "Upload fehlgeschlagen."
                });
            });
        },

        async (req, res) => {
            const files = req.files || [];

            if (files.length === 0) {
                return res.status(400).json({
                    error: "Bitte mindestens ein Bild auswählen."
                });
            }

            const connection = await pool.getConnection();

            try {
                await connection.beginTransaction();

                const inserted = [];

                for (const file of files) {
                    const [result] = await connection.query(
                        `INSERT INTO galerie (bild_url, dateiname)
                         VALUES (?, ?)`,
                        ["", file.filename]
                    );

                    inserted.push({
                        id: result.insertId,
                        bild_url: getImageUrl(req, file.filename),
                        dateiname: file.filename
                    });
                }

                await connection.commit();

                return res.status(201).json({
                    message: "Bilder erfolgreich hochgeladen.",
                    anzahl: inserted.length,
                    bilder: inserted
                });
            } catch (error) {
                await connection.rollback();

                for (const file of files) {
                    try {
                        deleteLocalFile(file.filename);
                    } catch (deleteError) {
                        console.error("Datei aufräumen:", deleteError);
                    }
                }

                console.error("Galerie-Upload:", error);

                return res.status(500).json({
                    error: "Bilder konnten nicht gespeichert werden."
                });
            } finally {
                connection.release();
            }
        }
    ],

    // DELETE /api/galerie/:id
    deleteGalerieBild: [
        auth,

        async (req, res) => {
            const id = String(req.params.id);

            if (!/^\d+$/.test(id)) {
                return res.status(400).json({
                    error: "Ungültige Bild-ID."
                });
            }

            try {
                const [rows] = await pool.query(
                    `SELECT id, dateiname
                     FROM galerie
                     WHERE id = ?
                     LIMIT 1`,
                    [id]
                );

                if (rows.length === 0) {
                    return res.status(404).json({
                        error: "Bild wurde nicht gefunden."
                    });
                }

                const filename = rows[0].dateiname;

                // Erst den Datenbankeintrag löschen.
                await pool.query(
                    "DELETE FROM galerie WHERE id = ?",
                    [id]
                );

                // Danach die Datei entfernen.
                try {
                    deleteLocalFile(filename);
                } catch (error) {
                    console.error("Bilddatei löschen:", error);

                    return res.status(500).json({
                        error: "Datenbankeintrag gelöscht, aber die Bilddatei konnte nicht entfernt werden."
                    });
                }

                return res.status(200).json({
                    message: "Bild erfolgreich gelöscht."
                });
            } catch (error) {
                console.error("Galerie-Bild löschen:", error);

                return res.status(500).json({
                    error: "Bild konnte nicht gelöscht werden."
                });
            }
        }
    ]
};

module.exports = galerieController;
