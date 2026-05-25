CREATE TABLE IF NOT EXISTS public.inventario_favoritos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('producto', 'consignado')),
  producto_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (usuario_id, tipo, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_inventario_favoritos_usuario
  ON public.inventario_favoritos(usuario_id);
