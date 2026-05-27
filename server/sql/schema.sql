CREATE TABLE IF NOT EXISTS sucursales (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  usuario VARCHAR(100) UNIQUE NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(50) DEFAULT 'vendedor',
  sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  telefono VARCHAR(50),
  correo VARCHAR(254),
  direccion TEXT,
  sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  rfc VARCHAR(13),
  telefono VARCHAR(50),
  correo VARCHAR(254),
  direccion TEXT,
  sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migración: agregar sucursal_id a clientes y proveedores si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes' AND column_name='sucursal_id') THEN
    ALTER TABLE clientes ADD COLUMN sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='proveedores' AND column_name='sucursal_id') THEN
    ALTER TABLE proveedores ADD COLUMN sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Migración: quitar cuenta_bancaria de proveedores si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='proveedores' AND column_name='cuenta_bancaria') THEN
    ALTER TABLE proveedores DROP COLUMN cuenta_bancaria;
  END IF;
END $$;

-- Superusuario: soporte / soporte123
INSERT INTO usuarios (usuario, nombre, password_hash, rol, activo) VALUES
  ('soporte', 'Soporte', '$2b$10$WvDeilZe/jmlV0pznP6nRe2hjjCXgvugFApuoR8wmBm5HkVnDow7C', 'admin', TRUE)
ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash, activo = TRUE;

CREATE TABLE IF NOT EXISTS public.productos (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  nombre VARCHAR(500) NOT NULL,
  precio NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_max NUMERIC(12,2),
  costo_compra NUMERIC(12,2),
  stock INTEGER NOT NULL DEFAULT 0,
  categoria VARCHAR(80),
  imagen TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_sucursal ON public.productos(sucursal_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='productos' AND column_name='costo_compra') THEN
    ALTER TABLE public.productos ADD COLUMN costo_compra NUMERIC(12,2);
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS public.inventario_favoritos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('producto', 'consignado')),
  producto_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (usuario_id, tipo, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_inventario_favoritos_usuario ON public.inventario_favoritos(usuario_id);

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
