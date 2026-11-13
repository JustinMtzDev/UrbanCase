ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS precio_max NUMERIC(12,2);
