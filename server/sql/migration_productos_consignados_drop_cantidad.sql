ALTER TABLE public.productos_consignados
  DROP CONSTRAINT IF EXISTS productos_consignados_cantidad_pos;

ALTER TABLE public.productos_consignados
  DROP COLUMN IF EXISTS cantidad;
