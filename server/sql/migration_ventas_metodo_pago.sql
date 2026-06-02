ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(30);
