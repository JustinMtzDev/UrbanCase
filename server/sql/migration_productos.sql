-- Ejecutar en Supabase: SQL Editor → New query → pegar → Run
-- O desde la carpeta server: npm run migrate-productos

CREATE TABLE IF NOT EXISTS public.productos (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  nombre VARCHAR(500) NOT NULL,
  precio NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  categoria VARCHAR(80),
  imagen TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_sucursal ON public.productos(sucursal_id);
