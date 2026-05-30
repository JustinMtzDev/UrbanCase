CREATE TABLE IF NOT EXISTS public.inventario_movimientos (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER,
  producto_nombre VARCHAR(500) NOT NULL,
  movimiento VARCHAR(40) NOT NULL CHECK (
    movimiento IN (
      'venta',
      'entrada_mercancia',
      'ajuste_manual',
      'transferencia_salida',
      'transferencia_entrada',
      'devolucion',
      'otro'
    )
  ),
  cantidad INTEGER NOT NULL CHECK (cantidad <> 0),
  usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  sucursal_id INTEGER REFERENCES public.sucursales(id) ON DELETE SET NULL,
  detalle JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_created
  ON public.inventario_movimientos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_producto
  ON public.inventario_movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_sucursal
  ON public.inventario_movimientos(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_movimiento
  ON public.inventario_movimientos(movimiento);
