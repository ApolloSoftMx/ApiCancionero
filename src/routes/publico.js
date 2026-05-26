const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db/connection');

// GET /api/publico/canciones
router.get('/canciones', async (req, res) => {
    try {
        const { buscar, seccion_id, tipo_id } = req.query;
        const pool = await getPool();
        const request = pool.request();

        let where = ['c.activo = 1'];

        if (buscar) {
            request.input('buscar', sql.NVarChar, `%${buscar}%`);
            where.push('(c.titulo LIKE @buscar OR c.autor LIKE @buscar)');
        }
        if (seccion_id) {
            request.input('seccion_id', sql.Int, parseInt(seccion_id));
            where.push('EXISTS (SELECT 1 FROM CancionSeccion cs WHERE cs.cancion_id = c.id AND cs.seccion_id = @seccion_id)');
        }
        if (tipo_id) {
            request.input('tipo_id', sql.Int, parseInt(tipo_id));
            where.push('EXISTS (SELECT 1 FROM CancionTipo ct WHERE ct.cancion_id = c.id AND ct.tipo_id = @tipo_id)');
        }

        const whereClause = `WHERE ${where.join(' AND ')}`;

        const result = await request.query(`
            SELECT
                c.id, c.titulo, c.autor, c.fuente, c.bpm,
                t.nombre AS tonalidad,
                v.secciones, v.tipos
            FROM Cancion c
            LEFT JOIN Tonalidad t ON t.id = c.tonalidad_id
            LEFT JOIN vw_CancionDetalle v ON v.id = c.id
            ${whereClause}
            ORDER BY c.titulo
        `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/publico/canciones/:id
router.get('/canciones/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const { id } = req.params;

        const cancion = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT
                    c.id, c.titulo, c.autor, c.fuente, c.bpm, c.notas,
                    t.nombre AS tonalidad,
                    v.secciones, v.tipos
                FROM Cancion c
                LEFT JOIN Tonalidad t ON t.id = c.tonalidad_id
                LEFT JOIN vw_CancionDetalle v ON v.id = c.id
                WHERE c.id = @id AND c.activo = 1
            `);

        if (!cancion.recordset.length)
            return res.status(404).json({ error: 'Canción no encontrada' });

        const letra = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT contenido_json
                FROM LetraCancion
                WHERE cancion_id = @id AND es_principal = 1
            `);

        const secciones = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT sm.id, sm.nombre, sm.orden
                FROM CancionSeccion cs
                JOIN SeccionMisa sm ON sm.id = cs.seccion_id
                WHERE cs.cancion_id = @id ORDER BY sm.orden
            `);

        const tipos = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT tc.id, tc.nombre
                FROM CancionTipo ct
                JOIN TipoCancion tc ON tc.id = ct.tipo_id
                WHERE ct.cancion_id = @id ORDER BY tc.nombre
            `);

        const data = cancion.recordset[0];
        data.secciones_detalle = secciones.recordset;
        data.tipos_detalle     = tipos.recordset;
        data.letra = letra.recordset[0]
            ? { contenido: JSON.parse(letra.recordset[0].contenido_json) }
            : null;

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/publico/secciones
router.get('/catalogos/secciones', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT id, nombre, orden FROM SeccionMisa ORDER BY orden');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/publico/tipos
router.get('/catalogos/tipos', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT id, nombre FROM TipoCancion ORDER BY nombre');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta pública para unirse a sala
router.get('/esquemas/sala/:codigo', async (req, res) => {
    try {
        const pool = await getPool();
        const { codigo } = req.params;
        const esquema = await pool.request()
            .input('codigo', sql.NVarChar, codigo.toUpperCase())
            .query(`
                SELECT id, nombre, fecha, descripcion, codigo_sala
                FROM EsquemaMisa
                WHERE codigo_sala = @codigo AND activo = 1
            `);

        if (!esquema.recordset.length)
            return res.status(404).json({ error: 'Sala no encontrada' });

        const id = esquema.recordset[0].id;

        const canciones = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT
                    ec.orden, ec.nota_director,
                    c.id AS cancion_id, c.titulo, c.autor,
                    c.notas, t.nombre AS tonalidad,
                    sm.nombre AS seccion,
                    lc.contenido_json
                FROM EsquemaCancion ec
                JOIN Cancion c ON c.id = ec.cancion_id
                LEFT JOIN Tonalidad t ON t.id = c.tonalidad_id
                LEFT JOIN SeccionMisa sm ON sm.id = ec.seccion_id
                LEFT JOIN LetraCancion lc ON lc.cancion_id = c.id AND lc.es_principal = 1
                WHERE ec.esquema_id = @id
                ORDER BY ec.orden
            `);

        const sesion = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT cancion_actual FROM EsquemaSesion WHERE esquema_id = @id');

        const data = esquema.recordset[0];
        data.canciones = canciones.recordset.map(c => ({
            ...c,
            letra: c.contenido_json ? { contenido: JSON.parse(c.contenido_json) } : null,
            contenido_json: undefined
        }));
        data.cancion_actual = sesion.recordset[0]?.cancion_actual ?? 0;

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta pública para polling de sesión
router.get('/esquemas/sesion/:esquemaId', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, parseInt(req.params.esquemaId))
            .query('SELECT cancion_actual, actualizado_en FROM EsquemaSesion WHERE esquema_id = @id');

        if (!result.recordset.length)
            return res.status(404).json({ error: 'Sesión no encontrada' });

        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;