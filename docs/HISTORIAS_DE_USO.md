# UrbanCase — Historias de uso

Documento de historias de usuario / casos de uso del POS **UrbanCase** (accesorios de celulares).

**Formato:** Como *[rol]*, quiero *[acción]*, para *[beneficio]*.

**Roles del sistema**

| Rol | Alcance resumido |
|-----|------------------|
| **Dueño** | Acceso completo; único; puede editar precio libre en venta; confirma eliminación de sucursales con contraseña |
| **Developer** | Acceso completo; único; administración técnica |
| **Admin** | Acceso completo a módulos; asignado a sucursal; genera comisión |
| **Vendedor** | Solo Inventario + carrito/cobro; ventas del día; sin alta/edición de catálogo |

---

## 1. Acceso y sesión

| ID | Historia |
|----|----------|
| HU-01 | Como usuario, quiero iniciar sesión con usuario y contraseña, para acceder al POS de forma segura. |
| HU-02 | Como usuario, quiero cerrar sesión, para que nadie más use mi cuenta en ese equipo. |
| HU-03 | Como usuario autenticado, quiero ver mi nombre y rol en la barra, para saber con qué perfil estoy operando. |
| HU-04 | Como vendedor/admin, quiero que mi sucursal quede asociada a mi sesión, para que inventario y ventas correspondan a mi local. |
| HU-05 | Como usuario con acceso completo, quiero elegir sucursal (o «Todas las sucursales») en la barra, para filtrar inventario, home y reportes. |

---

## 2. Home / Dashboard

| ID | Historia |
|----|----------|
| HU-06 | Como dueño/admin/developer, quiero ver KPIs del periodo (ingresos, utilidad, comisiones, productos vendidos, tickets, ticket promedio), para tener el panorama del negocio. |
| HU-07 | Como dueño/admin/developer, quiero cambiar el periodo (hoy / semanal / mensual / anual), para analizar el desempeño en distintos rangos. |
| HU-08 | Como dueño/admin/developer, quiero ver la gráfica de ventas de los últimos 7 días (con utilidad y productos vendidos), para detectar tendencias. |
| HU-09 | Como dueño/admin/developer, quiero ver el top 10 de productos más vendidos, para saber qué se mueve más. |
| HU-10 | Como dueño/admin/developer, quiero ver la comparativa entre sucursales cuando elijo «Todas», para comparar locales. |
| HU-11 | Como usuario, quiero cambiar entre tema claro y oscuro, para trabajar con la interfaz que prefiera. |

---

## 3. Inventario — consulta y navegación

| ID | Historia |
|----|----------|
| HU-12 | Como usuario con Inventario, quiero buscar productos por texto, para encontrarlos rápido. |
| HU-13 | Como usuario, quiero filtrar por chips (Todos, Micas, Fundas, Cargadores, Power banks, Audífonos, Bocinas, Accesorios, Otros, Consignados), para acotar el catálogo. |
| HU-14 | Como usuario, quiero navegar drill-down en micas/fundas (tipo → marca/modelo), para ubicar variantes específicas. |
| HU-15 | Como admin/dueño/developer, quiero aplicar filtros avanzados (stock, precio, imagen, orden), para refinar la búsqueda. |
| HU-16 | Como usuario, quiero ver productos en tarjetas (imagen, precio, stock, sucursal), para revisar el inventario visualmente. |
| HU-17 | Como admin/dueño/developer, quiero cambiar a vista tabla, para editar o revisar muchos productos en formato lista. |
| HU-18 | Como usuario, quiero paginar el inventario, para no cargar todo de golpe. |
| HU-19 | Como usuario, quiero marcar/desmarcar favoritos, para priorizar productos frecuentes. |
| HU-20 | Como usuario, quiero ampliar la imagen/detalle de un producto (zoom), para verlo mejor antes de vender. |
| HU-21 | Como usuario, quiero forzar la recarga de imágenes de las tarjetas, para corregir fotos que no cargaron. |
| HU-22 | Como usuario, quiero ver productos de «Todas las sucursales» agrupados, para comparar stock entre locales. |

---

## 4. Inventario — alta, edición y baja (escritura)

*Disponible para roles con gestión de inventario (admin / dueño / developer). El vendedor vende, no administra catálogo.*

| ID | Historia |
|----|----------|
| HU-23 | Como gestor, quiero agregar un producto eligiendo categoría y campos específicos, para registrar stock nuevo. |
| HU-24 | Como gestor, quiero capturar micas (cristal/hidrogel + tipo + marca/modelo cuando aplique), para nombrar el producto de forma consistente. |
| HU-25 | Como gestor, quiero capturar fundas por marca/serie/modelo de celular, para vincular la funda al dispositivo. |
| HU-26 | Como gestor, quiero capturar cargadores (tipo, marca, watts, conexión, metros), para describir el accesorio. |
| HU-27 | Como gestor, quiero capturar power banks, audífonos y bocinas con sus atributos, para un catálogo ordenado. |
| HU-28 | Como gestor, quiero en categoría **Otros** escribir un nombre libre (letras y números), para productos que no encajan en plantillas. |
| HU-29 | Como gestor, quiero indicar costo de compra, precio de venta, stock e imagen al alta, para tener costo y margen. |
| HU-30 | Como gestor, quiero editar un producto existente (precio, stock, imagen, atributos), para corregir o actualizar el catálogo. |
| HU-31 | Como gestor, quiero actualizar un producto aunque el stock sea 0, para cambiar precio u otros datos sin restock previo. |
| HU-32 | Como gestor, quiero eliminar un producto con confirmación (sin doble envío), para limpiar el catálogo de forma segura. |
| HU-33 | Como gestor, quiero agregar/editar/eliminar productos consignados, para manejar mercancía de terceros. |
| HU-34 | Como gestor, quiero hacer restock rápido sumando unidades desde las tarjetas, para reabastecer sin abrir cada modal. |
| HU-35 | Como gestor, quiero trasladar stock de un producto a otra sucursal, para redistribuir inventario. |

---

## 5. Carrito y cobro (POS)

| ID | Historia |
|----|----------|
| HU-36 | Como vendedor/admin, quiero agregar productos al carrito desde inventario, para armar la venta. |
| HU-37 | Como usuario, quiero ajustar cantidades o quitar líneas del carrito, para corregir antes de cobrar. |
| HU-38 | Como usuario, quiero vaciar el carrito, para cancelar la venta en curso. |
| HU-39 | Como dueño, quiero editar precio libre en la venta (cuando aplique), para negociar el precio solo en ese ticket. |
| HU-40 | Como usuario, quiero elegir método de pago (efectivo, tarjeta, transferencia), para registrar cómo pagó el cliente. |
| HU-41 | Como usuario, quiero en efectivo capturar monto recibido y ver el cambio, para entregar el cambio correcto. |
| HU-42 | Como usuario, quiero cobrar con tarjeta vía Mercado Pago Point (mínimo $5 MXN), para pagos con terminal. |
| HU-43 | Como usuario, quiero que al cobrar se descuente stock y se guarde la venta, para mantener inventario y caja al día. |
| HU-44 | Como usuario, quiero que se genere PDF del ticket y se intente imprimir en la Point, para entregar comprobante al cliente. |
| HU-45 | Como admin/vendedor, quiero que mis ventas del día alimenten mi comisión, para ver lo ganado por desempeño. |

---

## 6. Tickets

| ID | Historia |
|----|----------|
| HU-46 | Como usuario, quiero ver/descargar el PDF del ticket de una venta, para reimpresión o archivo. |
| HU-47 | Como usuario, quiero reimprimir el ticket en la terminal Point, para entregar otro comprobante en papel. |
| HU-48 | Como negocio, quiero que el ticket muestre folio, fecha, cajero, método, productos, total y leyendas de política (sin devoluciones, sin garantía en micas, 15 días por defecto de fábrica), para dejar claras las condiciones de venta. |

---

## 7. Ventas / Corte de caja

| ID | Historia |
|----|----------|
| HU-49 | Como admin/dueño/developer, quiero filtrar ventas por periodo y fecha, para revisar historial. |
| HU-50 | Como vendedor, quiero ver solo las ventas de hoy, para enfocarme en mi corte del día. |
| HU-51 | Como usuario, quiero ver tarjetas resumen (total, utilidad, efectivo, tarjeta, transferencia, comisiones, productos vendidos), para un corte rápido. |
| HU-52 | Como usuario, quiero listar ventas (folio, método, utilidad, total, usuario, ticket, sucursal), para auditar operaciones. |
| HU-53 | Como usuario, quiero seleccionar una venta y ver su detalle (#, producto, cantidad, precio unitario, costo de compra, utilidad, costo de venta/total línea), para entender el margen por ticket. |
| HU-54 | Como usuario, quiero recargar el listado de ventas, para ver ventas recién cobradas. |

---

## 8. Reportes (módulo relacionado)

| ID | Historia |
|----|----------|
| HU-55 | Como admin/dueño/developer, quiero ver reportes de inventario (total de productos, sin stock, stock total), para controlar existencia. |
| HU-56 | Como admin/dueño/developer, quiero filtrar reportes por sucursal, para aislar un local. |

---

## 9. Clientes y proveedores

| ID | Historia |
|----|----------|
| HU-57 | Como gestor, quiero dar de alta, editar y eliminar clientes (nombre, teléfono, correo, dirección, sucursal), para mantener la cartera. |
| HU-58 | Como gestor, quiero dar de alta, editar y eliminar proveedores (nombre, RFC, teléfono, correo, dirección, sucursal), para gestionar compras/proveeduría. |
| HU-59 | Como usuario, quiero buscar/listar clientes y proveedores en pestañas, para consultarlos rápido. |

---

## 10. Gestión — usuarios

| ID | Historia |
|----|----------|
| HU-60 | Como dueño/developer/admin autorizado, quiero listar usuarios ordenados por rol (Dueño → Developer → Admin → Vendedor), para administrar el equipo. |
| HU-61 | Como gestor, quiero crear usuarios con rol, sucursal (si aplica) y estado activo, para dar acceso al POS. |
| HU-62 | Como gestor, quiero editar usuarios (datos, rol, sucursal, activo), para actualizar permisos. |
| HU-63 | Como sistema, quiero permitir solo **un Dueño** y **un Developer**, para evitar roles únicos duplicados. |
| HU-64 | Como sistema, quiero que al editar Dueño no se puedan cambiar rol, sucursal ni activo desde UI, para proteger la cuenta principal. |
| HU-65 | Como sistema, quiero impedir eliminar al Dueño, para no dejar el negocio sin cuenta raíz. |
| HU-66 | Como gestor, quiero ver la columna **Comisión total** de admin/vendedor, para ver lo acumulado. |
| HU-67 | Como gestor, quiero abrir el detalle de comisiones de los últimos 7 días al seleccionar un admin/vendedor, para revisar día a día. |

---

## 11. Comisiones (regla de negocio)

| ID | Historia |
|----|----------|
| HU-68 | Como admin/vendedor, quiero que si mis ventas del día alcanzan al menos **$1,000**, se calcule comisión como **$50 por cada $500 completos** (`floor(ventas/500)*50`), para incentivar el volumen diario. |
| HU-69 | Como sistema, quiero persistir la comisión diaria y el acumulado histórico del usuario, para que no se pierda al purgar días viejos. |
| HU-70 | Como sistema, quiero actualizar la comisión al registrar cada venta, para que el total esté al día. |

---

## 12. Gestión — sucursales

| ID | Historia |
|----|----------|
| HU-71 | Como gestor, quiero crear y editar sucursales (nombre, activo, terminal MP si aplica), para administrar locales. |
| HU-72 | Como gestor, quiero desactivar una sucursal, para que deje de usarse en operación. |
| HU-73 | Como gestor, quiero eliminar una sucursal solo tras ingresar la **contraseña del dueño**, para evitar borrados accidentales. |
| HU-74 | Como usuario, quiero que las sucursales inactivas no aparezcan como opción operativa, para no vender en un local cerrado. |

---

## 13. Seguridad y permisos transversales

| ID | Historia |
|----|----------|
| HU-75 | Como vendedor, quiero ver solo el módulo Inventario (y el carrito), para enfocarme en vender sin acceder a gestión/reportes avanzados. |
| HU-76 | Como admin/dueño/developer, quiero navegar Home, Inventario, Ventas, Clientes/Proveedores y Gestión, para operar el negocio completo. |
| HU-77 | Como sistema, quiero proteger la API con token y roles (RBAC), para que no se ejecuten acciones no autorizadas. |
| HU-78 | Como sistema, quiero rate-limit en login y headers de seguridad, para reducir abuso y ataques básicos. |

---

## Matriz rápida rol × módulo

| Módulo | Dueño | Developer | Admin | Vendedor |
|--------|:-----:|:---------:|:-----:|:--------:|
| Home / KPIs | Sí | Sí | Sí | No* |
| Inventario (ver + vender) | Sí | Sí | Sí | Sí |
| Inventario (CRUD / restock / filtros / tabla) | Sí | Sí | Sí | No |
| Ventas / reportes amplios | Sí | Sí | Sí | Solo hoy (limitado) |
| Clientes y proveedores | Sí | Sí | Sí | No* |
| Gestión usuarios/sucursales | Sí | Sí | Sí | No |
| Precio libre en venta | Sí | No* | No* | No |
| Comisión por ventas | No | No | Sí | Sí |

\*Según UI actual: vendedor restringido a inventario; precio libre documentado para dueño.

---

## Criterios de aceptación genéricos (aplicar a historias de escritura)

1. La acción solo es posible con sesión válida y rol permitido.  
2. Errores de validación se muestran al usuario sin corromper datos.  
3. Tras guardar/eliminar, la lista o inventario se actualiza.  
4. Operaciones destructivas piden confirmación; el botón de confirmar no dispara dos veces.  
5. Los montos se muestran en MXN con formato coherente.

---

## Notas

- Este documento refleja el comportamiento **actual** del código (frontend + API + reglas de comisión/tickets).  
- Si cambia una regla de negocio, actualizar la historia correspondiente y la matriz de roles.  
- Priorización sugerida para pruebas UAT: **HU-01 → HU-36–45 (venta) → HU-23–35 (inventario) → HU-49–54 (ventas) → HU-60–73 (gestión)**.
