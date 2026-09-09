-- Endurecimiento de la base antes de produccion.
-- Idempotente: se puede correr varias veces sin efectos distintos.
-- Ejecutar en Supabase (SQL Editor) o desde server: npm run migrate-hardening

-- 1) Permisos de los roles del API de Supabase.
-- La app se conecta con DATABASE_URL (rol dueño, que ignora RLS), así que anon
-- y authenticated no necesitan nada de public. Hoy lo único que los frena es
-- que RLS está activa y sin políticas: un descuido al crear una tabla nueva o
-- al agregar una política deja el inventario y las ventas al aire.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Y que las tablas y secuencias futuras nazcan sin esos permisos.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- rls_auto_enable() puede activar o dejar de activar RLS: no la ejecuta nadie
-- más que el dueño. El IF EXISTS es para bases nuevas donde no está creada.
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

-- 2) Borrar una sucursal no puede arrastrarse el inventario.
-- Las FK de productos y productos_consignados están en CASCADE y
-- DELETE /api/sucursales/:id no valida nada: un clic borra todo su catálogo.
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

-- 3) No negatividad de dinero y stock. Verificado con SELECT: no hay filas que
-- violen ninguno de estos CHECK.
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

-- 4) cliente_precios guarda categoría + nombre del producto, pero más cortos
-- que en productos (VARCHAR(80) y VARCHAR(500)): hoy un producto de nombre
-- largo no puede tener precio especial y el INSERT revienta con 500.
ALTER TABLE public.cliente_precios
  ALTER COLUMN categoria TYPE VARCHAR(80);
ALTER TABLE public.cliente_precios
  ALTER COLUMN nombre TYPE VARCHAR(500);

-- 5) Índices de las FK que no los tienen. Sin ellos, borrar un usuario o una
-- sucursal recorre las tablas completas.
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

-- 6) created_at sin zona en las cuatro tablas viejas; el resto del esquema ya
-- usa TIMESTAMPTZ. Los valores guardados son UTC (la base corre en UTC), así
-- que se reinterpretan como UTC. El IF de tipo evita el doble corrimiento si
-- la migración se vuelve a correr.
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

-- 7) Valores válidos en columnas de texto que el código trata como enumeración,
-- al estilo del CHECK que ya existe en inventario_movimientos.movimiento.
-- Verificado con SELECT: ventas.metodo_pago solo tiene 'efectivo' y 'tarjeta',
-- devoluciones.metodo_pago solo 'efectivo', y usuarios.rol solo 'developer',
-- 'dueno' y 'vendedor'. NULL sigue permitido porque el CHECK no lo evalúa.
-- OJO: server/routes/ventas.js todavía acepta metodo_pago = 'transferencia' en
-- su lista METODOS_PAGO. Si algún día se usa, este CHECK la rechaza: hay que
-- quitarla de esa lista o agregarla aquí.
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

-- Pendiente y a propósito fuera de este archivo: el CHECK de coherencia de
-- venta_detalle (producto_id contra es_consignado / producto_consignado_id).
-- Hay una fila con producto_id de un producto ya borrado que lo violaría; antes
-- hay que decidir qué hacer con ese histórico. Tampoco van aquí la tabla de
-- comisiones (la crea migration_usuario_comisiones.sql) ni los índices de
-- expresión de fecha para reportes, que dependen del volumen real.
