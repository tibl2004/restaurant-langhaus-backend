
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const generateCardPDF = async (
    cardId,
    cardName,
    categoriesWithItems,
    options = {}
) => {
    try {
        // --------------------------------
        // KONFIGURATION
        // --------------------------------

        const uploadDir = path.join(__dirname, "../uploads");

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(
            uploadDir,
            `menu_card_${cardId}.pdf`
        );

        const doc = new PDFDocument({
            size: "A4",
            margins: {
                top: 65,
                bottom: 65,
                left: 58,
                right: 58
            },
            bufferPages: false,
            autoFirstPage: true
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // --------------------------------
        // DESIGN
        // --------------------------------

        const COLORS = {
            background: "#FDFCF9",
            primary: "#243D35",
            text: "#252925",
            secondary: "#777D76",
            accent: "#B49A70",
            line: "#E5E1D8",
            white: "#FFFFFF"
        };

        const PAGE_WIDTH = doc.page.width;
        const PAGE_HEIGHT = doc.page.height;

        const LEFT = 58;
        const RIGHT = PAGE_WIDTH - 58;
        const CONTENT_WIDTH = RIGHT - LEFT;
        const BOTTOM = PAGE_HEIGHT - 70;

        const FONTS = {
            heading: "Times-Roman",
            headingBold: "Times-Bold",
            body: "Helvetica",
            bodyBold: "Helvetica-Bold",
            italic: "Helvetica-Oblique"
        };

        // Optionale eigene Schriftarten
        if (options.fonts) {
            Object.entries(options.fonts).forEach(([name, fontPath]) => {
                if (fs.existsSync(fontPath)) {
                    doc.registerFont(name, fontPath);
                }
            });

            if (options.fonts.heading) {
                FONTS.heading = "heading";
            }

            if (options.fonts.headingBold) {
                FONTS.headingBold = "headingBold";
            }

            if (options.fonts.body) {
                FONTS.body = "body";
            }

            if (options.fonts.bodyBold) {
                FONTS.bodyBold = "bodyBold";
            }
        }

        let pageNumber = 1;

        // --------------------------------
        // HILFSFUNKTIONEN
        // --------------------------------

        const drawBackground = () => {
            doc.save();

            doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
                .fill(COLORS.background);

            doc.restore();
        };

        const drawFooter = () => {
            const footerY = PAGE_HEIGHT - 48;

            doc.save();

            doc.moveTo(LEFT, footerY - 12)
                .lineTo(RIGHT, footerY - 12)
                .lineWidth(0.6)
                .strokeColor(COLORS.line)
                .stroke();

            doc.font(FONTS.body)
                .fontSize(8)
                .fillColor(COLORS.secondary)
                .text(
                    options.footerText || "RESTAURANT LANGHAUS",
                    LEFT,
                    footerY,
                    {
                        width: CONTENT_WIDTH / 2,
                        characterSpacing: 0.8
                    }
                );

            doc.font(FONTS.body)
                .fontSize(8)
                .fillColor(COLORS.secondary)
                .text(
                    `SEITE ${pageNumber}`,
                    RIGHT - CONTENT_WIDTH / 2,
                    footerY,
                    {
                        width: CONTENT_WIDTH / 2,
                        align: "right"
                    }
                );

            doc.restore();
        };

        const addNewPage = () => {
            drawFooter();

            doc.addPage({
                size: "A4",
                margins: {
                    top: 65,
                    bottom: 65,
                    left: 58,
                    right: 58
                }
            });

            pageNumber++;

            drawBackground();

            doc.y = 65;
        };

        const ensureSpace = (height) => {
            if (doc.y + height > BOTTOM) {
                addNewPage();
            }
        };

        const formatPrice = (price) => {
            const number = Number(price);

            if (!Number.isFinite(number)) {
                return "";
            }

            return new Intl.NumberFormat("de-CH", {
                style: "currency",
                currency: "CHF"
            }).format(number);
        };

        // --------------------------------
        // HINTERGRUND
        // --------------------------------

        drawBackground();

        // --------------------------------
        // HEADER
        // --------------------------------

        const logoPath = options.logoPath;

        if (logoPath && fs.existsSync(logoPath)) {
            doc.image(logoPath, {
                fit: [85, 65],
                align: "center",
                valign: "center"
            });

            doc.moveDown(0.5);
        }

        doc.moveDown(1);

        // Kleine Überschrift
        doc.font(FONTS.body)
            .fontSize(9)
            .fillColor(COLORS.accent)
            .text(
                options.subtitle || "RESTAURANT & GENUSS",
                LEFT,
                doc.y,
                {
                    width: CONTENT_WIDTH,
                    align: "center",
                    characterSpacing: 2.5
                }
            );

        doc.moveDown(0.6);

        // Restaurant- / Kartenname
        doc.font(FONTS.heading)
            .fontSize(32)
            .fillColor(COLORS.primary)
            .text(cardName, LEFT, doc.y, {
                width: CONTENT_WIDTH,
                align: "center"
            });

        doc.moveDown(0.7);

        // Dekorative Linie
        const center = PAGE_WIDTH / 2;

        doc.moveTo(center - 35, doc.y)
            .lineTo(center + 35, doc.y)
            .lineWidth(1.2)
            .strokeColor(COLORS.accent)
            .stroke();

        doc.moveDown(2);

        // --------------------------------
        // KATEGORIEN
        // --------------------------------

        for (const category of categoriesWithItems || []) {

            if (!category || !Array.isArray(category.items)) {
                continue;
            }

            if (category.items.length === 0) {
                continue;
            }

            ensureSpace(65);

            // Kategorieüberschrift
            doc.font(FONTS.heading)
                .fontSize(20)
                .fillColor(COLORS.primary)
                .text(category.name || "Weitere Gerichte", LEFT, doc.y, {
                    width: CONTENT_WIDTH
                });

            doc.moveDown(0.3);

            // Dezente Trennlinie
            doc.moveTo(LEFT, doc.y)
                .lineTo(RIGHT, doc.y)
                .lineWidth(0.7)
                .strokeColor(COLORS.accent)
                .stroke();

            doc.moveDown(0.8);

            // --------------------------------
            // GERICHTE
            // --------------------------------

            for (const item of category.items) {

                if (!item || !item.title) {
                    continue;
                }

                const title = String(item.title);
                const description = item.description
                    ? String(item.description)
                    : "";

                const price = formatPrice(item.price);

                const titleWidth = CONTENT_WIDTH - 105;

                const titleHeight = doc.heightOfString(title, {
                    font: FONTS.bodyBold,
                    fontSize: 11.5,
                    width: titleWidth
                });

                const descriptionHeight = description
                    ? doc.heightOfString(description, {
                        font: FONTS.italic,
                        fontSize: 9,
                        width: CONTENT_WIDTH - 12,
                        lineGap: 2
                    })
                    : 0;

                const itemHeight =
                    Math.max(titleHeight, 16) +
                    (description ? descriptionHeight + 7 : 0) +
                    22;

                ensureSpace(itemHeight);

                const startY = doc.y;

                // Gerichtstitel
                doc.font(FONTS.bodyBold)
                    .fontSize(11.5)
                    .fillColor(COLORS.text)
                    .text(title, LEFT, startY, {
                        width: titleWidth,
                        lineGap: 2
                    });

                // Preis rechtsbündig
                doc.font(FONTS.bodyBold)
                    .fontSize(11)
                    .fillColor(COLORS.primary)
                    .text(price, RIGHT - 100, startY, {
                        width: 100,
                        align: "right"
                    });

                // Beschreibung
                let currentY = startY + Math.max(titleHeight, 16);

                if (description) {
                    currentY += 4;

                    doc.font(FONTS.italic)
                        .fontSize(9)
                        .fillColor(COLORS.secondary)
                        .text(description, LEFT + 2, currentY, {
                            width: CONTENT_WIDTH - 12,
                            lineGap: 2
                        });

                    currentY = doc.y;
                }

                // Optionale Allergene
                if (item.allergens) {
                    currentY += 4;

                    doc.font(FONTS.body)
                        .fontSize(8)
                        .fillColor(COLORS.secondary)
                        .text(
                            `Allergene: ${item.allergens}`,
                            LEFT + 2,
                            currentY
                        );

                    currentY = doc.y;
                }

                doc.y = Math.max(
                    startY + itemHeight - 22,
                    currentY + 10
                );
            }

            doc.moveDown(1.2);
        }

        // --------------------------------
        // FOOTER
        // --------------------------------

        drawFooter();

        // PDF abschliessen
        doc.end();

        // Auf fertige Datei warten
        return await new Promise((resolve, reject) => {
            stream.on("finish", () => {
                resolve(filePath);
            });

            stream.on("error", reject);
        });

    } catch (error) {
        console.error(
            "Fehler beim Generieren des Speisekarten-PDFs:",
            error
        );

        throw error;
    }
};

module.exports = generateCardPDF;
