const express = require('express');
const router = express.Router();
const { getTonalidades } = require('../controllers/tonal idadesController');

router.get('/', getTonalidades);

module.exports = router;