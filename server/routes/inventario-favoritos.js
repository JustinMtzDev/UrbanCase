const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

function claveFromRow(row) {
  const prefix = row.tipo === 'consignado' ? 'c' : 'p';
  return `${prefix}-${row.producto_id}`;
}

function tipoDesdeBody(esConsignado) {
  return esConsignado ? 'consignado' : 'producto';
}

async function listarFavoritosUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT tipo, producto_id
     FROM inventario_favoritos
     WHERE usuario_id = $1
     ORDER BY created_at ASC, id ASC`,
    [usuarioId]
  );
  return rows.map(claveFromRow);
}

router.get('/', async (req, res) => {
  try {
    const favoritos = await listarFavoritosUsuario(req.usuario.id);
    res.json({ favoritos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/toggle', async (req, res) => {
  const usuarioId = req.usuario.id;
  const productoId = Number(req.body?.producto_id);
  const esConsignado = Boolean(req.body?.es_consignado);
  if (!Number.isFinite(productoId)) {
    return res.status(400).json({ error: 'producto_id inválido' });
  }

  const tipo = tipoDesdeBody(esConsignado);
  const tabla = esConsignado ? 'productos_consignados' : 'productos';

  try {
    const check = await pool.query(`SELECT 1 FROM ${tabla} WHERE id = $1`, [productoId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const existing = await pool.query(
      `SELECT id FROM inventario_favoritos
       WHERE usuario_id = $1 AND tipo = $2 AND producto_id = $3`,
      [usuarioId, tipo, productoId]
    );

    let favorito;
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM inventario_favoritos WHERE id = $1', [existing.rows[0].id]);
      favorito = false;
    } else {
      await pool.query(
        `INSERT INTO inventario_favoritos (usuario_id, tipo, producto_id)
         VALUES ($1, $2, $3)`,
        [usuarioId, tipo, productoId]
      );
      favorito = true;
    }

    const favoritos = await listarFavoritosUsuario(usuarioId);
    res.json({ favorito, favoritos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
