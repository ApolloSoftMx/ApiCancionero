const { getPool, sql } = require('../db/connection');

// GET /api/canciones — lista con filtros opcionales
async function getCanciones(req, res) {
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

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const result = await request.query(`
            SELECT
                c.id, c.titulo, c.autor, c.fuente, c.bpm, c.notas,
                t.nombre AS tonalidad,
                v.secciones,
                v.tipos
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
}

// GET /api/canciones/:id — detalle completo con letra y acordes
async function getCancionById(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;

        // Datos generales
        const cancion = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT
                    c.id, c.titulo, c.autor, c.fuente, c.bpm, c.notas,
                    t.nombre AS tonalidad,
                    v.secciones,
                    v.tipos
                FROM Cancion c
                LEFT JOIN Tonalidad t ON t.id = c.tonalidad_id
                LEFT JOIN vw_CancionDetalle v ON v.id = c.id
                WHERE c.id = @id AND c.activo = 1
            `);

        if (!cancion.recordset.length)
            return res.status(404).json({ error: 'Canción no encontrada' });

        // Letra principal
        const letra = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT id, version_nombre, es_principal, contenido_json
                FROM LetraCancion
                WHERE cancion_id = @id AND es_principal = 1
            `);

        // Clasificaciones detalladas
        const secciones = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT sm.id, sm.nombre, sm.orden
                FROM CancionSeccion cs
                JOIN SeccionMisa sm ON sm.id = cs.seccion_id
                WHERE cs.cancion_id = @id
                ORDER BY sm.orden
            `);

        const tipos = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query(`
                SELECT tc.id, tc.nombre
                FROM CancionTipo ct
                JOIN TipoCancion tc ON tc.id = ct.tipo_id
                WHERE ct.cancion_id = @id
                ORDER BY tc.nombre
            `);

        const data = cancion.recordset[0];
        data.letra = letra.recordset[0] || null;
        data.secciones_detalle = secciones.recordset;
        data.tipos_detalle = tipos.recordset;

        // Parsear el JSON de la letra
        if (data.letra && data.letra.contenido_json) {
            data.letra.contenido = JSON.parse(data.letra.contenido_json);
            delete data.letra.contenido_json;
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// POST /api/canciones — crear canción completa
async function createCancion(req, res) {
    try {
        const pool = await getPool();
        const {
            titulo, autor, fuente, tonalidad_id, bpm, notas,
            secciones, tipos, letra
        } = req.body;

        if (!titulo) return res.status(400).json({ error: 'El título es requerido' });

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Insertar canción
            const r1 = await transaction.request()
                .input('titulo',       sql.NVarChar, titulo)
                .input('autor',        sql.NVarChar, autor || null)
                .input('fuente',       sql.NVarChar, fuente || null)
                .input('tonalidad_id', sql.Int,      tonalidad_id || null)
                .input('bpm',          sql.SmallInt, bpm || null)
                .input('notas',        sql.NVarChar, notas || null)
                .query(`
                    INSERT INTO Cancion (titulo, autor, fuente, tonalidad_id, bpm, notas)
                    OUTPUT INSERTED.id
                    VALUES (@titulo, @autor, @fuente, @tonalidad_id, @bpm, @notas)
                `);

            const cancionId = r1.recordset[0].id;

            // Insertar secciones
            if (secciones && secciones.length) {
                for (const seccionId of secciones) {
                    await transaction.request()
                        .input('cancion_id', sql.Int, cancionId)
                        .input('seccion_id', sql.Int, seccionId)
                        .query('INSERT INTO CancionSeccion (cancion_id, seccion_id) VALUES (@cancion_id, @seccion_id)');
                }
            }

            // Insertar tipos
            if (tipos && tipos.length) {
                for (const tipoId of tipos) {
                    await transaction.request()
                        .input('cancion_id', sql.Int, cancionId)
                        .input('tipo_id',    sql.Int, tipoId)
                        .query('INSERT INTO CancionTipo (cancion_id, tipo_id) VALUES (@cancion_id, @tipo_id)');
                }
            }

            // Insertar letra
            if (letra) {
                await transaction.request()
                    .input('cancion_id',     sql.Int,      cancionId)
                    .input('version_nombre', sql.NVarChar, 'original')
                    .input('contenido_json', sql.NVarChar, JSON.stringify(letra))
                    .query(`
                        INSERT INTO LetraCancion (cancion_id, version_nombre, es_principal, contenido_json)
                        VALUES (@cancion_id, @version_nombre, 1, @contenido_json)
                    `);
            }

            await transaction.commit();
            res.status(201).json({ id: cancionId, mensaje: 'Canción creada correctamente' });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// PUT /api/canciones/:id — actualizar canción
async function updateCancion(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;
        const {
            titulo, autor, fuente, tonalidad_id, bpm, notas,
            secciones, tipos, letra
        } = req.body;

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            await transaction.request()
                .input('id',           sql.Int,      parseInt(id))
                .input('titulo',       sql.NVarChar, titulo)
                .input('autor',        sql.NVarChar, autor || null)
                .input('fuente',       sql.NVarChar, fuente || null)
                .input('tonalidad_id', sql.Int,      tonalidad_id || null)
                .input('bpm',          sql.SmallInt, bpm || null)
                .input('notas',        sql.NVarChar, notas || null)
                .query(`
                    UPDATE Cancion SET
                        titulo = @titulo, autor = @autor, fuente = @fuente,
                        tonalidad_id = @tonalidad_id, bpm = @bpm, notas = @notas,
                        modificado_en = SYSUTCDATETIME()
                    WHERE id = @id
                `);

            // Reemplazar secciones
            if (secciones !== undefined) {
                await transaction.request()
                    .input('id', sql.Int, parseInt(id))
                    .query('DELETE FROM CancionSeccion WHERE cancion_id = @id');

                for (const seccionId of secciones) {
                    await transaction.request()
                        .input('cancion_id', sql.Int, parseInt(id))
                        .input('seccion_id', sql.Int, seccionId)
                        .query('INSERT INTO CancionSeccion (cancion_id, seccion_id) VALUES (@cancion_id, @seccion_id)');
                }
            }

            // Reemplazar tipos
            if (tipos !== undefined) {
                await transaction.request()
                    .input('id', sql.Int, parseInt(id))
                    .query('DELETE FROM CancionTipo WHERE cancion_id = @id');

                for (const tipoId of tipos) {
                    await transaction.request()
                        .input('cancion_id', sql.Int, parseInt(id))
                        .input('tipo_id',    sql.Int, tipoId)
                        .query('INSERT INTO CancionTipo (cancion_id, tipo_id) VALUES (@cancion_id, @tipo_id)');
                }
            }

            // Actualizar letra
            if (letra !== undefined) {
                await transaction.request()
                    .input('cancion_id',     sql.Int,      parseInt(id))
                    .input('contenido_json', sql.NVarChar, JSON.stringify(letra))
                    .query(`
                        UPDATE LetraCancion SET
                            contenido_json = @contenido_json,
                            modificado_en = SYSUTCDATETIME()
                        WHERE cancion_id = @cancion_id AND es_principal = 1
                    `);
            }

            await transaction.commit();
            res.json({ mensaje: 'Canción actualizada correctamente' });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// DELETE /api/canciones/:id — borrado lógico
async function deleteCancion(req, res) {
    try {
        const pool = await getPool();
        const { id } = req.params;

        await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query('UPDATE Cancion SET activo = 0 WHERE id = @id');

        res.json({ mensaje: 'Canción eliminada correctamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { getCanciones, getCancionById, createCancion, updateCancion, deleteCancion };