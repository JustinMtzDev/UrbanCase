-- Precios especiales por cliente.
-- El producto se identifica por categoría + nombre (no por id) porque en
-- `productos` hay una fila por sucursal y por variante de precio.

CREATE TABLE IF NOT EXISTS public.cliente_precios (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  categoria VARCHAR(40) NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  precio NUMERIC(12,2) NOT NULL CHECK (precio > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_precios_producto_uniq
  ON public.cliente_precios (cliente_id, lower(btrim(categoria)), lower(btrim(nombre)));

CREATE INDEX IF NOT EXISTS idx_cliente_precios_cliente
  ON public.cliente_precios (cliente_id);

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ventas_cliente
  ON public.ventas (cliente_id);

COMMENT ON TABLE public.cliente_precios IS 'Precio especial por cliente para un producto (categoría + nombre); aplica en cualquier sucursal';
COMMENT ON COLUMN public.ventas.cliente_id IS 'Cliente al que se le vendió (NULL = público general)';
