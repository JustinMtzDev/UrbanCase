CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  usuario VARCHAR(100) UNIQUE NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(50) DEFAULT 'vendedor',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Superusuario: soporte / Justin2025@
INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES
  ('soporte', 'Soporte', '$2b$10$OBiD2mwn91CgxrOkZDDlBuak.6p/3Ia9zTvsJ3XqDx68FQv4/46NW', 'admin')
ON CONFLICT (usuario) DO NOTHING;
