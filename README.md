# UrbanCase

Punto de venta para accesorios de celular.

```
UrbanCase/
├── public/          Interfaz (HTML, CSS, JS, imágenes)
├── server/          API Express, SQL y scripts de la base
├── docs/            Historias de uso y notas de seguridad
├── respaldos/       Copias locales de datos (no van a git)
├── package.json     npm start / npm run server
└── railway.toml     Despliegue en Railway
```

- Entrar: `npm start` → http://localhost:3000
- La app se ve en `public/`. El negocio (ventas, stock, permisos) está en `server/`.
- Variables: `server/.env` (ver `server/.env.example`).
