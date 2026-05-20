# UrbanCase — Documentación del proyecto

**POS para accesorios de celulares**  
Stack: Node.js + Express + Supabase (PostgreSQL), frontend vanilla (HTML, CSS, JS).

---

## Estructura del proyecto

```
UrbanCase/
├── index.html              # App principal (POS, inventario, ventas, clientes, gestión)
├── login.html              # Pantalla de login
├── package.json            # Scripts raíz (npm start → server)
├── package-lock.json
│
├── css/
│   └── styles.css          # Estilos globales
│
├── js/
│   └── app.js              # Lógica frontend (auth, inventario, POS, modales, ventas)
│
├── img/                    # Imágenes y assets
│   ├── urbanCase.svg
│   ├── logo.svg / logoDark.svg
│   ├── icon_ojo_abierto.svg / icon_ojo_cerrado.svg
│   └── icon_ojo_abierto_dark.svg / icon_ojo_cerrado_dark.svg
│
└── server/
    ├── index.js            # Punto de entrada Express
    ├── package.json        # Dependencias del servidor
    ├── init-supabase.js    # Inicializa tablas en Supabase
    │
    ├── config/
    │   └── db.js           # Pool de conexión PostgreSQL
    │
    ├── middleware/
    │   └── auth.js         # Middleware de autenticación (sessions)
    │
    ├── routes/
    │   ├── auth.js         # POST /login, /logout, GET /me
    │   ├── usuarios.js     # CRUD usuarios
    │   ├── sucursales.js   # CRUD sucursales
    │   ├── clientes.js     # CRUD clientes
    │   ├── proveedores.js  # CRUD proveedores
    │   └── productos.js    # CRUD productos por sucursal
    │
    └── sql/
        └── schema.sql     # Esquema de base de datos
```

---

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm start` | Inicia el servidor (puerto 3000) |
| `npm run dev` | Alias de `npm start` |
| `cd server && npm run init-supabase` | Crea/actualiza tablas en Supabase (requiere `DATABASE_URL`) |
| `cd server && npm run migrate-productos` | Solo crea `public.productos` + índice (si falló antes o solo falta esa tabla) |

---

## Variables de entorno

| Variable | Ubicación | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | `server/.env` | Connection string de PostgreSQL (Supabase) |

---

## API REST

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/health` | No | Estado del servidor y BD |
| POST | `/api/auth/login` | No | Login (usuario, password) |
| POST | `/api/auth/logout` | No | Cerrar sesión |
| GET | `/api/auth/me` | No | Usuario actual (token) |
| GET | `/api/usuarios` | Sí | Listar usuarios |
| POST | `/api/usuarios` | Sí | Crear usuario |
| PUT | `/api/usuarios/:id` | Sí | Actualizar usuario |
| DELETE | `/api/usuarios/:id` | Sí | Eliminar usuario |
| GET | `/api/sucursales` | Sí | Listar sucursales |
| POST | `/api/sucursales` | Sí | Crear sucursal |
| PUT | `/api/sucursales/:id` | Sí | Actualizar sucursal |
| DELETE | `/api/sucursales/:id` | Sí | Eliminar sucursal |
| GET | `/api/clientes` | Sí | Listar clientes |
| POST | `/api/clientes` | Sí | Crear cliente |
| PUT | `/api/clientes/:id` | Sí | Actualizar cliente |
| DELETE | `/api/clientes/:id` | Sí | Eliminar cliente |
| GET | `/api/proveedores` | Sí | Listar proveedores |
| POST | `/api/proveedores` | Sí | Crear proveedor |
| PUT | `/api/proveedores/:id` | Sí | Actualizar proveedor |
| DELETE | `/api/proveedores/:id` | Sí | Eliminar proveedor |
| GET | `/api/productos?sucursal_id=` | Sí | Listar productos de esa sucursal |
| GET | `/api/productos?sucursal_id=all` | Sí | Igual que abajo (compatibilidad) |
| GET | `/api/productos/inventario-todas-sucursales` | Sí | Listar todos los productos con `sucursal_nombre` (usa esta ruta en el front para «Todas las sucursales») |
| POST | `/api/productos` | Sí | Crear producto (body: nombre, precio, stock, categoría opcional, imagen opcional, `sucursal_id` o `id_sucursal`) |
| PUT | `/api/productos/:id` | Sí | Actualizar producto |
| DELETE | `/api/productos/:id` | Sí | Eliminar producto |

**Auth**: `Authorization: Bearer <token>`

Las respuestas JSON incluyen `sucursal_id` y un alias **`id_sucursal`** (mismo valor) para uso en cliente.

---

## Módulos del frontend

| Módulo | Descripción |
|--------|-------------|
| **Home** | Vista principal con productos |
| **Sucursales** | Dropdown para seleccionar sucursal |
| **Inventario** | Productos desde API por sucursal elegida, buscador, modal "Agregar producto" |
| **Ventas y Reportes** | Carrito y ventas |
| **Clientes y Proveedores** | Tabs con CRUD de clientes y proveedores |
| **Gestión** | Usuarios y sucursales |

---

## Schema SQL

```sql
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

CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  nombre VARCHAR(500) NOT NULL,
  precio NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  categoria VARCHAR(80),
  imagen TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_sucursal ON productos(sucursal_id);
```

---

## Tablas y relaciones

```
sucursales (1) ────< (N) usuarios
sucursales (1) ────< (N) clientes
sucursales (1) ────< (N) proveedores
sucursales (1) ────< (N) productos
```

| Tabla | Campos principales |
|-------|---------------------|
| **sucursales** | id, nombre, activo |
| **usuarios** | id, usuario, nombre, password_hash, rol, sucursal_id |
| **clientes** | id, nombre, telefono, correo, direccion, sucursal_id |
| **proveedores** | id, nombre, rfc, telefono, correo, direccion, sucursal_id |
| **productos** | id, nombre, precio, stock, categoria, imagen, sucursal_id (FK), created_at |

---

## Usuario por defecto

- **Usuario**: `soporte`
- **Contraseña**: `soporte123`
