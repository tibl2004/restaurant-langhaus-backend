require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const morgan = require("morgan");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/*
========================================
TRUST PROXY (RENDER / VERCEL)
========================================
*/

app.set("trust proxy", 1);

/*
========================================
SECURITY
========================================
*/

app.use(helmet());
app.use(compression());
app.use(morgan("combined"));

/*
========================================
GLOBAL RATE LIMIT
========================================
*/

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

/*
========================================
LOGIN LIMIT
========================================
*/

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Zu viele Loginversuche. Bitte später erneut versuchen.",
});

app.use("/api/login", loginLimiter);

/*
========================================
CORS
========================================
*/

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://langhaus.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS blockiert"));
      }

    },

    methods: ["GET", "POST", "PUT", "DELETE"],

    credentials: true,
  })
);

/*
========================================
BODY PARSER
========================================
*/

app.use(express.json({
  limit: "10mb",
}));

app.use(express.urlencoded({
  extended: true,
  limit: "10mb",
}));

/*
========================================
STATIC FILES
========================================

🔥 EIN EINZIGER CLEANER STATIC WEG

/uploads/galerie/...
/uploads/logo/...
/uploads/menu/...

========================================
*/

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

/*
========================================
WEBSOCKET
========================================
*/

wss.on("connection", (ws, req) => {

  const ip = req.socket.remoteAddress;

  console.log("WebSocket verbunden:", ip);

  ws.on("message", (message) => {

    if (message.length > 5000) {
      ws.close();
    }

  });

  ws.on("close", () => {
    console.log("WebSocket getrennt");
  });

});

/*
========================================
API ROUTES
========================================
*/

app.use("/api/login", require("./routes/login.router"));
app.use("/api/home", require("./routes/home.router"));
app.use("/api/logo", require("./routes/logo.router"));
app.use("/api/admin", require("./routes/admin.router"));
app.use("/api/galerie", require("./routes/galerie.router"));
app.use("/api/oeffnungszeiten", require("./routes/oeffnungszeiten.router"));
app.use("/api/menu", require("./routes/menu.router"));
app.use("/api/betriebsferien", require("./routes/betriebsferien.router"));

/*
========================================
ROOT ROUTE
========================================
*/

app.get("/", (req, res) => {

  res.json({
    status: "OK",
    message: "Restaurant Langhaus Backend läuft",
  });

});

/*
========================================
404 HANDLER
========================================
*/

app.use((req, res) => {

  res.status(404).json({
    error: "Route nicht gefunden",
  });

});

/*
========================================
GLOBAL ERROR HANDLER
========================================
*/

app.use((err, req, res, next) => {

  console.error("SERVER ERROR:", err);

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Server Fehler"
        : err.message,
  });

});

/*
========================================
SERVER START
========================================
*/

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {

  console.log(`🚀 Server läuft auf Port ${PORT}`);

});