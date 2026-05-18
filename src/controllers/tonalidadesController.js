const { getPool } = require('../db/connection');

async function getTonalidades(req, res) {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT id, nombre FROM Tonalidad ORDER BY id');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { getTonalidades };