ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS mp_order_id VARCHAR(80);

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(80);

COMMENT ON COLUMN public.ventas.mp_order_id IS 'Orden Mercado Pago Point (cobro con tarjeta)';
COMMENT ON COLUMN public.ventas.mp_payment_id IS 'Transacción de pago MP asociada a la venta';
