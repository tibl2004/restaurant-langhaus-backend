const express = require('express');
const router = express.Router();
const chatbotController = require('../controller/chatbot.controller'); // Den Controller importieren

// Alle Chatbot-Antworten abrufen
router.get('/', chatbotController.getAllAnswers);

// Neue Chatbot-Antwort erstellen
router.post('/', chatbotController.createAnswer);

// Chatbot-Antwort aktualisieren
router.put('/:id', chatbotController.updateAnswer);

// Chatbot-Antwort löschen
router.delete('/:id', chatbotController.deleteAnswer);

// Chatbot-Antwort basierend auf der Benutzereingabe finden
router.post('/find-answer', chatbotController.findAnswer);

module.exports = router;
