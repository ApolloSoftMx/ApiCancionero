const express = require('express');
const router = express.Router();
const { getSecciones } = require('../controllers/seccionesController');

router.get('/', getSecciones);

module.exports = router;