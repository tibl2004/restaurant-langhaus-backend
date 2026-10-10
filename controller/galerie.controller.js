
const pool = require("../database/index");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");
const auth = require("../middleware/auth");

/*
==================================================
CLOUDINARY
==================================================
*/

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/*
==================================================
MULTER – BILDER IM ARBEITSSPEICHER VERARBEITEN
==================================================
Keine lokale Speicherung notwendig.
Funktioniert auch auf Hostern mit temporärem Dateisystem.
==================================================
*/

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 20
    },

    fileFilter: (req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith("image/")) {
            return cb(new Error("Nur Bilder sind erlaubt."));
        }

        cb(null, true);
    }
});

/*
==================================================
CLOUDINARY-UPLOAD
==================================================
*/

function uploadToCloudinary(file) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "galerie",
                resource_type: "image",
                unique_filename: true,
                overwrite: false,
                transformation: [
                    { quality: "auto" },
                    { fetch_format: "auto" }
                ]
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }

                if (!result || !result.secure_url || !result.public_id) {
                    return reject(
                        new Error("Cloudinary hat kein gültiges Bildergebnis geliefert.")
                    );
                }

                resolve(result);
            }
        );

        streamifier
            .createReadStream(file.buffer)
            .on("error", reject)
            .pipe(stream);
    });
}

/*
==================================================
CLOUDINARY-LÖSCHUNG
==================================================
*/

async function deleteFromCloudinary(publicId) {
    if (!publicId) return;

    const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image"
    });

    if (result.result !== "ok" && result.result !== "not found") {
        throw new Error("Bild konnte nicht aus Cloudinary gelöscht werden.");
    }
}

/*
==================================================
CONTROLLER
==================================================
*/

const galerieController = {

    /*
    ----------------------------------------------
    ALLE BILDER LADEN
    ----------------------------------------------
    Öffentlicher GET-Endpunkt
    ----------------------------------------------
    */

    async getGalerie(req, res) {
        try {
            const [rows] = await pool.query(`
                SELECT
                    id,
                    bild_url,
                    cloudinary_id,
                    erstellt_am
                FROM galerie
                ORDER BY id DESC
            `);

            return res.status(200).json(rows);

        } catch (error) {
            console.error("Galerie laden:", error);

            return res.status(500).json({
                error: "Galerie konnte nicht geladen werden."
            });
        }
    },

    /*
    ----------------------------------------------
    BILDER HOCHLADEN
    ----------------------------------------------
    Authentifizierung erforderlich
    FormData-Feld: bilder
    Maximal 20 Bilder pro Anfrage
    ----------------------------------------------
    */

    uploadGalerieBilder: [
        auth,
        upload.array("bilder", 20),

        async (req, res) => {
            const uploadedImages = [];

            try {
                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({
                        error: "Bitte mindestens ein Bild auswählen."
                    });
                }

                /*
                 * Zuerst Bilder hochladen.
                 */
                for (const file of req.files) {
                    const result = await uploadToCloudinary(file);

                    uploadedImages.push({
                        url: result.secure_url,
                        publicId: result.public_id
                    });
                }

                /*
                 * Anschliessend in MySQL/MariaDB speichern.
                 */
                const values = uploadedImages.map((image) => [
                    image.url,
                    image.publicId
                ]);

                await pool.query(
                    `
                    INSERT INTO galerie (
                        bild_url,
                        cloudinary_id
                    )
                    VALUES ?
                    `,
                    [values]
                );

                return res.status(201).json({
                    message: "Bilder erfolgreich hochgeladen.",
                    anzahl: uploadedImages.length,
                    bilder: uploadedImages.map((image) => ({
                        url: image.url,
                        publicId: image.publicId
                    }))
                });

            } catch (error) {
                console.error("Galerie-Upload:", error);

                /*
                 * Falls die Datenbank-Speicherung scheitert,
                 * versuchen, die bereits hochgeladenen Bilder
                 * wieder aus Cloudinary zu entfernen.
                 */
                await Promise.allSettled(
                    uploadedImages.map((image) =>
                        deleteFromCloudinary(image.publicId)
                    )
                );

                if (error.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({
                        error: "Ein Bild darf maximal 10 MB gross sein."
                    });
                }

                if (error.code === "LIMIT_FILE_COUNT") {
                    return res.status(400).json({
                        error: "Es sind maximal 20 Bilder pro Upload erlaubt."
                    });
                }

                return res.status(500).json({
                    error: "Bilder konnten nicht hochgeladen werden."
                });
            }
        }
    ],

    /*
    ----------------------------------------------
    BILD LÖSCHEN
    ----------------------------------------------
    Authentifizierung erforderlich
    ----------------------------------------------
    */

    deleteGalerieBild: [
        auth,

        async (req, res) => {
            try {
                const id = req.params.id;

                if (!/^\d+$/.test(String(id))) {
                    return res.status(400).json({
                        error: "Ungültige Bild-ID."
                    });
                }

                const [rows] = await pool.query(
                    `
                    SELECT cloudinary_id
                    FROM galerie
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [id]
                );

                if (rows.length === 0) {
                    return res.status(404).json({
                        error: "Bild wurde nicht gefunden."
                    });
                }

                const publicId = rows[0].cloudinary_id;

                /*
                 * Erst Cloudinary löschen.
                 * Bei einem Fehler bleibt der Datenbankeintrag erhalten.
                 */
                try {
                    await deleteFromCloudinary(publicId);
                } catch (cloudinaryError) {
                    console.error("Cloudinary-Löschung:", cloudinaryError);

                    return res.status(502).json({
                        error: "Das Bild konnte beim Bildanbieter nicht gelöscht werden."
                    });
                }

                await pool.query(
                    `
                    DELETE FROM galerie
                    WHERE id = ?
                    `,
                    [id]
                );

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
