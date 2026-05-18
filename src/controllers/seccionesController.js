const { getPool, sql } = require('../db/connection');

async function getSecciones(req, res) {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT id, nombre, orden, descripcion FROM SeccionMisa ORDER BY orden');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { getSecciones };