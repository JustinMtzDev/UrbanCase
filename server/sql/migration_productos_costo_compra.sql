ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS costo_compra NUMERIC(12,2);
