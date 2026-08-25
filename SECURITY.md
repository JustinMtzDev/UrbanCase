# Seguridad — UrbanCase

Medidas implementadas en el servidor y recomendaciones para producción.

## Implementado

| Medida | Descripción |
|--------|-------------|
| **Cabeceras de seguridad** | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, etc. |
| **Rate limit en login** | Máx. 10 intentos / 15 min por IP (`LOGIN_RATE_MAX`). |
| **Sesiones con expiración** | Token en memoria con TTL de 12 h (`SESSION_TTL_MS`). |
| **RBAC** | Rutas `/api/usuarios` solo **admin**. Crear/editar/borrar sucursales solo **admin**. |
| **CORS configurable** | Variable `CORS_ORIGINS` (lista separada por comas). |
| **Bloqueo de archivos sensibles** | No se sirven `/server/`, `.env`, `.sql`, `.md` por HTTP. |
| **Health mínimo** | `/api/health` ya no expone host ni nombre de BD. |
| **Errores en producción** | Con `NODE_ENV=production`, los 500 no filtran `err.message`. |
| **Frontend** | Módulo **Gestión** oculto para vendedores. |

## Variables de entorno (`server/.env`)

```env
NODE_ENV=production
SESSION_TTL_MS=43200000
LOGIN_RATE_MAX=10
CORS_ORIGINS=https://tu-dominio.com
```

## Roles

- **admin**: usuarios, sucursales (escritura), todo el POS.
- **vendedor**: ventas, inventario, clientes; sin gestión de usuarios/sucursales.

## Pendiente recomendado (siguiente fase)

1. **Cookies HttpOnly** para el token (reduce robo por XSS).
2. **Sesiones en PostgreSQL** (reinicio del servidor no cierra sesiones; multi-instancia).
3. **HTTPS** obligatorio en producción (reverse proxy o hosting).
4. **Cambiar contraseña** del usuario `soporte` por defecto si existe en tu BD.
5. **Auditoría de logs** (intentos de login fallidos, cambios críticos).

## Comandos

```bash
cd server
npm start
```

Reinicia el servidor tras cambios en `server/`.
