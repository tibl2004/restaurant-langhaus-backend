const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require("path");

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 🔹 Uploads öffentlich machen – direkt nach app = express()
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 🔹 CORS für alle erlauben (kein corsOptions nötig)
app.use(cors());

// 🔹 Limits hochsetzen
app.use(express.urlencoded({ limit: "150mb", extended: true }));
app.use(express.json({ limit: "150mb" }));

// 🔹 Routen importieren
const loginRouter = require('./routes/login.router');
const newsletterRouter = require('./routes/newsletter.router');
const homeRouter = require('./routes/home.router');
const anfrageRouter = require('./routes/anfrage.router');
const logoRouter = require('./routes/logo.router');
const adminRouter = require('./routes/admin.router');
const galerieRouter = require('./routes/galerie.router');
const oeffnungszeitenRouter = require('./routes/oeffnungszeiten.router');


// 🔹 Routen zuweisen
app.use('/api/login', loginRouter);
app.use('/api/newsletter', newsletterRouter);
app.use('/api/home', homeRouter);
app.use('/api/anfrage', anfrageRouter);
app.use('/api/logo', logoRouter);
app.use('/api/admin', adminRouter);
app.use('/api/galerie', galerieRouter);
app.use('/api/oeffnungszeiten', oeffnungszeitenRouter);

// 🔹 Preflight für alle Anfragen (optional, aber sicher)
app.options('*', cors());

// 🔹 Fehlerbehandlung
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Etwas ist schiefgelaufen!');
});

// 🔹 Server starten
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}....`);
});
