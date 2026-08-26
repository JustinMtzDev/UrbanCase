-- Comisiones diarias (admin/vendedor): detalle últimos 7 días + total acumulado en usuarios.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS comision_total_acumulada NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.usuario_comision_diaria (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  dia DATE NOT NULL,
  ventas_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  comision NUMERIC(12,2) NOT NULL DEFAULT 0,
  tickets INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, dia)
);

CREATE INDEX IF NOT EXISTS idx_usuario_comision_diaria_usuario_dia
  ON public.usuario_comision_diaria (usuario_id, dia DESC);

CREATE INDEX IF NOT EXISTS idx_usuario_comision_diaria_dia
  ON public.usuario_comision_diaria (dia);
