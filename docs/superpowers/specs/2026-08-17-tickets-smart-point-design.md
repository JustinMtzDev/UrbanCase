# Tickets de venta: Smart Point 2 + PDF digital

Fecha: 2026-08-17  
Estado: pendiente de revisión

## Objetivo

En cada venta, UrbanCase debe:

1. Imprimir el ticket en papel en la **Mercado Pago Smart Point 2**.
2. Guardar un **PDF digital** del mismo ticket.
3. Mostrar en Ventas una columna **Ticket** (antes de Sucursal) con un icono de archivo que abre el ticket en **otra pestaña**.

El método de pago (efectivo, tarjeta o transferencia) no cambia el flujo: siempre se intenta imprimir y generar PDF.

## Fuera de alcance (v1)

- Cobrar con la Point (integración de pago con tarjeta en la terminal).
- Reimpresión masiva de ventas históricas.
- Logo/imagen en el ticket térmico (solo texto).
- Envío de ticket por WhatsApp o correo.

## Contexto actual

- Las ventas se crean en `POST /api/ventas` (`server/routes/ventas.js`).
- Métodos: `efectivo`, `tarjeta`, `transferencia`.
- No hay impresión ni PDF.
- La tabla de Ventas (`#tabla-reporte-corte-caja`) tiene **6 encabezados** y **7 celdas** por fila (falta el encabezado de cantidad de artículos), por eso Fecha/Folio/Método se ven bien y el resto se recorre.
- Hay dos sucursales (Matriz, Local 6). Hoy se usa **una sola Point** en ambas; después cada sucursal tendrá la suya.

## Decisiones

| Tema | Decisión |
|------|----------|
| Terminal | `mp_terminal_id` en `sucursales`. Hoy el mismo ID en las dos filas. |
| Token MP | Solo en servidor: `MP_ACCESS_TOKEN` en `server/.env`. |
| Fallo de impresora | La venta **sí se guarda**. Se informa que el ticket de papel no salió. |
| Fallo de PDF | La venta **sí se guarda**. La columna Ticket muestra sin archivo hasta reintentar (opcional en v1). |
| Apertura | Icono de archivo → nueva pestaña `ticket.html?venta={id}`. |
| Históricas | Ventas anteriores sin PDF: la celda queda vacía o con icono deshabilitado. |

## Arquitectura

```
Cobrar (POS)
  → POST /api/ventas  (transacción inventario + venta)
  → generar PDF en disco, guardar ruta en ventas.ticket_pdf_path
  → POST Mercado Pago Terminals API (type: print)  — no bloquea el cobro si tarda/falla
  → respuesta JSON: { venta, ticket: { pdf: true|false, print: true|false } }

Ventas tabla
  → icono archivo
  → ticket.html?venta=ID  (usa uc_token de localStorage)
  → GET /api/ventas/:id/ticket  (PDF inline o HTML del comprobante)
```

### Unidades

1. **`sucursales.mp_terminal_id`** — qué Point usa cada sucursal.
2. **`server/services/ticket-pdf.js`** — arma y guarda el PDF.
3. **`server/services/ticket-point.js`** — manda impresión custom a Mercado Pago.
4. **`POST /api/ventas`** — orquesta cobro + PDF + print.
5. **`GET /api/ventas/:id/ticket`** — entrega el PDF (auth Bearer).
6. **`ticket.html`** — página dedicada que pide el PDF y lo muestra.
7. **Tabla Ventas** — columna Ticket + corrección de encabezados.

## Datos

### `sucursales`

- `mp_terminal_id VARCHAR(80) NULL`  
  Ejemplo: `NEWLAND_N950__N950NCB…` (tal como lo devuelve Get terminals de MP).

### `ventas`

- `ticket_pdf_path TEXT NULL` — ruta relativa en servidor, p. ej. `tickets/venta-17.pdf`.
- Opcional v1: `ticket_impreso_at TIMESTAMPTZ NULL` para saber si el papel salió.

Archivos en `server/tickets/` (fuera de git, no servir como estático público).

### Variables de entorno

```
MP_ACCESS_TOKEN=APP_USR-...
```

Sin token o sin `mp_terminal_id`: se genera PDF igual; la impresión de papel se omite con log/warning.

## Contenido del ticket (papel y PDF iguales en datos)

- URBAN CASE  
- Sucursal  
- Folio `#N`  
- Fecha y hora  
- Líneas: nombre, cantidad, importe  
- Total  
- Método de pago  
- Cajero (nombre de usuario)  
- Texto de cierre: “Gracias por su compra”

Papel (Point): texto con tags de MP (`{center}`, `{br}`, `{b}`, `{s}`, mínimo 100 caracteres).  
PDF: layout térmico simple (80 mm o A5 estrecho), tipografía mono, listo para ver en navegador.

## Tabla Ventas

Encabezados (alineados con las celdas):

`Fecha | Folio | Método | Arts. | Total | Usuario | Ticket | Sucursal`

Columna Ticket:

- Si hay PDF: botón/enlace con icono de archivo (`fa-file-lines` o equivalente).
- Click: `window.open('/ticket.html?venta=' + id, '_blank')`.
- Sin PDF: celda vacía o icono apagado, sin acción.

`colspan` de filas vacías: 8.

## Impresión Smart Point 2

- `POST https://api.mercadopago.com/terminals/v1/actions`
- Headers: `Authorization: Bearer MP_ACCESS_TOKEN`, `X-Idempotency-Key` (UUID de la venta).
- Body: `type: "print"`, `config.point.terminal_id`, `subtype: "custom"`, `content` con tags.
- Si MP no acepta o la terminal está offline: capturar error, no revertir la venta.

Referencia: [Configure printings](https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-printings).

## Auth al abrir otra pestaña

`token` vive en `localStorage` (`uc_token`), no en cookie. Un `GET` directo a `/api/.../ticket.pdf` en pestaña nueva **no** enviaría el Bearer.

Por eso `ticket.html`:

1. Lee `venta` del query string.
2. Lee `uc_token`.
3. Si no hay sesión → login.
4. `GET /api/ventas/:id/ticket` con Authorization.
5. Muestra el PDF en la página (`<embed>` / blob URL en esa pestaña).

El API no debe permitir el PDF sin auth.

## Errores y UI POS

Tras cobro exitoso, el modal de venta puede decir:

- “Ticket enviado a la impresora” / “No se pudo imprimir el ticket (la venta sí quedó)”
- El PDF no se muestra en el POS; se consulta en Ventas.

## Cómo se verifica

1. Poner el mismo `mp_terminal_id` en Matriz y Local 6.
2. Cobrar efectivo, tarjeta y transferencia.
3. Confirmar papel en la Point (si hay token + terminal online).
4. En Ventas: 8 columnas alineadas; icono abre pestaña con el PDF.
5. Sin `MP_ACCESS_TOKEN`: cobro y PDF funcionan; no se imprime papel.
6. Usuario no autenticado no abre el ticket.

## Riesgos

- Point apagada, sin red, o impresión remota no habilitada en la cuenta MP.
- Límite de contenido custom (100–4096 caracteres); ventas con muchos artículos hay que truncar o partir.
- `server/tickets/` en un host efímero pierde PDFs; v1 acepta disco local.
