const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Ruta de salud — para verificar que la API responde
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mensaje: 'Cancionero API funcionando' });
});

const { verificarToken, soloAdmin } = require('./middleware/auth');

// Rutas PÚBLICAS — sin token
// app.use('/api/publico/canciones', require('./routes/publico'));
app.use('/api/publico', require('./routes/publico'));


// Rutas públicas
app.use('/api/auth',     require('./routes/auth'));

// Rutas protegidas — requieren token
app.use('/api/canciones', verificarToken, require('./routes/canciones'));
app.use('/api/secciones', verificarToken, require('./routes/secciones'));
app.use('/api/tipos',     verificarToken, require('./routes/tipos'));
app.use('/api/tonalidades', verificarToken, require('./routes/tonalidades'));
app.use('/api/esquemas', verificarToken, require('./routes/esquemas'));
module.exports = app;