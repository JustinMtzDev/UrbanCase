CREATE INDEX IF NOT EXISTS idx_productos_nombre_lower_btrim
  ON public.productos (LOWER(BTRIM(nombre)));
