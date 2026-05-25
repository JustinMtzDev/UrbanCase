-- Quitar columna cantidad de productos_consignados
-- Ejecutar en Supabase o: node migrate-productos-consignados-drop-cantidad.js

ALTER TABLE public.productos_consignados
  DROP CONSTRAINT IF EXISTS productos_consignados_cantidad_pos;

ALTER TABLE public.productos_consignados
  DROP COLUMN IF EXISTS cantidad;
