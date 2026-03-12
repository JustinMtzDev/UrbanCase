const pool = require('./db');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sucursales (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        direccion TEXT,
        telefono VARCHAR(20),
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Tabla sucursales creada.');

    const col = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'usuarios' AND column_name = 'sucursal_id'
    `);
    if (col.rows.length === 0) {
      await pool.query(`
        ALTER TABLE usuarios
        ADD COLUMN sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL
      `);
      console.log('Columna sucursal_id agregada a usuarios.');
    } else {
      console.log('Columna sucursal_id ya existe.');
    }

    console.log('Migración completada.');
  } catch (err) {
    console.error('Error en migración:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
