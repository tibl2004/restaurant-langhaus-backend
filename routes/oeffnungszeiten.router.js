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

// 🔹 Neue Öffnungszeit anlegen ODER aktualisieren
router.post("/", oeffnungszeitenController.addZeitblock);
// 🔹 PUT: Zeitblock updaten
router.put("/:id", oeffnungszeitenController.updateZeitblock);

// 🔹 GET: Alle Öffnungszeiten für Bearbeiten (unkomprimiert pro Kategorie)
router.get("/edit", oeffnungszeitenController.getOeffzeitenForEdit);


// 🔹 Öffnungszeit löschen
router.delete("/:id", oeffnungszeitenController.deleteZeitblock);

module.exports = router;
