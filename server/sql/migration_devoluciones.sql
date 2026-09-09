-- Devoluciones de venta completa.
-- No hay tabla de detalle: al devolverse el folio entero, las líneas se leen
-- de `venta_detalle`, que nunca se modifica después de la venta.

CREATE TABLE IF NOT EXISTS public.devoluciones (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  sucursal_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE RESTRICT,
  usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  autorizado_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motivo TEXT,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  metodo_pago VARCHAR(30),
  nota_pdf_path TEXT,
  nota_impresa_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS devoluciones_venta_uniq ON public.devoluciones (venta_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_created ON public.devoluciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devoluciones_sucursal ON public.devoluciones (sucursal_id);

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS devuelta_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ventas_devuelta ON public.ventas (devuelta_at);

COMMENT ON TABLE public.devoluciones IS 'Devolución de una venta completa: regresa el stock y descuenta del corte de caja';
COMMENT ON COLUMN public.devoluciones.autorizado_por IS 'Admin o dueño que autorizó con su contraseña (NULL si lo hizo él mismo)';
COMMENT ON COLUMN public.ventas.devuelta_at IS 'Fecha de la devolución; si no es NULL la venta ya no suma en el corte';
