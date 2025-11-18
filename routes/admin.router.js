const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin.controller');

// 🔹 Admin erstellen (nur einmalig)
router.post('/create', adminController.createAdmin);

// 🔹 Admin Profil abrufen (JWT erforderlich)
router.get('/profile', adminController.authenticateToken, adminController.getProfile);

// 🔹 Admin Profil aktualisieren (JWT erforderlich)
router.put('/profile', adminController.authenticateToken, adminController.updateProfile);

module.exports = router;
