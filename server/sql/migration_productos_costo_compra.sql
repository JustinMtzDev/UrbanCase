-- Costo de compra al proveedor (interno; precio/precio_max siguen siendo venta)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS costo_compra NUMERIC(12,2);
