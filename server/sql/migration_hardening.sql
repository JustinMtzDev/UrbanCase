REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, PUBLIC';
  END IF;
END $$;

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_sucursal_id_fkey;
ALTER TABLE public.productos
  ADD CONSTRAINT productos_sucursal_id_fkey
  FOREIGN KEY (sucursal_id) REFERENCES public.sucursales(id) ON DELETE RESTRICT;

ALTER TABLE public.productos_consignados
  DROP CONSTRAINT IF EXISTS productos_consignados_sucursal_id_fkey;
ALTER TABLE public.productos_consignados
  ADD CONSTRAINT productos_consignados_sucursal_id_fkey
  FOREIGN KEY (sucursal_id) REFERENCES public.sucursales(id) ON DELETE RESTRICT;

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_stock_no_negativo;
ALTER TABLE public.productos
  ADD CONSTRAINT productos_stock_no_negativo CHECK (stock >= 0);

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_precio_no_negativo;
ALTER TABLE public.productos
  ADD CONSTRAINT productos_precio_no_negativo CHECK (precio >= 0);

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_costo_compra_no_negativo;
ALTER TABLE public.productos
  ADD CONSTRAINT productos_costo_compra_no_negativo
  CHECK (costo_compra IS NULL OR costo_compra >= 0);

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_precio_max_gte_precio;
ALTER TABLE public.productos
  ADD CONSTRAINT productos_precio_max_gte_precio
  CHECK (precio_max IS NULL OR precio_max >= precio);

ALTER TABLE public.ventas
  DROP CONSTRAINT IF EXISTS ventas_totales_no_negativos;
ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_totales_no_negativos CHECK (subtotal >= 0 AND total >= 0);

ALTER TABLE public.devoluciones
  DROP CONSTRAINT IF EXISTS devoluciones_total_no_negativo;
ALTER TABLE public.devoluciones
  ADD CONSTRAINT devoluciones_total_no_negativo CHECK (total >= 0);

ALTER TABLE public.cliente_precios
  ALTER COLUMN categoria TYPE VARCHAR(80);
ALTER TABLE public.cliente_precios
  ALTER COLUMN nombre TYPE VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_devoluciones_usuario
  ON public.devoluciones (usuario_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_autorizado_por
  ON public.devoluciones (autorizado_por);
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_usuario
  ON public.inventario_movimientos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_productos_historial_usuario
  ON public.productos_historial (usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_sucursal
  ON public.usuarios (sucursal_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['sucursales', 'usuarios', 'clientes', 'proveedores']) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t
        AND column_name = 'created_at'
        AND data_type = 'timestamp without time zone'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE ''UTC''',
        t
      );
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT NOW()', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.ventas
  DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;
ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_metodo_pago_check
  CHECK (metodo_pago IN ('efectivo', 'tarjeta'));

ALTER TABLE public.devoluciones
  DROP CONSTRAINT IF EXISTS devoluciones_metodo_pago_check;
ALTER TABLE public.devoluciones
  ADD CONSTRAINT devoluciones_metodo_pago_check
  CHECK (metodo_pago IN ('efectivo', 'tarjeta'));

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('developer', 'dueno', 'admin', 'vendedor'));

