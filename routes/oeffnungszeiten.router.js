const express = require("express");
const router = express.Router();
const oeffnungszeitenController = require("../controller/oeffnungszeiten.controller");

// ----------------------------------------------------------
// 🔓 ÖFFENTLICH: Öffnungszeiten anzeigen (wie Home)
// KEIN TOKEN NÖTIG – damit Website sie laden kann
// ----------------------------------------------------------
router.get("/", oeffnungszeitenController.getOeffnungszeiten);

// ----------------------------------------------------------
// 🔒 ADMIN-BEREICH
// Token-Middleware für alle folgenden Routen
// ----------------------------------------------------------
router.use(oeffnungszeitenController.authenticateToken);

// 🔹 Neue Öffnungszeit anlegen ODER aktualisieren
router.post("/", oeffnungszeitenController.addZeitblock);
router.put("/", oeffnungszeitenController.addZeitblock);

// 🔹 Öffnungszeit löschen
router.delete("/:id", oeffnungszeitenController.deleteZeitblock);

module.exports = router;
