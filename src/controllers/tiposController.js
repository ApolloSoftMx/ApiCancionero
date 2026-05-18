const { getPool, sql } = require('../db/connection');

async function getTipos(req, res) {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT id, nombre, descripcion FROM TipoCancion ORDER BY nombre');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { getTipos };