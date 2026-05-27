-- Rango de precio para fundas (precio = mínimo, precio_max = máximo)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS precio_max NUMERIC(12,2);
