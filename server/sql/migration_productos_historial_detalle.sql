DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'productos_historial' AND column_name = 'detalle'
  ) THEN
    ALTER TABLE public.productos_historial ADD COLUMN detalle JSONB;
  END IF;
END $$;
