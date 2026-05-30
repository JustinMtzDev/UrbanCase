-- Permite el tipo restock_rapido en inventario_movimientos
ALTER TABLE public.inventario_movimientos
  DROP CONSTRAINT IF EXISTS inventario_movimientos_movimiento_check;

ALTER TABLE public.inventario_movimientos
  ADD CONSTRAINT inventario_movimientos_movimiento_check
  CHECK (movimiento IN (
    'venta',
    'entrada_mercancia',
    'restock_rapido',
    'ajuste_manual',
    'transferencia_salida',
    'transferencia_entrada',
    'devolucion',
    'otro'
  ));
