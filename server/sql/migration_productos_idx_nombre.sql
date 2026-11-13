-- dashboard-top-productos (y el match de restock-rapido) buscan por nombre
-- normalizado; sin este indice, Postgres hacia un seq scan de productos que
-- tenia que destoastear imagen/imagen_thumb en cada fila para evaluar el
-- filtro, aunque la tabla sea chica.
CREATE INDEX IF NOT EXISTS idx_productos_nombre_lower_btrim
  ON public.productos (LOWER(BTRIM(nombre)));
