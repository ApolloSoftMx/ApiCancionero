const { getPool, sql } = require('../db/connection');
const crypto = require('crypto');

function generarCodigoSala() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// GET /api/esquemas — listar todos
async function getEsquemas(req, res) {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                e.id, e.nombre, e.fecha, e.descripcion,
                e.codigo_sala, e.activo, e.creado_en,
                COUNT(ec.id) AS total_canciones
            FROM EsquemaMisa e
            LEFT JOIN EsquemaCancion ec ON ec.esquema_id = e.id
            WHERE e.activo = 1
            GROUP BY e.id, e.nombre, e.fecha, e.descripcion,
                     e.codigo_sala, e.activo, e.creado_en
            ORDER BY e.fecha DESC, e.creado_en DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// GET /api/esquemas/:id — detalle con canciones
async function getEsquemaById(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;

        const esquema = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT id, nombre, fecha, descripcion, codigo_sala, activo
                FROM EsquemaMisa
                WHERE id = @id AND activo = 1
            `);

        if (!esquema.recordset.length)
            return res.status(404).json({ error: 'Esquema no encontrado' });

        const canciones = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT
                    ec.id, ec.orden, ec.nota_director,
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

        const data = esquema.recordset[0];
        data.canciones = canciones.recordset.map(c => ({
            ...c,
            letra: c.contenido_json ? {
                contenido: JSON.parse(c.contenido_json)
            } : null,
            contenido_json: undefined
        }));

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// GET /api/esquemas/sala/:codigo — acceso por código (público con token)
async function getEsquemaByCodigo(req, res) {
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
                    ec.id, ec.orden, ec.nota_director,
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

        // Obtener canción actual de la sesión
        const sesion = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT cancion_actual, actualizado_en
                FROM EsquemaSesion
                WHERE esquema_id = @id
            `);

        const data = esquema.recordset[0];
        data.canciones = canciones.recordset.map(c => ({
            ...c,
            letra: c.contenido_json ? {
                contenido: JSON.parse(c.contenido_json)
            } : null,
            contenido_json: undefined
        }));
        data.cancion_actual = sesion.recordset[0]?.cancion_actual ?? 0;

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// POST /api/esquemas — crear
async function createEsquema(req, res) {
    try {
        const pool = await getPool();
        const { nombre, fecha, descripcion } = req.body;

        if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

        const codigo_sala = generarCodigoSala();

        const result = await pool.request()
            .input('nombre',      sql.NVarChar, nombre)
            .input('fecha',       sql.Date,     fecha || null)
            .input('descripcion', sql.NVarChar, descripcion || null)
            .input('codigo_sala', sql.NVarChar, codigo_sala)
            .input('creado_por',  sql.Int,      req.usuario?.id || null)
            .query(`
                INSERT INTO EsquemaMisa (nombre, fecha, descripcion, codigo_sala, creado_por)
                OUTPUT INSERTED.id, INSERTED.codigo_sala
                VALUES (@nombre, @fecha, @descripcion, @codigo_sala, @creado_por)
            `);

        const { id, codigo_sala: codigo } = result.recordset[0];

        // Crear sesión inicial
        await pool.request()
            .input('id', sql.Int, id)
            .query(`
                INSERT INTO EsquemaSesion (esquema_id, cancion_actual)
                VALUES (@id, 0)
            `);

        res.status(201).json({ id, codigo_sala: codigo, mensaje: 'Esquema creado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// PUT /api/esquemas/:id — actualizar datos generales
async function updateEsquema(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;
        const { nombre, fecha, descripcion } = req.body;

        await pool.request()
            .input('id',          sql.Int,      parseInt(id))
            .input('nombre',      sql.NVarChar, nombre)
            .input('fecha',       sql.Date,     fecha || null)
            .input('descripcion', sql.NVarChar, descripcion || null)
            .query(`
                UPDATE EsquemaMisa SET
                    nombre = @nombre, fecha = @fecha,
                    descripcion = @descripcion,
                    modificado_en = SYSUTCDATETIME()
                WHERE id = @id
            `);

        res.json({ mensaje: 'Esquema actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// PUT /api/esquemas/:id/canciones — reemplazar lista de canciones
async function updateCanciones(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;
        const { canciones } = req.body; // [{ cancion_id, seccion_id, nota_director }]

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            await transaction.request()
                .input('id', sql.Int, parseInt(id))
                .query('DELETE FROM EsquemaCancion WHERE esquema_id = @id');

            for (let i = 0; i < canciones.length; i++) {
                const c = canciones[i];
                await transaction.request()
                    .input('esquema_id',    sql.Int,      parseInt(id))
                    .input('cancion_id',    sql.Int,      c.cancion_id)
                    .input('orden',         sql.Int,      i)
                    .input('seccion_id',    sql.Int,      c.seccion_id || null)
                    .input('nota_director', sql.NVarChar, c.nota_director || null)
                    .query(`
                        INSERT INTO EsquemaCancion
                            (esquema_id, cancion_id, orden, seccion_id, nota_director)
                        VALUES
                            (@esquema_id, @cancion_id, @orden, @seccion_id, @nota_director)
                    `);
            }

            await transaction.commit();
            res.json({ mensaje: 'Canciones actualizadas' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// PUT /api/esquemas/:id/sesion — actualizar canción actual (director)
async function updateSesion(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;
        const { cancion_actual } = req.body;

        await pool.request()
            .input('id',             sql.Int, parseInt(id))
            .input('cancion_actual', sql.Int, cancion_actual)
            .query(`
                UPDATE EsquemaSesion SET
                    cancion_actual = @cancion_actual,
                    actualizado_en = SYSUTCDATETIME()
                WHERE esquema_id = @id
            `);

        res.json({ mensaje: 'Sesión actualizada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// GET /api/esquemas/:id/sesion — polling para músicos
async function getSesion(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;

        const result = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT cancion_actual, actualizado_en
                FROM EsquemaSesion
                WHERE esquema_id = @id
            `);

        if (!result.recordset.length)
            return res.status(404).json({ error: 'Sesión no encontrada' });

        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// DELETE /api/esquemas/:id
async function deleteEsquema(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;

        await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query('UPDATE EsquemaMisa SET activo = 0 WHERE id = @id');

        res.json({ mensaje: 'Esquema eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = {
    getEsquemas, getEsquemaById, getEsquemaByCodigo,
    createEsquema, updateEsquema, updateCanciones,
    updateSesion, getSesion, deleteEsquema
};