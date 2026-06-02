CREATE TABLE IF NOT EXISTS public.ventas (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE RESTRICT,
  usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ventas_created ON public.ventas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_sucursal ON public.ventas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_ventas_usuario ON public.ventas(usuario_id);

CREATE TABLE IF NOT EXISTS public.venta_detalle (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  producto_id INTEGER,
  producto_consignado_id INTEGER,
  producto_nombre VARCHAR(500) NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario > 0),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal > 0),
  es_consignado BOOLEAN NOT NULL DEFAULT FALSE,
  detalle JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta ON public.venta_detalle(venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_detalle_producto ON public.venta_detalle(producto_id);
