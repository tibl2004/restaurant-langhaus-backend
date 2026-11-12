const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

/**
 * Erzeugt eine Speisekarte als PDF (A4).
 *
 * options (alle optional):
 *   logoPath    – Pfad zu PNG/JPG-Logo
 *   subtitle    – kleine Zeile über dem Titel (Standard: "RESTAURANT & GENUSS")
 *   tagline     – kursive Zeile unter dem Titel (z. B. "Saisonal · Regional · Frisch")
 *   footerText  – Fusszeile links (Standard: "RESTAURANT LANGHAUS")
 *   note        – Hinweis am Ende (Standard: Preise/Allergene)
 *   currency    – z. B. "CHF" → "CHF 24.–" (Standard: keine Währung, Schweizer Stil "24.–")
 *   fonts       – { heading, headingBold, body, bodyBold, italic } → Pfade zu TTF/OTF
 *
 * item: { title, description, price, allergens (String|Array), tags (Array, z. B. ["vegan"]) }
 */
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

        const filePath = path.join(uploadDir, `menu_card_${cardId}.pdf`);

        const doc = new PDFDocument({
            size: "A4",
            margins: { top: 78, bottom: 78, left: 66, right: 66 },
            bufferPages: true,      // nötig für "Seite X von Y"
            autoFirstPage: false,   // erste Seite erst nach Event-Handler
            info: {
                Title: String(cardName || "Speisekarte"),
                Author: options.footerText || "Restaurant Langhaus",
                Subject: "Speisekarte"
            }
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // --------------------------------
        // DESIGN
        // --------------------------------

        const COLORS = {
            background: "#FBF9F4",   // warmes Creme
            primary: "#1F3A32",      // tiefes Tannengrün
            text: "#22262A",
            secondary: "#6F746E",
            accent: "#A88B5B",       // gedämpftes Messing
            line: "#DDD6C6",
            tag: "#4F7A5E"
        };

        const PAGE_WIDTH = doc.page ? doc.page.width : 595.28;
        const PAGE_HEIGHT = doc.page ? doc.page.height : 841.89;

        const LEFT = 66;
        const RIGHT = PAGE_WIDTH - 66;
        const CONTENT_WIDTH = RIGHT - LEFT;
        const CENTER = PAGE_WIDTH / 2;
        const TOP = 78;
        const BOTTOM = PAGE_HEIGHT - 92; // Platz für Fusszeile

        const PRICE_WIDTH = 70;
        const TITLE_WIDTH = CONTENT_WIDTH - PRICE_WIDTH - 12;
        const DESC_WIDTH = CONTENT_WIDTH - 90;

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
                if (fontPath && fs.existsSync(fontPath)) {
                    doc.registerFont(name, fontPath);
                    if (FONTS[name] !== undefined) {
                        FONTS[name] = name;
                    }
                }
            });
        }

        // --------------------------------
        // HILFSFUNKTIONEN
        // --------------------------------

        // Hintergrund + Rahmen auf jeder neuen Seite
        const drawPageDecor = () => {
            doc.save();

            doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLORS.background);

            // Äusserer Rahmen
            doc.rect(24, 24, PAGE_WIDTH - 48, PAGE_HEIGHT - 48)
                .lineWidth(0.9)
                .strokeColor(COLORS.accent)
                .stroke();

            // Innerer, feiner Rahmen
            doc.rect(29, 29, PAGE_WIDTH - 58, PAGE_HEIGHT - 58)
                .lineWidth(0.3)
                .strokeColor(COLORS.accent)
                .stroke();

            doc.restore();
        };

        doc.on("pageAdded", drawPageDecor);

        // Ornament: Linie – Raute – Linie
        const drawOrnament = (y, halfWidth = 55) => {
            doc.save();

            doc.lineWidth(0.8).strokeColor(COLORS.accent);

            doc.moveTo(CENTER - halfWidth, y).lineTo(CENTER - 9, y).stroke();
            doc.moveTo(CENTER + 9, y).lineTo(CENTER + halfWidth, y).stroke();

            doc.polygon(
                [CENTER, y - 3.5],
                [CENTER + 3.5, y],
                [CENTER, y + 3.5],
                [CENTER - 3.5, y]
            ).fill(COLORS.accent);

            doc.restore();
        };

        const ensureSpace = (height) => {
            if (doc.y + height > BOTTOM) {
                doc.addPage();
                doc.y = TOP;
            }
        };

        const formatPrice = (price) => {
            if (price === null || price === undefined || price === "") {
                return "";
            }

            const number = Number(price);

            if (!Number.isFinite(number)) {
                return String(price);
            }

            const rounded = Math.round(number * 100) / 100;
            const isWhole = Number.isInteger(rounded);

            // Schweizer Stil: 24.– bzw. 24.50
            const text = isWhole ? `${rounded}.\u2013` : rounded.toFixed(2);

            return options.currency ? `${options.currency} ${text}` : text;
        };

        const listToText = (value) => {
            if (!value) return "";
            if (Array.isArray(value)) return value.filter(Boolean).join(", ");
            return String(value);
        };

        // Höhe eines Gerichts berechnen (für Seitenumbruch)
        const measureItem = (item) => {
            const title = String(item.title);

            doc.font(FONTS.headingBold).fontSize(13);
            const titleHeight = doc.heightOfString(title, { width: TITLE_WIDTH });

            let height = titleHeight;

            if (item.description) {
                doc.font(FONTS.italic).fontSize(9.2);
                height +=
                    3 +
                    doc.heightOfString(String(item.description), {
                        width: DESC_WIDTH,
                        lineGap: 2
                    });
            }

            const hasMeta =
                (Array.isArray(item.tags) && item.tags.length > 0) ||
                item.allergens;

            if (hasMeta) {
                height += 12;
            }

            return { titleHeight, height: height + 17 };
        };

        // --------------------------------
        // ERSTE SEITE + HEADER
        // --------------------------------

        doc.addPage();
        doc.y = TOP;

        let y = TOP - 4;

        if (options.logoPath && fs.existsSync(options.logoPath)) {
            doc.image(options.logoPath, CENTER - 45, y, {
                fit: [90, 62],
                align: "center",
                valign: "center"
            });
            y += 62 + 16;
        } else {
            y += 8;
        }

        // Kleine Überschrift
        doc.font(FONTS.bodyBold)
            .fontSize(8.5)
            .fillColor(COLORS.accent)
            .text(options.subtitle || "RESTAURANT & GENUSS", LEFT, y, {
                width: CONTENT_WIDTH,
                align: "center",
                characterSpacing: 3.2
            });

        y = doc.y + 10;

        // Kartenname
        doc.font(FONTS.heading)
            .fontSize(36)
            .fillColor(COLORS.primary)
            .text(String(cardName || "Speisekarte"), LEFT, y, {
                width: CONTENT_WIDTH,
                align: "center"
            });

        y = doc.y + 10;

        drawOrnament(y + 4, 62);

        y += 18;

        if (options.tagline) {
            doc.font(FONTS.italic)
                .fontSize(10)
                .fillColor(COLORS.secondary)
                .text(String(options.tagline), LEFT, y, {
                    width: CONTENT_WIDTH,
                    align: "center"
                });

            y = doc.y + 6;
        }

        doc.y = y + 26;

        // --------------------------------
        // KATEGORIEN
        // --------------------------------

        for (const category of categoriesWithItems || []) {
            if (!category || !Array.isArray(category.items)) continue;

            const items = category.items.filter((i) => i && i.title);
            if (items.length === 0) continue;

            // Überschrift soll nie alleine am Seitenende stehen
            const HEADING_HEIGHT = 62;
            ensureSpace(HEADING_HEIGHT + measureItem(items[0]).height);

            // Kategorieüberschrift (zentriert, Grossbuchstaben)
            const headingY = doc.y;

            doc.font(FONTS.heading)
                .fontSize(19)
                .fillColor(COLORS.primary)
                .text(
                    String(category.name || "Weitere Gerichte").toUpperCase(),
                    LEFT,
                    headingY,
                    {
                        width: CONTENT_WIDTH,
                        align: "center",
                        characterSpacing: 3
                    }
                );

            drawOrnament(doc.y + 9, 40);

            doc.y = doc.y + 30;

            // --------------------------------
            // GERICHTE
            // --------------------------------

            for (const item of items) {
                const title = String(item.title);
                const description = item.description
                    ? String(item.description)
                    : "";
                const price = formatPrice(item.price);

                const { titleHeight, height } = measureItem(item);

                ensureSpace(height);

                const startY = doc.y;

                // Gerichtstitel
                doc.font(FONTS.headingBold)
                    .fontSize(13)
                    .fillColor(COLORS.text)
                    .text(title, LEFT, startY, { width: TITLE_WIDTH });

                // Preis rechtsbündig
                let priceTextWidth = 0;

                if (price) {
                    doc.font(FONTS.headingBold).fontSize(13);
                    priceTextWidth = doc.widthOfString(price);

                    doc.fillColor(COLORS.primary).text(
                        price,
                        RIGHT - PRICE_WIDTH,
                        startY,
                        { width: PRICE_WIDTH, align: "right" }
                    );
                }

                // Punktlinie zwischen Titel und Preis (nur bei einzeiligem Titel)
                doc.font(FONTS.headingBold).fontSize(13);
                const titleTextWidth = doc.widthOfString(title);

                if (price && titleHeight < 20 && titleTextWidth < TITLE_WIDTH) {
                    const dotStart = LEFT + titleTextWidth + 7;
                    const dotEnd = RIGHT - priceTextWidth - 7;

                    if (dotEnd - dotStart > 12) {
                        doc.save();
                        doc.lineWidth(0.7)
                            .lineCap("round")
                            .dash(0.1, { space: 3 })
                            .strokeColor(COLORS.accent)
                            .moveTo(dotStart, startY + 10.5)
                            .lineTo(dotEnd, startY + 10.5)
                            .stroke();
                        doc.undash();
                        doc.restore();
                    }
                }

                let currentY = startY + titleHeight;

                // Beschreibung
                if (description) {
                    currentY += 3;

                    doc.font(FONTS.italic)
                        .fontSize(9.2)
                        .fillColor(COLORS.secondary)
                        .text(description, LEFT, currentY, {
                            width: DESC_WIDTH,
                            lineGap: 2
                        });

                    currentY = doc.y;
                }

                // Tags (vegan, vegetarisch …) und Allergene
                const tags = Array.isArray(item.tags)
                    ? item.tags.filter(Boolean).join("  \u00B7  ")
                    : "";
                const allergens = listToText(item.allergens);

                if (tags || allergens) {
                    currentY += 4;

                    let x = LEFT;

                    if (tags) {
                        doc.font(FONTS.bodyBold)
                            .fontSize(7.5)
                            .fillColor(COLORS.tag)
                            .text(tags.toUpperCase(), x, currentY, {
                                lineBreak: false,
                                characterSpacing: 0.8
                            });

                        x += doc.widthOfString(tags.toUpperCase(), {
                            characterSpacing: 0.8
                        }) + 14;
                    }

                    if (allergens) {
                        doc.font(FONTS.body)
                            .fontSize(7.5)
                            .fillColor(COLORS.secondary)
                            .text(`Allergene: ${allergens}`, x, currentY, {
                                lineBreak: false
                            });
                    }

                    currentY += 9;
                }

                doc.y = startY + height;
            }

            doc.y += 14;
        }

        // --------------------------------
        // HINWEIS AM ENDE
        // --------------------------------

        const note =
            options.note !== undefined
                ? options.note
                : "Alle Preise in CHF inkl. MwSt.  \u00B7  Bei Allergien oder Unverträglichkeiten berät Sie unser Service gerne.";

        if (note) {
            ensureSpace(50);

            drawOrnament(doc.y + 4, 30);

            doc.font(FONTS.italic)
                .fontSize(8.5)
                .fillColor(COLORS.secondary)
                .text(note, LEFT + 20, doc.y + 18, {
                    width: CONTENT_WIDTH - 40,
                    align: "center"
                });
        }

        // --------------------------------
        // FUSSZEILE (auf allen Seiten, "Seite X / Y")
        // --------------------------------

        const range = doc.bufferedPageRange();

        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);

            // Unteren Rand kurz entfernen, damit pdfkit keine neue Seite anlegt
            const originalBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;

            const footerY = PAGE_HEIGHT - 64;

            doc.save();

            doc.moveTo(LEFT, footerY - 10)
                .lineTo(RIGHT, footerY - 10)
                .lineWidth(0.5)
                .strokeColor(COLORS.line)
                .stroke();

            doc.font(FONTS.body)
                .fontSize(7.5)
                .fillColor(COLORS.secondary)
                .text(
                    options.footerText || "RESTAURANT LANGHAUS",
                    LEFT,
                    footerY,
                    {
                        width: CONTENT_WIDTH / 2,
                        characterSpacing: 1.2,
                        lineBreak: false
                    }
                );

            doc.font(FONTS.body)
                .fontSize(7.5)
                .fillColor(COLORS.secondary)
                .text(
                    `SEITE ${i + 1} / ${range.count}`,
                    RIGHT - CONTENT_WIDTH / 2,
                    footerY,
                    {
                        width: CONTENT_WIDTH / 2,
                        align: "right",
                        characterSpacing: 1.2,
                        lineBreak: false
                    }
                );

            doc.restore();

            doc.page.margins.bottom = originalBottom;
        }

        // PDF abschliessen
        doc.end();

        // Auf fertige Datei warten
        return await new Promise((resolve, reject) => {
            stream.on("finish", () => resolve(filePath));
            stream.on("error", reject);
        });
    } catch (error) {
        console.error("Fehler beim Generieren des Speisekarten-PDFs:", error);
        throw error;
    }
};

module.exports = generateCardPDF;