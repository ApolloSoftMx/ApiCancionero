const express = require('express');
const router = express.Router();
const {
    getCanciones,
    getCancionById,
    createCancion,
    updateCancion,
    deleteCancion
} = require('../controllers/cancionesController');

router.get('/',     getCanciones);
router.get('/:id',  getCancionById);
router.post('/',    createCancion);
router.put('/:id',  updateCancion);
router.delete('/:id', deleteCancion);

module.exports = router;