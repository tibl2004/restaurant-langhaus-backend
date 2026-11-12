
const mysql = require("mysql2");

// ==========================================
// MYSQL CONNECTION POOL
// ==========================================

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DBNAME,
  port: Number(process.env.DB_PORT) || 3306,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ==========================================
// VERBINDUNG TESTEN
// ==========================================

pool.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Fehler bei DB-Verbindung:", err.message);
    return;
  }

  console.log("✅ Mit Datenbank verbunden");
  conn.release();
});

// ==========================================
// KEEP-ALIVE PING ALLE 5 MINUTEN
// ==========================================

setInterval(() => {
  pool.query("SELECT 1", (err) => {
    if (err) {
      console.error("⚠️ DB Keep-Alive fehlgeschlagen:", err.message);
    } else {
      console.log("🔄 DB Keep-Alive erfolgreich");
    }
  });
}, 5 * 60 * 1000);

// ==========================================
// PROMISE POOL EXPORTIEREN
// ==========================================

module.exports = pool.promise();
