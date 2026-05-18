const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token)
        return res.status(401).json({ error: 'Token requerido' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token inválido o expirado' });
    }
}

function soloAdmin(req, res, next) {
    if (req.usuario?.rol !== 'admin')
        return res.status(403).json({ error: 'Se requiere rol de administrador' });
    next();
}

module.exports = { verificarToken, soloAdmin };