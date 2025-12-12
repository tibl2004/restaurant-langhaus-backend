const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

/**
 * Erzeugt ein PDF der Menükarte und speichert es lokal im /uploads Ordner
 * @param {number} cardId - ID der Karte
 * @param {string} cardName - Name der Karte
 * @param {Array} categoriesWithItems - Array von Kategorien mit Items
 *      [{ name: 'Vorspeisen', items: [{title, price, description}, ...]}, ...]
 */
const generateCardPDF = async (cardId, cardName, categoriesWithItems) => {
  try {
    // Uploads Ordner prüfen/erstellen
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

    const filePath = path.join(uploadDir, `menu_card_${cardId}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // ----- Header -----
    doc.font("Helvetica-Bold")
       .fontSize(28)
       .text(cardName, { align: "center", underline: true });
    doc.moveDown(1);

    // ----- Kategorien & Items -----
    categoriesWithItems.forEach((cat) => {
      doc.font("Helvetica-Bold")
         .fontSize(18)
         .fillColor("#333333")
         .text(cat.name, { underline: true });
      doc.moveDown(0.3);

      cat.items.forEach((item) => {
        // Gerichtstitel + Preis
        doc.font("Helvetica-Bold")
           .fontSize(14)
           .fillColor("#000000")
           .text(item.title, { continued: true });
        doc.font("Helvetica")
           .fontSize(14)
           .fillColor("#555555")
           .text(` - ${item.price.toFixed(2)} €`, { align: "right", continued: false });
        
        // Beschreibung
        if (item.description) {
          doc.font("Helvetica-Oblique")
             .fontSize(12)
             .fillColor("#666666")
             .text(item.description, { indent: 20 });
        }

        doc.moveDown(0.5);
      });

      doc.moveDown(1);
    });

    // ----- Footer -----
    doc.fontSize(10)
       .fillColor("#999999")
       .text("Restaurant Langhaus • Generated automatically", 50, doc.page.height - 50, {
         align: "center",
         width: doc.page.width - 100,
       });

    doc.end();

    // Promise auf Stream-Finish
    return new Promise((resolve, reject) => {
      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    });
  } catch (err) {
    console.error("Fehler beim Generieren des PDFs:", err);
  }
};

module.exports = generateCardPDF;
