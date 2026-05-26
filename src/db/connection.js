const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // port: parseInt(process.env.DB_PORT),
    options: {
        encrypt: false,
        trustServerCertificate: true,
        instanceName: process.env.DB_INSTANCE,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

let pool;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
        console.log('✅ Conectado a SQL Server');

        // Ping cada 4 minutos para mantener la conexión viva
        setInterval(async () => {
            try {
                await pool.request().query('SELECT 1');
            } catch (e) {
                console.log('Reconectando pool...');
                pool = await sql.connect(config);
            }
        }, 2 * 60 * 1000);
    }
    return pool;
}
module.exports = { getPool, sql };