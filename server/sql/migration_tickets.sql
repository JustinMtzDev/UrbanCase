ALTER TABLE public.sucursales
  ADD COLUMN IF NOT EXISTS mp_terminal_id VARCHAR(80);

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS ticket_pdf_path TEXT;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS ticket_impreso_at TIMESTAMPTZ;

COMMENT ON COLUMN public.sucursales.mp_terminal_id IS 'ID de terminal Mercado Pago Point (mismo en varias sucursales hasta que cada una tenga la suya)';
COMMENT ON COLUMN public.ventas.ticket_pdf_path IS 'Ruta relativa del PDF de ticket en el servidor';
COMMENT ON COLUMN public.ventas.ticket_impreso_at IS 'Momento en que se envió impresión a Smart Point';
