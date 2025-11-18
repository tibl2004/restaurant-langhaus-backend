const express = require('express');
const router = express.Router();
const loginController = require('../controller/login.controller');

// Login-Routen
router.post('/', loginController.login); // Login-Anmeldung



module.exports = router;
