-- Ejecutar en Supabase: SQL Editor → New query → pegar → Run
-- O desde la carpeta server: npm run migrate-productos-consignados

CREATE TABLE IF NOT EXISTS public.productos_consignados (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  nombre VARCHAR(500) NOT NULL,
  costo_consignacion NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0,
  categoria VARCHAR(80),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT productos_consignados_costo_lte_venta CHECK (costo_consignacion <= precio_venta),
  CONSTRAINT productos_consignados_precios_pos CHECK (costo_consignacion > 0 AND precio_venta > 0)
);

CREATE INDEX IF NOT EXISTS idx_productos_consignados_sucursal ON public.productos_consignados(sucursal_id);
