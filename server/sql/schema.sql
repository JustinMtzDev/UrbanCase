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
