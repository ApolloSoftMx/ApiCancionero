const express = require('express');
const router = express.Router();
const { getTonalidades } = require('../controllers/tonalidadesController');

router.get('/', getTonalidades);

module.exports = router;