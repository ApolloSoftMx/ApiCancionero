const express = require('express');
const router  = express.Router();
const {
    getEsquemas, getEsquemaById, getEsquemaByCodigo,
    createEsquema, updateEsquema, updateCanciones,
    updateSesion, getSesion, deleteEsquema
} = require('../controllers/esquemaController');

router.get('/',                  getEsquemas);
router.get('/sala/:codigo',      getEsquemaByCodigo);
router.get('/:id',               getEsquemaById);
router.post('/',                 createEsquema);
router.put('/:id',               updateEsquema);
router.put('/:id/canciones',     updateCanciones);
router.put('/:id/sesion',        updateSesion);
router.get('/:id/sesion',        getSesion);
router.delete('/:id',            deleteEsquema);

module.exports = router;