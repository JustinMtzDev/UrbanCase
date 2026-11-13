require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const sharp = require('sharp');

if (!process.env.DATABASE_URL) {
  console.error('❌ No hay DATABASE_URL en server/.env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
});

const IMAGEN_THUMB_MAX_SIDE = 420;
const DATA_URL_RE = /^data:(image\/\w+);base64,([\s\S]+)$/;

async function generarImagenThumb(dataUrl) {
  const match = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_RE) : null;
  if (!match) return null;
  const [, mime, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  const esPng = mime === 'image/png';
  let pipeline = sharp(buffer).resize({
    width: IMAGEN_THUMB_MAX_SIDE,
    height: IMAGEN_THUMB_MAX_SIDE,
    fit: 'inside',
    withoutEnlargement: true,
  });
  pipeline = esPng ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 75 });
  const outBuffer = await pipeline.toBuffer();
  return `data:${esPng ? 'image/png' : 'image/jpeg'};base64,${outBuffer.toString('base64')}`;
}

async function run() {
  try {
    const { rows } = await pool.query(
      `SELECT id, imagen FROM productos
       WHERE imagen IS NOT NULL AND btrim(imagen) <> '' AND imagen_thumb IS NULL
       ORDER BY id`
    );
    console.log(`Productos pendientes de miniatura: ${rows.length}`);
    let ok = 0;
    let fallidos = 0;
    for (const row of rows) {
      try {
        const thumb = await generarImagenThumb(row.imagen);
        if (!thumb) {
          console.warn(`  #${row.id}: imagen no reconocida como data URL, se omite`);
          fallidos++;
          continue;
        }
        await pool.query('UPDATE productos SET imagen_thumb = $1 WHERE id = $2', [thumb, row.id]);
        ok++;
      } catch (err) {
        console.error(`  #${row.id}: ${err.message}`);
        fallidos++;
      }
    }
    console.log(`✅ Listo: ${ok} miniaturas generadas, ${fallidos} omitidas/fallidas.`);
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
