CREATE TABLE IF NOT EXISTS public.productos_historial (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER,
  producto_nombre VARCHAR(500) NOT NULL,
  accion VARCHAR(20) NOT NULL CHECK (accion IN ('alta', 'edicion', 'eliminacion')),
  campo VARCHAR(80),
  valor_anterior TEXT,
  valor_nuevo TEXT,
  usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  sucursal_id INTEGER REFERENCES public.sucursales(id) ON DELETE SET NULL,
  detalle JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_historial_created
  ON public.productos_historial(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productos_historial_producto
  ON public.productos_historial(producto_id);
CREATE INDEX IF NOT EXISTS idx_productos_historial_sucursal
  ON public.productos_historial(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_productos_historial_accion
  ON public.productos_historial(accion);
