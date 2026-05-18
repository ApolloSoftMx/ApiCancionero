const { getPool, sql } = require('../db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// POST /api/auth/login
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ error: 'Email y password son requeridos' });

        const pool = await getPool();
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT id, nombre, email, password_hash, rol FROM Usuario WHERE email = @email AND activo = 1');

        if (!result.recordset.length)
            return res.status(401).json({ error: 'Credenciales inválidas' });

        const usuario = result.recordset[0];
        const passwordOk = await bcrypt.compare(password, usuario.password_hash);
        
        if (!passwordOk)
            return res.status(401).json({ error: 'Credenciales inválidas' });

        const token = jwt.sign(
            { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// POST /api/auth/registro — solo admins pueden crear usuarios
async function registro(req, res) {
    try {
        const { nombre, email, password, rol } = req.body;

        if (!nombre || !email || !password)
            return res.status(400).json({ error: 'Nombre, email y password son requeridos' });

        const pool = await getPool();

        // Verificar si ya existe
        const existe = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT id FROM Usuario WHERE email = @email');

        if (existe.recordset.length)
            return res.status(400).json({ error: 'El email ya está registrado' });

        const hash = await bcrypt.hash(password, 10);

        await pool.request()
            .input('nombre',        sql.NVarChar, nombre)
            .input('email',         sql.NVarChar, email)
            .input('password_hash', sql.NVarChar, hash)
            .input('rol',           sql.NVarChar, rol === 'admin' ? 'admin' : 'editor')
            .query(`
                INSERT INTO Usuario (nombre, email, password_hash, rol)
                VALUES (@nombre, @email, @password_hash, @rol)
            `);

        res.status(201).json({ mensaje: 'Usuario creado correctamente' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { login, registro };