CREATE TABLE IF NOT EXISTS public.inventario_traslados (
  id SERIAL PRIMARY KEY,
  producto_origen_id INTEGER NOT NULL,
  producto_destino_id INTEGER NOT NULL,
  sucursal_origen_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE RESTRICT,
  sucursal_destino_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventario_traslados_origen ON public.inventario_traslados(sucursal_origen_id);
CREATE INDEX IF NOT EXISTS idx_inventario_traslados_destino ON public.inventario_traslados(sucursal_destino_id);
CREATE INDEX IF NOT EXISTS idx_inventario_traslados_created ON public.inventario_traslados(created_at DESC);
