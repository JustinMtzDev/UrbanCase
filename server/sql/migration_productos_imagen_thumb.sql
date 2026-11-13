-- Miniatura chica para la cuadricula de inventario (~420px), separada de la
-- imagen grande que solo se pide al ampliar.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS imagen_thumb TEXT;
