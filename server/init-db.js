const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDatabase() {
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres',
  });

  const dbName = process.env.DB_NAME || 'urbancase';

  try {
    const check = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (check.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`Base de datos "${dbName}" creada.`);
    } else {
      console.log(`Base de datos "${dbName}" ya existe.`);
    }
  } catch (err) {
    console.error('Error creando la base de datos:', err.message);
    process.exit(1);
  } finally {
    await adminPool.end();
  }

  const appPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
  });

  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await appPool.query(schema);
    console.log('Tablas creadas (usuarios, sucursales, clientes, proveedores) y superusuario "soporte" insertado.');
  } catch (err) {
    console.error('Error ejecutando el esquema:', err.message);
    process.exit(1);
  } finally {
    await appPool.end();
  }

  console.log('\nListo. Ejecuta "node index.js" para iniciar el servidor.');
}

initDatabase();
