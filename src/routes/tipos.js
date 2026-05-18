const express = require('express');
const router = express.Router();
const { getTipos } = require('../controllers/tiposController');

router.get('/', getTipos);

module.exports = router;