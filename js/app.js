// Si abres el HTML directo (file://), redirigir al servidor
if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
  window.location.href = 'http://localhost:3000/';
}
// UrbanCase API: mismo origen si la app corre en el puerto 3000 con Express; si no, Node en localhost:3000
function ucResolveApiBase() {
  if (typeof window === 'undefined') return '/api';
  const { protocol, hostname, origin } = window.location;
  const p = String(window.location.port || '');
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (protocol === 'file:') return 'http://localhost:3000/api';
  if (isLocal && p === '3000') return `${origin}/api`;
  if (isLocal) return 'http://localhost:3000/api';
  return `${origin}/api`;
}
const API = ucResolveApiBase();
if (typeof window !== 'undefined') window.ucResolveApiBase = ucResolveApiBase;
let token = '';

const ROLES_ACCESO_COMPLETO = new Set(['admin', 'developer', 'dueno', 'dueño']);

function normalizarRolUsuario(rol) {
  const r = String(rol ?? '').trim().toLowerCase();
  if (r === 'dueño' || r === 'owner') return 'dueno';
  return r;
}

function esUsuarioConAccesoCompleto(rol) {
  const r = normalizarRolUsuario(rol ?? window.ucUsuarioSesion?.rol);
  return ROLES_ACCESO_COMPLETO.has(r);
}

function rolRequiereSucursalAsignada(rol) {
  const r = normalizarRolUsuario(rol);
  return r === 'admin' || r === 'vendedor';
}

function esUsuarioVendedor(rol) {
  return normalizarRolUsuario(rol ?? window.ucUsuarioSesion?.rol) === 'vendedor';
}

function esUsuarioAdmin() {
  return esUsuarioConAccesoCompleto();
}

function claseBadgeRol(rol) {
  const r = normalizarRolUsuario(rol);
  if (r === 'dueno') return 'badge-dueno';
  if (r === 'developer') return 'badge-developer';
  if (r === 'admin') return 'badge-admin';
  return 'badge-vendedor';
}

function etiquetaRolUsuario(rol) {
  const r = normalizarRolUsuario(rol);
  const map = {
    dueno: 'Dueño',
    developer: 'Developer',
    admin: 'Admin',
    vendedor: 'Vendedor',
  };
  return map[r] || String(rol || '');
}

function puedeGestionarInventario() {
  return esUsuarioAdmin();
}

function forzarVentasSoloHoyVendedor() {
  if (esUsuarioAdmin()) return;
  reporteVentasPeriodoFiltro = 'diario';
  reporteVentasFechaFiltro = fechaHoyLocalInput();
}

function aplicarUiPermisosModuloVentas() {
  const esAdmin = esUsuarioAdmin();
  const esVendedor = !esAdmin;
  document.body.classList.toggle('uc-ventas-solo-hoy', esVendedor);
  document.body.classList.toggle('uc-modulo-ventas-admin', esAdmin);
  const $filtros = document.getElementById('reporte-ventas-filtros');
  const $toolbarVentas = document.getElementById('modulo-toolbar-ventas');
  const $toolbarModulo = document.getElementById('modulo-ventas-toolbar');
  const $btnRecargarIcono = document.getElementById('btn-recargar-ventas-icono');
  if ($filtros) $filtros.hidden = esVendedor;
  if ($toolbarVentas) $toolbarVentas.hidden = esVendedor;
  if ($toolbarModulo) $toolbarModulo.hidden = esVendedor;
  if ($btnRecargarIcono) $btnRecargarIcono.hidden = !esVendedor;
  if (esVendedor) forzarVentasSoloHoyVendedor();
}

function aplicarUiPermisosInventarioEscritura() {
  const puede = puedeGestionarInventario();
  document.body.classList.toggle('uc-sin-gestion-inventario', !puede);
  ['btn-agregar-producto', 'btn-agregar-consignado', 'btn-inventario-restock', 'btn-inventario-filtros', 'btn-inventario-vista-tabla'].forEach((id) => {
    const $el = document.getElementById(id);
    if ($el) $el.hidden = !puede;
  });
  if (!puede) {
    if (typeof inventarioVistaModo !== 'undefined' && inventarioVistaModo === 'tabla') {
      inventarioVistaModo = 'cards';
    }
    document.getElementById('modal-inventario-filtros')?.classList.remove('visible');
    document.body.classList.remove('modal-inventario-filtros-abierto');
    window.ucDesactivarModoRestockRapido?.();
    window.ucCerrarModalProducto?.();
  }
}

const MODULOS_NAV_VENDEDOR = new Set(['inventario', 'ventas']);

function parseSucursalIdUsuario(usuario) {
  if (!usuario) return null;
  const raw = usuario.sucursal_id ?? usuario.sucursalId ?? usuario.id_sucursal;
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function mergePerfilDesdeStorage(perfil) {
  try {
    const stored = JSON.parse(localStorage.getItem('uc_usuario') || 'null');
    if (!stored || typeof stored !== 'object') return perfil;
    const sid = parseSucursalIdUsuario(perfil);
    const sidStored = parseSucursalIdUsuario(stored);
    if (sid != null) return perfil;
    if (sidStored == null) return perfil;
    return {
      ...perfil,
      sucursal_id: sidStored,
      sucursal_nombre: perfil?.sucursal_nombre || stored.sucursal_nombre || null,
    };
  } catch (_) {
    return perfil;
  }
}

async function refrescarPerfilUsuario() {
  try {
    const r = await fetch(`${API}/auth/me`, { headers: authHeaders(false) });
    if (!r.ok) return null;
    const u = mergePerfilDesdeStorage(await r.json());
    aplicarPermisosSegunRol(u);
    try { localStorage.setItem('uc_usuario', JSON.stringify(u)); } catch (_) {}
    return u;
  } catch (_) {
    return null;
  }
}

async function resolverSucursalAsignadaVendedor() {
  await refrescarPerfilUsuario();
  let sid = parseSucursalIdUsuario(window.ucUsuarioSesion);
  let nombre = String(window.ucUsuarioSesion?.sucursal_nombre || '').trim();

  if (sid == null && nombre) {
    try {
      const r = await fetch(`${API}/sucursales`, { headers: authHeaders(false) });
      if (r.ok) {
        const list = await r.json();
        const match = Array.isArray(list)
          ? list.find((s) => esSucursalActiva(s) && String(s.nombre || '').trim().toLowerCase() === nombre.toLowerCase())
          : null;
        if (match) {
          sid = parseSucursalIdUsuario(match);
          nombre = match.nombre || nombre;
        }
      }
    } catch (_) {}
  }

  if (sid != null) {
    window.ucUsuarioSesion = {
      ...window.ucUsuarioSesion,
      sucursal_id: sid,
      sucursal_nombre: nombre || window.ucUsuarioSesion?.sucursal_nombre,
    };
    try {
      localStorage.setItem('uc_usuario', JSON.stringify(window.ucUsuarioSesion));
    } catch (_) {}
  }

  return { sid, nombre };
}

function actualizarUsuarioHeader(usuario) {
  const $info = document.getElementById('usuario-info');
  const $nombre = document.getElementById('usuario-nombre');
  const $rol = document.getElementById('usuario-rol-badge');
  if (!$info || !$nombre) return;
  $nombre.textContent = usuario?.nombre || '';
  if ($rol) {
    const rol = normalizarRolUsuario(usuario?.rol);
    $rol.textContent = etiquetaRolUsuario(rol);
    $rol.className = `badge usuario-rol-badge ${claseBadgeRol(rol)}`;
  }
  $info.style.display = 'flex';
}

function aplicarPermisosSegunRol(usuario) {
  const rol = normalizarRolUsuario(usuario?.rol);
  const accesoCompleto = esUsuarioConAccesoCompleto(rol);
  const sucursalId = parseSucursalIdUsuario(usuario);
  window.ucUsuarioSesion = {
    id: usuario?.id,
    usuario: usuario?.usuario,
    nombre: usuario?.nombre,
    rol,
    sucursal_id: sucursalId,
    sucursal_nombre: usuario?.sucursal_nombre || null,
  };
  actualizarUsuarioHeader(window.ucUsuarioSesion);
  document.body.classList.toggle('uc-rol-admin', accesoCompleto);
  document.body.classList.toggle('uc-rol-vendedor', rol === 'vendedor');
  ['todos', 'clientes', 'usuarios'].forEach((cat) => {
    const $btn = document.querySelector(`.categoria-btn[data-categoria="${cat}"]`);
    if ($btn) $btn.hidden = !accesoCompleto;
  });
  if (!accesoCompleto) {
    try {
      const mod = localStorage.getItem(MODULO_KEY);
      if (!MODULOS_NAV_VENDEDOR.has(mod)) localStorage.removeItem(MODULO_KEY);
      if (localStorage.getItem(VENTAS_SUBMODULO_KEY) === 'reportes') {
        localStorage.setItem(VENTAS_SUBMODULO_KEY, 'ventas');
      }
    } catch (_) {}
  }
  aplicarUiPermisosInventarioEscritura();
  aplicarUiPermisosModuloVentas();
}

(async () => {
  token = localStorage.getItem('uc_token');
  if (!token) return window.location.href = '/login.html';
  try {
    const r = await fetch(`${API}/auth/me`, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) throw 0;
    const u = mergePerfilDesdeStorage(await r.json());
    aplicarPermisosSegunRol(u);
    try { localStorage.setItem('uc_usuario', JSON.stringify(u)); } catch (_) {}
    actualizarUsuarioHeader(u);
  } catch {
    localStorage.removeItem('uc_token');
    localStorage.removeItem('uc_usuario');
    return window.location.href = '/login.html';
  }

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await fetch(`${API}/auth/logout`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(() => {});
    localStorage.removeItem('uc_token');
    localStorage.removeItem('uc_usuario');
    localStorage.removeItem('uc_modulo');
    localStorage.removeItem(SUCURSAL_KEY);
    window.location.href = '/login.html';
  });

  initPOS();
  initModulo();
  initModuloVentas();
  initModuloClientes();
  initDropdownSucursales();
  try {
    if (esUsuarioVendedor()) {
      await fijarSucursalVendedor();
    } else if (localStorage.getItem(SUCURSAL_KEY)) {
      await restaurarSucursalGuardada();
    } else if (normalizarRolUsuario(window.ucUsuarioSesion?.rol) === 'admin') {
      const sid = parseSucursalIdUsuario(window.ucUsuarioSesion);
      if (sid != null) {
        aplicarSeleccionSucursal(String(sid), window.ucUsuarioSesion?.sucursal_nombre || 'Mi sucursal');
      } else {
        aplicarSeleccionSucursal('all', 'Todas las sucursales');
      }
    } else {
      aplicarSeleccionSucursal('all', 'Todas las sucursales');
    }
  } catch (err) { console.error('restaurarSucursalGuardada:', err); }
  initNav();
  initNavMenu();
  try { initInventarioProductoZoom(); } catch (err) { console.error('initInventarioProductoZoom:', err); }
  try { initInventarioVista(); } catch (err) { console.error('initInventarioVista:', err); }
  try { initModalTrasladarInventario(); } catch (err) { console.error('initModalTrasladarInventario:', err); }
  try { initProductoModal(); } catch (err) { console.error('initProductoModal:', err); }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('app-loading');
      if (document.querySelector('.categoria-btn[data-categoria="todos"].activo')) {
        window.ucCargarHomeDashboards?.();
      }
    });
  });
})();

function authHeaders(json = true) {
  const h = { 'Authorization': 'Bearer ' + token };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// Validaciones para clientes/proveedores
const validaciones = {
  telefono: (v) => !v || /^\d{10}$/.test(v) || 'El teléfono debe tener exactamente 10 dígitos (sin letras)',
  correo: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Ingresa un correo electrónico válido',
  rfc: (v) => !v || /^([A-ZÑ&]{3,4})\d{6}([A-Z0-9]{3})$/.test(v.replace(/\s/g, '').toUpperCase()) || 'El RFC debe tener formato: 3-4 letras + 6 dígitos + 3 caracteres (ej: XAXX010101XXX)',
};

function formatFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// ===================== NAVEGACIÓN =====================

const MODULO_KEY = 'uc_modulo';
const SUCURSAL_KEY = 'uc_sucursal';

function esSucursalActiva(s) {
  return Boolean(s) && s.activo !== false;
}

function filtrarSucursalesActivas(lista) {
  return Array.isArray(lista) ? lista.filter(esSucursalActiva) : [];
}
const VENTAS_SUBMODULO_KEY = 'uc_ventas_submodulo';

function guardarSucursalSeleccionada(sidRaw, nombre) {
  try {
    if (sidRaw == null || sidRaw === '') {
      localStorage.removeItem(SUCURSAL_KEY);
      return;
    }
    localStorage.setItem(SUCURSAL_KEY, JSON.stringify({ id: String(sidRaw), nombre: nombre || '' }));
  } catch (_) {}
}

function sucursalDropdownEstaFijada() {
  return document.body.classList.contains('uc-sucursal-fijada');
}

function bloquearDropdownSucursalVendedor() {
  const $wrap = document.querySelector('.dropdown-sucursales');
  const $btn = document.getElementById('dropdown-sucursales-btn');
  const $menu = document.getElementById('dropdown-sucursales-menu');
  document.body.classList.add('uc-sucursal-fijada');
  if ($wrap) $wrap.classList.add('uc-sucursal-fijada');
  if ($btn) {
    $btn.disabled = true;
    $btn.setAttribute('aria-disabled', 'true');
    $btn.setAttribute('aria-haspopup', 'false');
    $btn.title = 'Sucursal asignada a tu cuenta';
  }
  $menu?.classList.remove('abierto');
}

async function fijarSucursalVendedor() {
  bloquearDropdownSucursalVendedor();
  const { sid, nombre: nombreSuc } = await resolverSucursalAsignadaVendedor();
  const $label = document.getElementById('dropdown-sucursales-label');
  if (sid == null) {
    if ($label) {
      $label.textContent = 'Sin sucursal asignada';
      delete $label.dataset.sucursalId;
      delete $label.dataset.sucursalSeleccionada;
    }
    try { localStorage.removeItem(SUCURSAL_KEY); } catch (_) {}
    actualizarEstadoBtnAgregarProducto();
    return;
  }
  let nombre = nombreSuc || window.ucUsuarioSesion?.sucursal_nombre || '';
  if (!nombre) {
    try {
      const r = await fetch(`${API}/sucursales`, { headers: authHeaders(false) });
      if (r.ok) {
        const sucursales = await r.json();
        const found = Array.isArray(sucursales)
          ? sucursales.find((s) => Number(s.id) === sid)
          : null;
        if (found) nombre = found.nombre || '';
      }
    } catch (_) {}
  }
  aplicarSeleccionSucursal(String(sid), nombre || 'Mi sucursal');
}

function leerSucursalIdDropdownNormalizado() {
  const $label = document.getElementById('dropdown-sucursales-label');
  if ($label?.dataset?.sucursalSeleccionada !== '1') return null;
  const raw = String($label.dataset.sucursalId ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'all' || lower === 'todas') return 'all';
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : null;
}

function vaciarCarritoSiCambioSucursal(sidAnterior, sidNuevo) {
  if (sidAnterior != null && sidNuevo != null && sidAnterior !== sidNuevo) {
    window.ucVaciarCarritoPorCambioSucursal?.();
  }
}

/** Aplica la sucursal en el dropdown, persiste y recarga inventario si aplica. */
function aplicarSeleccionSucursal(sidRaw, nombre, opts = {}) {
  const { cerrarMenu = false, cerrarModal = false } = opts;
  const $label = document.getElementById('dropdown-sucursales-label');
  const $menu = document.getElementById('dropdown-sucursales-menu');
  if (!$label) return false;

  const sidAnterior = leerSucursalIdDropdownNormalizado();

  if (sucursalDropdownEstaFijada()) {
    const sidFijo = parseSucursalIdUsuario(window.ucUsuarioSesion);
    if (sidFijo == null) return false;
    if (sidRaw === 'all' || Number(sidRaw) !== sidFijo) return false;
    sidRaw = String(sidFijo);
    nombre = nombre || window.ucUsuarioSesion?.sucursal_nombre || $label.textContent;
  }

  if (sidRaw === 'all') {
    $label.textContent = nombre || 'Todas las sucursales';
    $label.dataset.sucursalSeleccionada = '1';
    $label.dataset.sucursalId = 'all';
    guardarSucursalSeleccionada('all', $label.textContent);
  } else {
    const sidNum = sidRaw !== '' && sidRaw != null ? Number(sidRaw) : NaN;
    if (!Number.isFinite(sidNum)) {
      $label.textContent = 'Sucursales';
      delete $label.dataset.sucursalId;
      delete $label.dataset.sucursalSeleccionada;
      guardarSucursalSeleccionada(null);
      actualizarEstadoBtnAgregarProducto();
      window.ucCargarInventarioProductos?.();
      return false;
    }
    $label.textContent = nombre || $label.textContent;
    $label.dataset.sucursalSeleccionada = '1';
    $label.dataset.sucursalId = String(sidNum);
    guardarSucursalSeleccionada(String(sidNum), $label.textContent);
  }

  const sidNuevo = sidRaw === 'all' ? 'all' : String(Number(sidRaw));
  vaciarCarritoSiCambioSucursal(sidAnterior, sidNuevo);

  if (cerrarMenu) $menu?.classList.remove('abierto');
  actualizarEstadoBtnAgregarProducto();
  if (cerrarModal && sidRaw === 'all') window.ucCerrarModalProducto?.();
  window.ucCargarInventarioProductos?.();
  const enModuloVentas = document.querySelector('.categoria-btn[data-categoria="ventas"]')?.classList.contains('activo');
  if (enModuloVentas) {
    if (document.getElementById('tab-reportes-modulo')?.classList.contains('activo')) {
      window.ucRecargarResumenInventarioReportes?.();
      window.ucRecargarReporteActivo?.();
    } else {
      window.ucRecargarVentasModulo?.();
    }
  }
  if (document.querySelector('.categoria-btn[data-categoria="todos"]')?.classList.contains('activo')) {
    window.ucCargarHomeDashboards?.();
  }
  return true;
}

async function restaurarSucursalGuardada() {
  let saved;
  try {
    const raw = localStorage.getItem(SUCURSAL_KEY);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch {
    localStorage.removeItem(SUCURSAL_KEY);
    return;
  }
  if (!saved?.id) return;

  const sid = String(saved.id).trim();
  if (sid.toLowerCase() === 'all' || sid.toLowerCase() === 'todas') {
    aplicarSeleccionSucursal('all', saved.nombre || 'Todas las sucursales');
    return;
  }

  const sidNum = Number(sid);
  if (!Number.isFinite(sidNum)) {
    localStorage.removeItem(SUCURSAL_KEY);
    return;
  }

  try {
    const r = await fetch(`${API}/sucursales`, { headers: authHeaders(false) });
    if (!r.ok) return;
    const sucursales = await r.json();
    const found = Array.isArray(sucursales) ? sucursales.find((s) => Number(s.id) === sidNum) : null;
    if (found && esSucursalActiva(found)) {
      aplicarSeleccionSucursal(String(sidNum), found.nombre || saved.nombre);
    } else {
      localStorage.removeItem(SUCURSAL_KEY);
      aplicarSeleccionSucursal('all', 'Todas las sucursales');
    }
  } catch (_) {}
}

/** Lee la sucursal elegida en el dropdown (normaliza espacios y modo «todas» / «todas las sucursales»). */
function leerDatasetSucursalInventario() {
  const $label = document.getElementById('dropdown-sucursales-label');
  const raw = String($label?.dataset?.sucursalId ?? '').trim();
  const lower = raw.toLowerCase();
  const esTodasLasSucursales = lower === 'all' || lower === 'todas';
  return { $label, raw, esTodasLasSucursales };
}

function anexarSucursalIdParamsReporte(params) {
  const target = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const { raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
  if (!raw || esTodasLasSucursales) return target;
  const sid = Number(raw);
  if (Number.isFinite(sid) && sid > 0) target.set('sucursal_id', String(sid));
  return target;
}

/** Habilita botones de agregar según sucursal y chip activo. */
function actualizarEstadoBtnAgregarProducto() {
  const $btn = document.getElementById('btn-agregar-producto');
  const $btnCons = document.getElementById('btn-agregar-consignado');
  const esCons = inventarioEsVistaConsignados();
  const { $label, raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
  const sel = $label?.dataset?.sucursalSeleccionada === '1';
  const sidNum = raw && !esTodasLasSucursales ? Number(raw) : NaN;
  const ok = sel && !esTodasLasSucursales && Number.isFinite(sidNum);

  if ($btn) {
    $btn.hidden = esCons || esTodasLasSucursales;
    if (!esCons && !esTodasLasSucursales) {
      $btn.disabled = !ok;
      if (ok) {
        $btn.title = '';
      } else if (esTodasLasSucursales) {
        $btn.title = '«Todas las sucursales» solo muestra el inventario; elige una sucursal para agregar productos';
      } else {
        $btn.title = 'Selecciona una sucursal en la barra superior para agregar productos';
      }
    }
  }

  if ($btnCons) {
    $btnCons.hidden = !esCons || esTodasLasSucursales;
    if (!esTodasLasSucursales) {
      $btnCons.disabled = !ok;
    }
    if (ok) {
      $btnCons.title = '';
    } else if (esTodasLasSucursales) {
      $btnCons.title = 'Elige una sucursal concreta para agregar productos consignados';
    } else {
      $btnCons.title = 'Selecciona una sucursal en la barra superior para agregar productos consignados';
    }
  }

  actualizarVistaInventarioConsignados();
  actualizarEstadoBtnRestockRapido();
}

function actualizarEstadoBtnRestockRapido() {
  const $btnRestock = document.getElementById('btn-inventario-restock');
  if (!$btnRestock) return;
  const esCons = inventarioEsVistaConsignados();
  const { raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
  const sel = document.getElementById('dropdown-sucursales-label')?.dataset?.sucursalSeleccionada === '1';
  const sidNum = raw && !esTodasLasSucursales ? Number(raw) : NaN;
  const ok = sel && !esTodasLasSucursales && Number.isFinite(sidNum) && !esCons;
  $btnRestock.hidden = esCons || esTodasLasSucursales;
  $btnRestock.disabled = !ok;
  if (ok) {
    $btnRestock.title = window.ucModoRestockRapido?.() ? 'Salir de restock rápido' : 'Restock rápido';
  } else if (esCons) {
    $btnRestock.title = 'Restock no aplica a productos consignados';
    window.ucDesactivarModoRestockRapido?.();
  } else if (esTodasLasSucursales) {
    $btnRestock.title = 'Elige una sucursal concreta para restock rápido';
    window.ucDesactivarModoRestockRapido?.();
  } else {
    $btnRestock.title = 'Selecciona una sucursal en la barra superior';
    window.ucDesactivarModoRestockRapido?.();
  }
}

function actualizarVistaInventarioConsignados() {
  const $btnTabla = document.getElementById('btn-inventario-vista-tabla');
  const $grid = document.getElementById('inventario-productos');
  const esCons = inventarioEsVistaConsignados();
  if ($btnTabla) $btnTabla.hidden = esCons;
  if ($grid) $grid.classList.toggle('inventario-grid--consignados', esCons);
  if (esCons && inventarioVistaModo === 'tabla') {
    inventarioVistaModo = 'cards';
    const $btnVistaTabla = document.getElementById('btn-inventario-vista-tabla');
    $btnVistaTabla?.classList.remove('activo');
    $btnVistaTabla?.setAttribute('aria-pressed', 'false');
    $btnVistaTabla?.setAttribute('title', 'Ver como tabla');
    $btnVistaTabla?.setAttribute('aria-label', 'Ver como tabla');
  }
}

const MODULOS_SIN_CARRITO = new Set(['ventas', 'clientes', 'usuarios']);

function moduloPermiteCarritoUI() {
  const activo = document.querySelector('.categoria-btn.activo:not(.dropdown-sucursales-trigger)');
  const cat = activo?.dataset?.categoria;
  return cat === 'todos' || cat === 'inventario';
}

function cerrarNavMenu() {
  document.body.classList.remove('nav-abierta');
  const $btn = document.getElementById('btn-nav-menu');
  if ($btn) {
    $btn.setAttribute('aria-expanded', 'false');
    $btn.setAttribute('aria-label', 'Abrir menú');
  }
}

function initNavMenu() {
  if (initNavMenu._done) return;
  initNavMenu._done = true;
  const $btn = document.getElementById('btn-nav-menu');
  $btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const abierto = document.body.classList.toggle('nav-abierta');
    $btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    $btn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  });
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('nav-abierta')) return;
    if (e.target.closest('header')) return;
    cerrarNavMenu();
  });
  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 1101px)').matches) cerrarNavMenu();
  });
}

function initNav() {
  const $vistaPos = document.getElementById('vista-pos');
  const $vistaModulo = document.getElementById('vista-modulo');
  const $vistaModuloVentas = document.getElementById('vista-modulo-ventas');
  const $vistaModuloClientes = document.getElementById('vista-modulo-clientes');
  const $productos = document.getElementById('productos');
  const $contenidoInv = document.getElementById('contenido-inventario');

  function irAModulo(btn) {
    const cat = btn.dataset.categoria;
    if (!esUsuarioAdmin() && !MODULOS_NAV_VENDEDOR.has(cat)) {
      const $inv = document.querySelector('.categoria-btn[data-categoria="inventario"]');
      if ($inv) return irAModulo($inv);
      return;
    }
    if (cat === 'todos') document.documentElement.classList.remove('uc-restore-modulo');
    document.querySelectorAll('.categoria-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    cerrarNavMenu();
    document.body.classList.toggle('modulo-ventas', cat === 'ventas');
    document.body.classList.toggle('sin-carrito-ui', MODULOS_SIN_CARRITO.has(cat));
    if (MODULOS_SIN_CARRITO.has(cat)) window.ucMinimizarCarritoSiAbierto?.();
    $vistaModulo.style.display = 'none';
    $vistaModuloVentas.style.display = 'none';
    $vistaModuloClientes.style.display = 'none';
    $vistaPos.style.display = 'none';
    if (cat === 'usuarios') {
      if (!esUsuarioAdmin()) {
        const $home = document.querySelector('.categoria-btn[data-categoria="todos"]');
        if ($home) return irAModulo($home);
        return;
      }
      $vistaModulo.style.display = 'flex';
      cargarUsuarios();
      cargarSucursales();
    } else if (cat === 'clientes') {
      $vistaModuloClientes.style.display = 'flex';
      cargarClientes();
      cargarProveedores();
    } else if (cat === 'inventario') {
      $vistaPos.style.display = 'grid';
      if ($productos) $productos.style.display = 'none';
      if ($contenidoInv) $contenidoInv.style.display = 'flex';
      document.querySelectorAll('.inventario-chip[data-cat]').forEach(c => c.classList.remove('activo'));
      const $chipTodos = document.querySelector('.inventario-chip[data-cat="todos"]');
      if ($chipTodos) $chipTodos.classList.add('activo');
      resetInventarioNavegacionMica();
      categoriaInventarioActiva = 'todos';
      renderInventarioChipsNavegacion();
      try { initInventarioVista(); } catch (err) { console.error('initInventarioVista:', err); }
      if (window.actualizarCarritoVacioParaVista) window.actualizarCarritoVacioParaVista();
      window.actualizarBtnMostrarCarrito?.();
    } else if (cat === 'ventas') {
      $vistaModuloVentas.style.display = 'flex';
      const sub = esUsuarioAdmin()
        ? (localStorage.getItem(VENTAS_SUBMODULO_KEY) || 'ventas')
        : 'ventas';
      window.ucVentasIrASubvista?.(sub === 'reportes' ? 'reportes' : 'ventas');
      window.actualizarBtnMostrarCarrito?.();
      window.ucDesactivarModoRestockRapido?.();
    } else {
      $vistaPos.style.display = 'grid';
      if ($productos) $productos.style.display = 'flex';
      if ($contenidoInv) $contenidoInv.style.display = 'none';
      if (cat === 'todos') window.ucCargarHomeDashboards?.();
      if (window.actualizarCarritoVacioParaVista) window.actualizarCarritoVacioParaVista();
      window.actualizarBtnMostrarCarrito?.();
      window.ucDesactivarModoRestockRapido?.();
    }
  }

  document.querySelectorAll('.categoria-btn:not(.dropdown-sucursales-trigger)').forEach(btn => {
    btn.addEventListener('click', () => {
      try { localStorage.setItem(MODULO_KEY, btn.dataset.categoria); } catch (_) {}
      irAModulo(btn);
    });
  });

  const $home = document.querySelector('.categoria-btn[data-categoria="todos"]');
  const $inventario = document.querySelector('.categoria-btn[data-categoria="inventario"]');
  const saved = localStorage.getItem(MODULO_KEY);
  if (!esUsuarioAdmin()) {
    const mod = MODULOS_NAV_VENDEDOR.has(saved) ? saved : 'inventario';
    const $btn = document.querySelector(`.categoria-btn[data-categoria="${mod}"]`);
    if ($btn) irAModulo($btn);
    else if ($inventario) irAModulo($inventario);
    return;
  }
  if (saved && saved !== 'todos') {
    const mod = saved === 'reportes' ? 'ventas' : saved;
    const $btn = document.querySelector(`.categoria-btn[data-categoria="${mod}"]`);
    if ($btn) irAModulo($btn);
    else if ($home) irAModulo($home);
  } else if ($home) {
    try { localStorage.removeItem(MODULO_KEY); } catch (_) {}
    irAModulo($home);
  }
}

function initDropdownSucursales() {
  const $btn = document.getElementById('dropdown-sucursales-btn');
  const $label = document.getElementById('dropdown-sucursales-label');
  const $menu = document.getElementById('dropdown-sucursales-menu');
  const $list = document.getElementById('dropdown-sucursales-list');
  const $loading = document.getElementById('dropdown-sucursales-loading');

  $btn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (sucursalDropdownEstaFijada()) return;
    $menu.classList.toggle('abierto');
    if ($menu.classList.contains('abierto')) {
      $menu.scrollTop = 0;
      $loading.style.display = 'block';
      $list.innerHTML = '';
      try {
        const r = await fetch(`${API}/sucursales`, { headers: authHeaders(false) });
        const sucursales = filtrarSucursalesActivas(await r.json());
        $loading.style.display = 'none';
        if (sucursales.length === 0) {
          $list.innerHTML = '<div class="dropdown-sucursales-vacio">No hay sucursales</div>';
        } else {
          const todasDiv = '<div class="dropdown-sucursales-item dropdown-sucursales-item-todas" role="menuitem" data-sucursal-id="all" title="Ver productos de todas las sucursales">Todas las sucursales</div>';
          $list.innerHTML =
            todasDiv
            + sucursales.map((s) => {
              const esc = (s.nombre || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
              const idNum = Number(s.id);
              return `<div class="dropdown-sucursales-item" role="menuitem" data-sucursal-id="${Number.isFinite(idNum) ? idNum : ''}">${esc}</div>`;
            }).join('');
          $list.querySelectorAll('.dropdown-sucursales-item').forEach((item) => {
            item.addEventListener('click', () => {
              const sidRaw = item.getAttribute('data-sucursal-id');
              const nombre = item.textContent.trim();
              if (sidRaw === 'all') {
                aplicarSeleccionSucursal('all', nombre, { cerrarMenu: true, cerrarModal: true });
                return;
              }
              const sidNum = sidRaw !== '' && sidRaw != null ? Number(sidRaw) : NaN;
              if (!Number.isFinite(sidNum)) {
                aplicarSeleccionSucursal(null, null);
                return;
              }
              aplicarSeleccionSucursal(String(sidNum), nombre, { cerrarMenu: true });
            });
          });
        }
      } catch {
        $loading.style.display = 'none';
        $list.innerHTML = '<div class="dropdown-sucursales-vacio">Error al cargar</div>';
      }
    }
  });

  document.addEventListener('click', () => $menu?.classList.remove('abierto'));
  $menu?.addEventListener('click', (e) => e.stopPropagation());
  actualizarEstadoBtnAgregarProducto();
}

// ===================== INVENTARIO =====================

const CATEGORIAS_INVENTARIO = ['todos', 'micas', 'fundas', 'cargadores', 'powerbanks', 'audifonos', 'bocinas', 'accesorios', 'otros'];
const INVENTARIO_MICA_TIPOS = [
  { id: 'cristal', label: 'Cristal' },
  { id: 'hidrogel', label: 'Hidrogel' },
];
const INVENTARIO_MICA_SUBTIPOS = {
  cristal: ['9H', '9D', 'privacidad', 'curva'],
  hidrogel: ['HD', 'mate', 'privacidad'],
};
const INVENTARIO_CATEGORIAS_DRILL = new Set(['micas', 'fundas']);
const MARCAS_CEL_DISPLAY = ['Apple', 'Samsung', 'Xiaomi', 'Motorola', 'Huawei', 'Google', 'OnePlus', 'OPPO', 'Realme', 'Honor'];
const SAMSUNG_SERIES = {
  'Galaxy S': [
    'Galaxy S21', 'Galaxy S21+', 'Galaxy S21 Ultra', 'Galaxy S21 FE',
    'Galaxy S22', 'Galaxy S22+', 'Galaxy S22 Ultra',
    'Galaxy S23', 'Galaxy S23+', 'Galaxy S23 Ultra', 'Galaxy S23 FE',
    'Galaxy S24', 'Galaxy S24+', 'Galaxy S24 Ultra', 'Galaxy S24 FE',
    'Galaxy S25', 'Galaxy S25+', 'Galaxy S25 Ultra',
    'Galaxy S26', 'Galaxy S26+', 'Galaxy S26 Ultra',
  ],
  'Galaxy A': [
    'Galaxy A12', 'Galaxy A13', 'Galaxy A14', 'Galaxy A15', 'Galaxy A16',
    'Galaxy A20', 'Galaxy A21', 'Galaxy A22', 'Galaxy A23', 'Galaxy A24', 'Galaxy A25', 'Galaxy A26',
    'Galaxy A30', 'Galaxy A31', 'Galaxy A32', 'Galaxy A33', 'Galaxy A34', 'Galaxy A35', 'Galaxy A36',
    'Galaxy A50', 'Galaxy A51', 'Galaxy A52', 'Galaxy A53', 'Galaxy A54', 'Galaxy A55', 'Galaxy A56',
  ],
  'Galaxy Z': [
    'Galaxy Z Flip 3', 'Galaxy Z Flip 4', 'Galaxy Z Flip 5', 'Galaxy Z Flip 6',
    'Galaxy Z Fold 3', 'Galaxy Z Fold 4', 'Galaxy Z Fold 5', 'Galaxy Z Fold 6',
  ],
  'Galaxy Note': [
    'Galaxy Note 10', 'Galaxy Note 10+', 'Galaxy Note 20', 'Galaxy Note 20 Ultra',
  ],
};
const MARCAS_MODELOS = {
  Apple: [
    'iPhone 12 mini', 'iPhone 12', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
    'iPhone 13 mini', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
    'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
    'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
    'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
    'iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
    'iPhone SE',
  ],
  Samsung: Object.values(SAMSUNG_SERIES).flat(),
  Xiaomi: ['Redmi Note 13', 'Redmi 12', 'POCO X6', 'Mi 14'],
  Motorola: ['Edge 40', 'Edge 30', 'Moto G84', 'Razr'],
  Huawei: ['P60', 'P50', 'Mate 60', 'Nova 12'],
  Google: ['Pixel 8', 'Pixel 7', 'Pixel 6a'],
  OnePlus: ['OnePlus 12', 'OnePlus 11', 'Nord 3'],
  OPPO: ['Find X6', 'Reno 10', 'A78'],
  Realme: ['Realme 11', 'Realme 10', 'Realme C55'],
  Honor: ['Honor 90', 'Honor Magic 5', 'Honor X9b'],
};

function extraerMarcaModeloCel(texto) {
  const s = (texto || '').trim();
  if (!s) return null;

  const marcasOrden = Object.keys(MARCAS_MODELOS).sort((a, b) => b.length - a.length);
  for (const marca of marcasOrden) {
    const prefijo = `${marca} `;
    if (s.toLowerCase().startsWith(prefijo.toLowerCase())) {
      return { marca, modelo: s.slice(prefijo.length).trim(), resto: '' };
    }
  }

  let mejor = null;
  for (const marca of Object.keys(MARCAS_MODELOS)) {
    for (const modelo of MARCAS_MODELOS[marca]) {
      const suf = `${marca} ${modelo}`;
      if (s === suf || s.endsWith(` ${suf}`)) {
        if (!mejor || suf.length > `${mejor.marca} ${mejor.modelo}`.length) {
          mejor = { marca, modelo, resto: s.slice(0, s.length - suf.length).trim() };
        }
      }
    }
  }
  if (mejor) return mejor;

  for (const marca of marcasOrden) {
    const marcaEsc = marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s+${marcaEsc}\\s+(.+)$`, 'i');
    const m = s.match(re);
    if (m) return { marca, modelo: m[1].trim(), resto: s.slice(0, m.index).trim() };
    if (s.toLowerCase() === marca.toLowerCase()) return { marca, modelo: '', resto: '' };
  }
  return null;
}

function inferirMarcaDesdeModelo(texto) {
  const s = (texto || '').trim();
  if (!s) return null;

  for (const marca of Object.keys(MARCAS_MODELOS).sort((a, b) => b.length - a.length)) {
    const prefijo = `${marca} `;
    if (s.toLowerCase().startsWith(prefijo.toLowerCase())) {
      const modelo = s.slice(prefijo.length).trim();
      return inferirMarcaDesdeModelo(modelo) || { marca, modelo };
    }
  }

  let mejor = null;
  for (const marca of Object.keys(MARCAS_MODELOS)) {
    for (const modelo of MARCAS_MODELOS[marca]) {
      if (s === modelo && (!mejor || modelo.length > mejor.modelo.length)) {
        mejor = { marca, modelo };
      }
    }
  }
  if (mejor) return mejor;
  if (/^iPhone\b/i.test(s)) return { marca: 'Apple', modelo: s };
  if (/^Galaxy\b/i.test(s)) return { marca: 'Samsung', modelo: s };
  return null;
}

const UC_ICONO_EDITAR = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
let productosInventario = [];
let productosConsignadosInventario = [];
/** Último error al cargar inventario (solo para mensaje en pantalla). */
let ultimoErrorCargaInventario = '';
let categoriaInventarioActiva = 'todos';
let inventarioNavegacionDrill = { drill: false, categoria: null, paso1: null, paso2: null };
let paginaInventarioActual = 1;
let inventarioFiltrosBusqueda = {
  stock: 'todos',
  precioMin: '',
  precioMax: '',
  imagen: 'todos',
  orden: '',
};
let inventarioFiltroClave = '';
let customSelectFiltroOrden = null;
let inventarioFavoritos = new Set();

async function cargarInventarioFavoritosDesdeApi() {
  inventarioFavoritos = new Set();
  try {
    const r = await fetch(`${API}/inventario-favoritos`, { headers: authHeaders(false) });
    if (!r.ok) return;
    const data = await r.json();
    inventarioFavoritos = new Set(Array.isArray(data.favoritos) ? data.favoritos : []);
  } catch (err) {
    console.error('inventario favoritos:', err);
    inventarioFavoritos = new Set();
  }
}

function claveFavoritoInventario(p) {
  const esConsignado = Boolean(p?.es_consignado);
  return `${esConsignado ? 'c' : 'p'}-${p?.id}`;
}

function esInventarioFavorito(p) {
  if (!p?.id) return false;
  return inventarioFavoritos.has(claveFavoritoInventario(p));
}

async function toggleInventarioFavorito(p) {
  const r = await fetch(`${API}/inventario-favoritos/toggle`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      producto_id: p.id,
      es_consignado: Boolean(p.es_consignado),
    }),
  });
  if (!r.ok) {
    let msg = 'No se pudo actualizar favorito';
    try {
      const err = await r.json();
      if (err?.error) msg = String(err.error);
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await r.json();
  inventarioFavoritos = new Set(Array.isArray(data.favoritos) ? data.favoritos : []);
  return Boolean(data.favorito);
}

function htmlBotonFavoritoInventario(p) {
  const activo = esInventarioFavorito(p);
  return `<button type="button" class="inventario-producto-favorito${activo ? ' activo' : ''}" data-favorito-clave="${claveFavoritoInventario(p)}" title="${activo ? 'Quitar de favoritos' : 'Agregar a favoritos'}" aria-label="${activo ? 'Quitar de favoritos' : 'Agregar a favoritos'}" aria-pressed="${activo ? 'true' : 'false'}"><i class="fa-${activo ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i></button>`;
}

function actualizarBotonFavoritoInventario($btn, activo) {
  if (!$btn) return;
  $btn.classList.toggle('activo', activo);
  $btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
  $btn.setAttribute('aria-label', activo ? 'Quitar de favoritos' : 'Agregar a favoritos');
  $btn.title = activo ? 'Quitar de favoritos' : 'Agregar a favoritos';
  const $icon = $btn.querySelector('i');
  if ($icon) $icon.className = `fa-${activo ? 'solid' : 'regular'} fa-heart`;
}

let inventarioVistaModo = 'cards';
const INVENTARIO_FILAS_POR_PAGINA = 4;
const INVENTARIO_FILAS_TABLA_POR_PAGINA = 10;
const INVENTARIO_COL_MIN_PX = 160;
const INVENTARIO_COL_MIN_PX_EXPANDIDO = 220;

function inventarioColMinPx() {
  const oculto = document.getElementById('vista-pos')?.classList.contains('carrito-oculto');
  return oculto ? INVENTARIO_COL_MIN_PX_EXPANDIDO : INVENTARIO_COL_MIN_PX;
}

function getInventarioItemsPorPagina() {
  if (inventarioVistaModo === 'tabla') return INVENTARIO_FILAS_TABLA_POR_PAGINA;
  const $grid = document.getElementById('inventario-productos');
  const cols = calcularColumnasInventarioGrid($grid);
  return cols * INVENTARIO_FILAS_POR_PAGINA;
}

function getInventarioTotalPaginas(cantidad) {
  return Math.max(1, Math.ceil(cantidad / getInventarioItemsPorPagina()));
}

function calcularColumnasInventarioGrid($grid) {
  if (!$grid) return 1;
  const style = getComputedStyle($grid);
  const gap = parseFloat(style.columnGap) || 16;
  const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const w = $grid.clientWidth - pad;
  if (w <= 0) return 1;
  return Math.max(1, Math.floor((w + gap) / (inventarioColMinPx() + gap)));
}

function inventarioEsVistaConsignados() {
  return categoriaInventarioActiva === 'consignados';
}

function getFuenteInventarioActiva() {
  return inventarioEsVistaConsignados() ? productosConsignadosInventario : productosInventario;
}

function normalizarConsignadoInventario(row) {
  return {
    ...row,
    precio: Number(row.precio_venta) || 0,
    es_consignado: true,
  };
}

function claveFiltroInventario() {
  const { raw } = leerDatasetSucursalInventario();
  const q = document.getElementById('inventario-buscador')?.value || '';
  const f = inventarioFiltrosBusqueda;
  const d = inventarioNavegacionDrill;
  return `${raw}|${categoriaInventarioActiva}|${d.drill}|${d.categoria}|${d.paso1}|${d.paso2}|${q}|${f.stock}|${f.precioMin}|${f.precioMax}|${f.imagen}|${f.orden}`;
}

function resetInventarioNavegacionDrill() {
  inventarioNavegacionDrill.drill = false;
  inventarioNavegacionDrill.categoria = null;
  inventarioNavegacionDrill.paso1 = null;
  inventarioNavegacionDrill.paso2 = null;
}

function resetInventarioNavegacionMica() {
  resetInventarioNavegacionDrill();
}

function inventarioEnNavegacionDrill() {
  return inventarioNavegacionDrill.drill
    && INVENTARIO_CATEGORIAS_DRILL.has(inventarioNavegacionDrill.categoria)
    && inventarioNavegacionDrill.categoria === categoriaInventarioActiva;
}

function asegurarEstadoDrillInventario() {
  if (INVENTARIO_CATEGORIAS_DRILL.has(categoriaInventarioActiva)) {
    inventarioNavegacionDrill.drill = true;
    inventarioNavegacionDrill.categoria = categoriaInventarioActiva;
  } else if (inventarioNavegacionDrill.drill) {
    resetInventarioNavegacionDrill();
  }
}

function setVisibilidadChipInventario(chip, visible) {
  chip.classList.toggle('inventario-chip--oculto', !visible);
  if (visible) chip.removeAttribute('hidden');
  else chip.setAttribute('hidden', '');
}

function normalizarValorDrillInventario(valor) {
  return String(valor || '').trim().toLowerCase();
}

function normalizarSubtipoMicaInventario(valor) {
  return normalizarValorDrillInventario(valor);
}

function etiquetaSubtipoMicaInventario(valor) {
  const key = normalizarSubtipoMicaInventario(valor);
  if (key === '9h') return '9H';
  if (key === '9d') return '9D';
  if (key === 'hd') return 'HD';
  if (key === 'mate') return 'Mate';
  if (key === 'privacidad') return 'Privacidad';
  if (key === 'curva') return 'Curva';
  return valor;
}

function extraerInfoMicaInventario(nombre) {
  const n = String(nombre || '');
  if (/^Mica\s+cristal\s+/i.test(n)) {
    let rest = n.replace(/^Mica\s+cristal\s+/i, '').trim();
    const dash = rest.indexOf(' — ');
    const tipoPart = dash >= 0 ? rest.slice(0, dash).trim() : rest.split(/\s+/)[0];
    return { tipo: 'cristal', subtipo: normalizarSubtipoMicaInventario(tipoPart) };
  }
  if (/^Mica\s+hidrogel\s+/i.test(n)) {
    const tipoPart = n.replace(/^Mica\s+hidrogel\s+/i, '').trim();
    return { tipo: 'hidrogel', subtipo: normalizarSubtipoMicaInventario(tipoPart) };
  }
  return null;
}

function extraerInfoFundaInventario(nombre) {
  let s = String(nombre || '').replace(/^Funda\s+/i, '').trim();
  s = s.replace(/\s+—\s+Rango\s+[\d-]+\s*$/i, '').trim();
  const dashIdx = s.indexOf(' — ');
  if (dashIdx >= 0) s = s.slice(0, dashIdx).trim();
  if (!s) return null;
  const mm = extraerMarcaModeloCel(s) || inferirMarcaDesdeModelo(s);
  if (!mm?.marca) return null;
  return { marca: mm.marca, modelo: mm.modelo || '' };
}

function opcionesPaso1DrillInventario(categoria) {
  if (categoria === 'micas') {
    return INVENTARIO_MICA_TIPOS.map((item) => ({ id: item.id, label: item.label }));
  }
  if (categoria === 'fundas') {
    return MARCAS_CEL_DISPLAY.map((marca) => ({ id: marca, label: marca }));
  }
  return [];
}

function opcionesPaso2DrillInventario(categoria, paso1) {
  if (categoria === 'micas') {
    return (INVENTARIO_MICA_SUBTIPOS[paso1] || []).map((opt) => ({
      id: opt,
      label: etiquetaSubtipoMicaInventario(opt),
    }));
  }
  if (categoria === 'fundas') {
    return (MARCAS_MODELOS[paso1] || []).map((modelo) => ({ id: modelo, label: modelo }));
  }
  return [];
}

function etiquetaPaso1DrillInventario(categoria, paso1) {
  if (categoria === 'micas') {
    return INVENTARIO_MICA_TIPOS.find((item) => item.id === paso1)?.label || paso1;
  }
  return paso1;
}

function etiquetaPaso2DrillInventario(categoria, paso1, paso2) {
  if (categoria === 'micas') return etiquetaSubtipoMicaInventario(paso2);
  return paso2;
}

function productoCoincideFiltroDrillInventario(p) {
  if (!inventarioEnNavegacionDrill()) return true;
  const { categoria, paso1, paso2 } = inventarioNavegacionDrill;
  if (categoriaInventarioActiva !== categoria) return true;
  if (!paso1 && !paso2) return true;

  if (categoria === 'micas') {
    const info = extraerInfoMicaInventario(p.nombre);
    if (!info) return false;
    if (paso1 && info.tipo !== paso1) return false;
    if (paso2 && info.subtipo !== normalizarSubtipoMicaInventario(paso2)) return false;
    return true;
  }
  if (categoria === 'fundas') {
    const info = extraerInfoFundaInventario(p.nombre);
    if (!info) return false;
    if (paso1 && info.marca !== paso1) return false;
    return true;
  }
  return true;
}

function productoCoincideFiltroMicaInventario(p) {
  return productoCoincideFiltroDrillInventario(p);
}

function limpiarChipsRutaDrillInventario() {
  document.querySelectorAll('#inventario-chips-principal .inventario-chip[data-drill-ruta]').forEach((el) => el.remove());
}

function htmlChipRutaDrillInventario(categoria, paso1, paso2, esActivo = true) {
  const activoClass = esActivo ? ' activo' : '';
  if (paso2) {
    const label = etiquetaPaso2DrillInventario(categoria, paso1, paso2);
    return `<button type="button" class="inventario-chip inventario-chip--ruta${activoClass}" data-drill-ruta="1" data-drill-paso2="${escHtmlInventario(paso2)}" aria-label="${escHtmlInventario(label)}">${escHtmlInventario(label)}</button>`;
  }
  const label = etiquetaPaso1DrillInventario(categoria, paso1);
  return `<button type="button" class="inventario-chip inventario-chip--ruta${activoClass}" data-drill-ruta="1" data-drill-paso1="${escHtmlInventario(paso1)}" aria-label="${escHtmlInventario(label)}">${escHtmlInventario(label)}</button>`;
}

function renderInventarioChipsSub() {
  const $sub = document.getElementById('inventario-chips-sub');
  if (!$sub) return;
  if (!inventarioEnNavegacionDrill()) {
    $sub.hidden = true;
    $sub.innerHTML = '';
    return;
  }
  const { categoria, paso1, paso2 } = inventarioNavegacionDrill;
  let html = '';
  if (!paso1) {
    html = opcionesPaso1DrillInventario(categoria).map((item) =>
      `<button type="button" class="inventario-chip inventario-chip-sub" data-drill-paso1="${escHtmlInventario(item.id)}">${escHtmlInventario(item.label)}</button>`
    ).join('');
  } else if (!paso2 && categoria === 'micas') {
    html = opcionesPaso2DrillInventario(categoria, paso1).map((item) =>
      `<button type="button" class="inventario-chip inventario-chip-sub" data-drill-paso2="${escHtmlInventario(item.id)}">${escHtmlInventario(item.label)}</button>`
    ).join('');
  }
  $sub.innerHTML = html;
  $sub.hidden = !html;
}

function renderInventarioChipsNavegacion() {
  const $principal = document.getElementById('inventario-chips-principal');
  const $linea = document.getElementById('inventario-chips-linea');
  if (!$principal) return;
  asegurarEstadoDrillInventario();
  limpiarChipsRutaDrillInventario();
  const estaticos = $principal.querySelectorAll('.inventario-chip[data-cat]');

  if (!inventarioEnNavegacionDrill()) {
    $linea?.classList.remove('inventario-chips-linea--drill');
    estaticos.forEach((chip) => {
      setVisibilidadChipInventario(chip, true);
      chip.classList.remove('inventario-chip--ruta');
      chip.classList.toggle('activo', chip.dataset.cat === categoriaInventarioActiva);
    });
    renderInventarioChipsSub();
    return;
  }

  $linea?.classList.add('inventario-chips-linea--drill');

  const { categoria, paso1, paso2 } = inventarioNavegacionDrill;
  estaticos.forEach((chip) => {
    const esChipTodos = chip.dataset.cat === 'todos';
    const visible = esChipTodos || chip.dataset.cat === categoria;
    setVisibilidadChipInventario(chip, visible);
    if (chip.dataset.cat === categoria) {
      chip.classList.add('inventario-chip--ruta');
      chip.classList.toggle('activo', !paso1 && !paso2);
    } else if (esChipTodos) {
      chip.classList.remove('inventario-chip--ruta');
      chip.classList.remove('activo');
    } else {
      chip.classList.remove('activo', 'inventario-chip--ruta');
    }
  });

  const $catChip = $principal.querySelector(`.inventario-chip[data-cat="${categoria}"]`);
  if (paso1 && $catChip) {
    const marcaActiva = categoria === 'fundas' ? true : !paso2;
    $catChip.insertAdjacentHTML('afterend', htmlChipRutaDrillInventario(categoria, paso1, null, marcaActiva));
  }
  if (paso2 && categoria === 'micas' && $catChip) {
    const $paso1Chip = $principal.querySelector('.inventario-chip[data-drill-ruta][data-drill-paso1]');
    ($paso1Chip || $catChip).insertAdjacentHTML('afterend', htmlChipRutaDrillInventario(categoria, paso1, paso2, true));
  }

  renderInventarioChipsSub();
}

function manejarClickChipInventario(chip) {
  const cat = chip.dataset.cat;
  const drillPaso1 = chip.dataset.drillPaso1;
  const drillPaso2 = chip.dataset.drillPaso2;

  if (cat) {
    if (INVENTARIO_CATEGORIAS_DRILL.has(cat)) {
      if (inventarioEnNavegacionDrill() && inventarioNavegacionDrill.categoria === cat) {
        if (inventarioNavegacionDrill.paso2) {
          inventarioNavegacionDrill.paso2 = null;
        } else if (inventarioNavegacionDrill.paso1) {
          inventarioNavegacionDrill.paso1 = null;
        } else {
          resetInventarioNavegacionDrill();
          categoriaInventarioActiva = 'todos';
        }
      } else {
        categoriaInventarioActiva = cat;
        inventarioNavegacionDrill.drill = true;
        inventarioNavegacionDrill.categoria = cat;
        inventarioNavegacionDrill.paso1 = null;
        inventarioNavegacionDrill.paso2 = null;
      }
    } else {
      resetInventarioNavegacionDrill();
      categoriaInventarioActiva = cat;
    }
  } else if (drillPaso1) {
    if (INVENTARIO_CATEGORIAS_DRILL.has(categoriaInventarioActiva)) {
      inventarioNavegacionDrill.drill = true;
      inventarioNavegacionDrill.categoria = categoriaInventarioActiva;
    }
    if (inventarioNavegacionDrill.paso2) {
      inventarioNavegacionDrill.paso2 = null;
    } else if (inventarioNavegacionDrill.paso1 === drillPaso1) {
      inventarioNavegacionDrill.paso1 = null;
    } else {
      inventarioNavegacionDrill.paso1 = drillPaso1;
      inventarioNavegacionDrill.paso2 = null;
    }
  } else if (drillPaso2) {
    if (INVENTARIO_CATEGORIAS_DRILL.has(categoriaInventarioActiva)) {
      inventarioNavegacionDrill.drill = true;
      inventarioNavegacionDrill.categoria = categoriaInventarioActiva;
    }
    if (inventarioNavegacionDrill.paso2 === drillPaso2) {
      inventarioNavegacionDrill.paso2 = null;
    } else {
      inventarioNavegacionDrill.paso2 = drillPaso2;
    }
  }

  paginaInventarioActual = 1;
  renderInventarioChipsNavegacion();
  actualizarEstadoBtnAgregarProducto();
  actualizarOpcionOrdenCategoriaFiltro();
  actualizarBtnFiltrosInventario();
  renderInventarioProductos();
}

function inventarioFiltrosSonDefault(f = inventarioFiltrosBusqueda) {
  return f.stock === 'todos'
    && f.precioMin === ''
    && f.precioMax === ''
    && f.imagen === 'todos'
    && f.orden === '';
}

function obtenerOrdenCategoriasInventarioChips() {
  return Array.from(document.querySelectorAll('.inventario-chip[data-cat]'))
    .map((chip) => chip.dataset.cat)
    .filter((cat) => cat && cat !== 'consignados' && cat !== 'todos');
}

function indiceCategoriaInventario(categoria, ordenCategorias) {
  const key = String(categoria || '').toLowerCase();
  const idx = ordenCategorias.indexOf(key);
  return idx === -1 ? ordenCategorias.length : idx;
}

function inventarioChipTodosActivo() {
  return categoriaInventarioActiva === 'todos';
}

function actualizarOpcionOrdenCategoriaFiltro() {
  const $orden = document.getElementById('filtro-orden');
  const $optCat = $orden?.querySelector('option[value="categoria"]');
  if (!$orden || !$optCat) return;
  const visible = inventarioChipTodosActivo();
  $optCat.hidden = !visible;
  $optCat.disabled = !visible;
  if (!visible && inventarioFiltrosBusqueda.orden === 'categoria') {
    inventarioFiltrosBusqueda.orden = '';
    $orden.selectedIndex = 0;
    actualizarBtnFiltrosInventario();
  }
  if (inventarioFiltrosBusqueda.orden === 'favoritos') {
    inventarioFiltrosBusqueda.orden = '';
    if ($orden) $orden.selectedIndex = 0;
    actualizarBtnFiltrosInventario();
  }
  customSelectFiltroOrden?.refresh?.();
}

function inventarioOrdenDefaultActivo() {
  const orden = inventarioFiltrosBusqueda.orden || '';
  return (orden === '' || orden === 'categoria') && orden !== 'mas-vendidos';
}

function puntajeStockInventarioOrden(p) {
  if (Boolean(p?.es_consignado)) return 0;
  if (p?.inventario_agrupado_todas && Array.isArray(p.sucursales_detalle)) {
    return p.sucursales_detalle.some((s) => !s.es_consignado && (Number(s.stock) || 0) > 0) ? 1 : 0;
  }
  return (Number(p?.stock) || 0) > 0 ? 1 : 0;
}

function ordenarProductosInventario(lista) {
  const copia = [...lista];
  const orden = inventarioFiltrosBusqueda.orden || '';
  const usarOrdenDefault = !inventarioEsVistaConsignados()
    && inventarioOrdenDefaultActivo()
    && orden !== 'mas-vendidos';
  const usarOrdenPorCategoria = usarOrdenDefault && inventarioChipTodosActivo();

  copia.sort((a, b) => {
    const diffFav = Number(esInventarioFavorito(b)) - Number(esInventarioFavorito(a));
    if (diffFav !== 0) return diffFav;

    if (usarOrdenDefault) {
      const diffStock = puntajeStockInventarioOrden(b) - puntajeStockInventarioOrden(a);
      if (diffStock !== 0) return diffStock;

      if (usarOrdenPorCategoria) {
        const ordenCategorias = obtenerOrdenCategoriasInventarioChips();
        const diffCat = indiceCategoriaInventario(a.categoria, ordenCategorias)
          - indiceCategoriaInventario(b.categoria, ordenCategorias);
        if (diffCat !== 0) return diffCat;
      }

      return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    }

    return 0;
  });

  return copia;
}

function filtrarProductosInventario() {
  const q = (document.getElementById('inventario-buscador')?.value || '').toLowerCase().trim();
  const cat = categoriaInventarioActiva;
  const fuente = getFuenteInventarioActiva();
  const f = inventarioFiltrosBusqueda;
  const precioMin = f.precioMin !== '' ? Number(f.precioMin) : null;
  const precioMax = f.precioMax !== '' ? Number(f.precioMax) : null;

  const lista = fuente.filter((p) => {
    if (cat === 'consignados') {
      if (q && !(p.nombre || '').toLowerCase().includes(q)) return false;
    } else {
      const matchCat = cat === 'todos' || (String(p.categoria || '').toLowerCase() === cat);
      const matchQ = !q || (p.nombre || '').toLowerCase().includes(q);
      if (!matchCat || !matchQ || !productoCoincideFiltroMicaInventario(p)) return false;
    }

    const pMin = getPrecioMinProducto(p);
    const pMax = getPrecioMaxProducto(p);
    if (precioMin != null && Number.isFinite(precioMin) && pMax < precioMin) return false;
    if (precioMax != null && Number.isFinite(precioMax) && pMin > precioMax) return false;

    if (f.imagen === 'con' && !productoTieneImagenInventario(p)) return false;
    if (f.imagen === 'sin' && productoTieneImagenInventario(p)) return false;

    if (!inventarioEsVistaConsignados() && f.stock !== 'todos') {
      const stock = Number(p.stock) || 0;
      if (f.stock === 'con' && stock <= 0) return false;
      if (f.stock === 'sin' && stock > 0) return false;
    }

    return true;
  });

  return ordenarProductosInventario(lista);
}

function actualizarBtnFiltrosInventario() {
  const $btn = document.getElementById('btn-inventario-filtros');
  if (!$btn) return;
  const activo = !inventarioFiltrosSonDefault();
  $btn.classList.toggle('activo', activo);
  $btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
}

function inventarioFiltrosPorDefecto() {
  return {
    stock: 'todos',
    precioMin: '',
    precioMax: '',
    imagen: 'todos',
    orden: '',
  };
}

const FUNDAS_RANGO_PRECIO_MIN = 50;
const FUNDAS_RANGO_PRECIO_MAX = 650;
const FUNDAS_RANGO_PRECIO_STEP = 50;

function getPrecioMinProducto(p) {
  return Number(p?.precio) || 0;
}

function getPrecioMaxProducto(p) {
  const maxRaw = p?.precio_max ?? p?.precioMax;
  const min = getPrecioMinProducto(p);
  if (maxRaw != null && maxRaw !== '' && Number(maxRaw) > min) return Number(maxRaw);
  return min;
}

function productoFundaTieneRangoPrecio(p) {
  return String(p?.categoria || '').toLowerCase() === 'fundas'
    && getPrecioMaxProducto(p) > getPrecioMinProducto(p);
}

function formatearPrecioRangoSimple(n) {
  return '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function formatearPrecioProductoInventario(p) {
  const fmt = window.formatearPrecioPOS || ((n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }));
  if (productoFundaTieneRangoPrecio(p)) {
    return `${formatearPrecioRangoSimple(getPrecioMinProducto(p))} - ${formatearPrecioRangoSimple(getPrecioMaxProducto(p))}`;
  }
  return fmt(Number(p?.precio));
}

function getCostoCompraProducto(p) {
  const raw = p?.costo_compra ?? p?.costoCompra;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatearCostoCompraInventario(p) {
  const costo = getCostoCompraProducto(p);
  if (costo == null) return '—';
  const fmt = window.formatearPrecioPOS || ((n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }));
  return fmt(costo);
}

function calcularPromedioCostoCompraRestock(stockActual, costoActual, cantidadEntrada, costoEntrada) {
  const stock = Math.max(0, Number(stockActual) || 0);
  const qty = Math.max(0, Math.trunc(Number(cantidadEntrada) || 0));
  const costoN = Number(String(costoEntrada ?? '').replace(',', '.'));
  if (!Number.isFinite(costoN) || costoN <= 0 || qty <= 0) return null;
  if (stock <= 0) return Math.round(costoN * 100) / 100;
  const costoPrev = Number(costoActual);
  if (!Number.isFinite(costoPrev) || costoPrev <= 0) return Math.round(costoN * 100) / 100;
  const promedio = (stock * costoPrev + qty * costoN) / (stock + qty);
  return Math.round(promedio * 100) / 100;
}

function etiquetaBotonAgregarInventarioCarrito() {
  return window.ucModoRestockRapido?.() ? 'Agregar a restock' : 'Agregar al carrito';
}

function iconoBotonAgregarInventarioCarrito() {
  return window.ucModoRestockRapido?.() ? 'fa-dolly' : 'fa-cart-shopping';
}

function inventarioPuedeAgregarAlCarrito(p, esConsignado = false) {
  if (esConsignado) return !window.ucModoRestockRapido?.();
  if (window.ucModoRestockRapido?.()) return true;
  return (Number(p?.stock) || 0) > 0;
}

function tituloBotonAgregarInventarioCarrito(p, esConsignado = false) {
  const base = etiquetaBotonAgregarInventarioCarrito();
  if (!inventarioPuedeAgregarAlCarrito(p, esConsignado)) {
    if (window.ucModoRestockRapido?.()) return base;
    if (esConsignado) return 'No disponible en restock';
    return 'Sin stock para venta';
  }
  return base;
}

function claveAgrupacionProductoInventario(p) {
  const esConsignado = Boolean(p.es_consignado);
  const cat = String(p.categoria || '').trim().toLowerCase();
  const nom = String(p.nombre || '').trim().toLowerCase();
  return `${esConsignado ? 'c' : 'p'}:${cat}:${nom}`;
}

function detalleSucursalDesdeProducto(p) {
  return {
    id: p.id,
    sucursal_id: p.sucursal_id ?? p.id_sucursal,
    sucursal_nombre: p.sucursal_nombre,
    stock: p.stock,
    precio: p.precio,
    precio_max: p.precio_max,
    precio_venta: p.precio_venta,
    costo_consignacion: p.costo_consignacion,
    costo_compra: p.costo_compra,
    categoria: p.categoria,
    imagen: p.imagen,
    tiene_imagen: Boolean(p.tiene_imagen) || productoTieneImagenInventario(p),
    es_consignado: Boolean(p.es_consignado),
  };
}

function claveDetalleSucursalInventario(s) {
  const sid = Number(s.sucursal_id ?? s.id_sucursal);
  if (Number.isFinite(sid) && sid > 0) return `id:${sid}`;
  return `nom:${String(s.sucursal_nombre || '').trim().toLowerCase()}`;
}

function fusionarDetalleSucursalInventario(prev, next) {
  const stockPrev = Number(prev.stock) || 0;
  const stockNext = Number(next.stock) || 0;
  const prevTieneImagen = Boolean(prev.tiene_imagen) || productoTieneImagenInventario(prev);
  const nextTieneImagen = Boolean(next.tiene_imagen) || productoTieneImagenInventario(next);
  const usarNext = nextTieneImagen && !prevTieneImagen;
  const base = usarNext ? { ...prev, ...next } : { ...next, ...prev };
  return {
    ...base,
    stock: stockPrev + stockNext,
    tiene_imagen: prevTieneImagen || nextTieneImagen,
    imagen: (prevTieneImagen ? prev.imagen : null) || (nextTieneImagen ? next.imagen : null) || prev.imagen || next.imagen,
    id: Math.max(Number(prev.id) || 0, Number(next.id) || 0) || prev.id || next.id,
  };
}

function deduplicarDetalleSucursalesInventario(detalle) {
  const porSucursal = new Map();
  for (const s of detalle) {
    const key = claveDetalleSucursalInventario(s);
    const prev = porSucursal.get(key);
    porSucursal.set(key, prev ? fusionarDetalleSucursalInventario(prev, s) : { ...s });
  }
  return Array.from(porSucursal.values());
}

function consolidarProductosInventarioTodasSucursales(lista) {
  const map = new Map();
  for (const p of lista) {
    const key = claveAgrupacionProductoInventario(p);
    if (!map.has(key)) {
      map.set(key, {
        ...p,
        inventario_agrupado_todas: true,
        sucursales_detalle: [],
      });
    }
    map.get(key).sucursales_detalle.push(detalleSucursalDesdeProducto(p));
  }
  return Array.from(map.values()).map((grupo) => {
    grupo.sucursales_detalle = deduplicarDetalleSucursalesInventario(grupo.sucursales_detalle);
    grupo.sucursales_detalle.sort((a, b) =>
      String(a.sucursal_nombre || '').localeCompare(String(b.sucursal_nombre || ''), 'es', { sensitivity: 'base' })
    );
    const rep = grupo.sucursales_detalle.find((s) => productoTieneImagenInventario(s))
      || grupo.sucursales_detalle[0];
    grupo.id = rep.id;
    grupo.imagen = rep.imagen;
    grupo.tiene_imagen = productoTieneImagenInventario(rep);
    grupo.es_consignado = grupo.sucursales_detalle.some((s) => s.es_consignado);
    return grupo;
  });
}

function productoLikeDesdeDetalleSucursal(s, p) {
  return {
    ...p,
    precio: s.precio,
    precio_max: s.precio_max,
    precio_venta: s.precio_venta,
    costo_consignacion: s.costo_consignacion,
    categoria: s.categoria ?? p.categoria,
    es_consignado: s.es_consignado,
  };
}

function sucursalesTienenPreciosVentaDistintos(detalle) {
  if (!detalle || detalle.length <= 1) return false;
  const keys = detalle.map((s) => {
    if (s.es_consignado) return String(Number(s.precio_venta ?? s.precio) || 0);
    return `${getPrecioMinProducto(s)}|${getPrecioMaxProducto(s)}`;
  });
  return new Set(keys).size > 1;
}

function productoSinStockEnTodasSucursales(p) {
  const detalle = p.sucursales_detalle || [];
  if (p.es_consignado) return false;
  return detalle.length > 0 && detalle.every((s) => (Number(s.stock) || 0) <= 0);
}

function htmlDetalleSucursalesInventarioCard(p, formatearPrecio) {
  const detalle = p.sucursales_detalle || [];
  const preciosDistintos = sucursalesTienenPreciosVentaDistintos(detalle);
  const esConsignado = Boolean(p.es_consignado);
  return detalle.map((s) => {
    const stockNum = Number(s.stock) || 0;
    const sinStock = !esConsignado && stockNum <= 0;
    let precioHtml = '';
    if (preciosDistintos) {
      if (esConsignado) {
        const pv = Number(s.precio_venta ?? s.precio) || 0;
        const cc = Number(s.costo_consignacion) || 0;
        precioHtml = `<div class="inventario-producto-precio inventario-producto-precio-sucursal">Venta: ${formatearPrecio(pv)}</div><div class="inventario-consignado-costo inventario-producto-precio-sucursal">Costo: ${formatearPrecio(cc)}</div>`;
      } else {
        precioHtml = `<div class="inventario-producto-precio inventario-producto-precio-sucursal">${formatearPrecioProductoInventario(productoLikeDesdeDetalleSucursal(s, p))}</div>`;
      }
    }
    const stockHtml = esConsignado
      ? ''
      : `<div class="inventario-producto-stock${sinStock ? ' inventario-producto-stock--agotado' : ''}">Stock: ${stockNum}</div>`;
    const sucursalHtml = `<div class="inventario-producto-sucursal">${escHtmlInventario(s.sucursal_nombre) || '—'}</div>`;
    if (preciosDistintos && precioHtml) {
      return `
      <div class="inventario-producto-sucursal-item inventario-producto-sucursal-item--con-precio">
        <div class="inventario-producto-sucursal-item-info">
          ${stockHtml}
          ${sucursalHtml}
        </div>
        <div class="inventario-producto-sucursal-item-precio">${precioHtml}</div>
      </div>`;
    }
    return `
      <div class="inventario-producto-sucursal-item">
        ${stockHtml}
        ${sucursalHtml}
      </div>`;
  }).join('');
}

function htmlPrecioUnicoAgrupadoInventario(p, formatearPrecio) {
  const detalle = p.sucursales_detalle || [];
  if (detalle.length === 0) return '';
  const rep = productoLikeDesdeDetalleSucursal(detalle[0], p);
  if (p.es_consignado) {
    const precioVenta = Number(rep.precio_venta ?? rep.precio) || 0;
    const costo = Number(rep.costo_consignacion) || 0;
    return `<div class="inventario-producto-precio inventario-consignado-venta">Venta: ${formatearPrecio(precioVenta)}</div><div class="inventario-consignado-costo">Costo: ${formatearPrecio(costo)}</div>`;
  }
  return `<div class="inventario-producto-precio">${formatearPrecioProductoInventario(rep)}</div>`;
}

function aplicarListaInventarioParaVista(lista, esTodasLasSucursales) {
  if (!esTodasLasSucursales) return lista;
  const agrupada = consolidarProductosInventarioTodasSucursales(lista);
  if (!inventarioEsVistaConsignados() && inventarioOrdenDefaultActivo()) {
    return ordenarProductosInventario(agrupada);
  }
  return agrupada;
}

function opcionesPrecioEnRangoFundas(min, max, step = FUNDAS_RANGO_PRECIO_STEP) {
  const a = Math.round(min / step) * step;
  const b = Math.round(max / step) * step;
  const opts = [];
  for (let v = a; v <= b; v += step) opts.push(v);
  return opts;
}

function getLimitesSliderRangoFundas() {
  const $slider = document.getElementById('prod-funda-precio-slider');
  if (!$slider) {
    return { min: FUNDAS_RANGO_PRECIO_MIN, max: FUNDAS_RANGO_PRECIO_MAX, step: FUNDAS_RANGO_PRECIO_STEP };
  }
  return {
    min: Number($slider.dataset.limiteMin ?? FUNDAS_RANGO_PRECIO_MIN),
    max: Number($slider.dataset.limiteMax ?? FUNDAS_RANGO_PRECIO_MAX),
    step: Number($slider.dataset.step ?? FUNDAS_RANGO_PRECIO_STEP),
  };
}

function actualizarUiSliderRangoFundas() {
  const $rMin = document.getElementById('prod-funda-precio-rango-min');
  const $rMax = document.getElementById('prod-funda-precio-rango-max');
  const $thumbMin = document.getElementById('prod-funda-precio-thumb-min');
  const $thumbMax = document.getElementById('prod-funda-precio-thumb-max');
  const $inMin = document.getElementById('prod-funda-precio-input-min');
  const $inMax = document.getElementById('prod-funda-precio-input-max');
  if (!$rMin || !$rMax) return;

  const limites = getLimitesSliderRangoFundas();
  let vMin = Number($rMin.value);
  let vMax = Number($rMax.value);

  if (vMin > vMax) {
    if (document.activeElement === $inMin) {
      vMin = vMax;
      $rMin.value = String(vMin);
    } else {
      vMax = vMin;
      $rMax.value = String(vMax);
    }
  }

  const pctMin = pctDesdeValorPrecioFiltro(vMin, limites);
  const pctMax = pctDesdeValorPrecioFiltro(vMax, limites);
  if ($thumbMin) {
    $thumbMin.style.left = `${pctMin}%`;
    $thumbMin.setAttribute('aria-valuenow', String(vMin));
  }
  if ($thumbMax) {
    $thumbMax.style.left = `${pctMax}%`;
    $thumbMax.setAttribute('aria-valuenow', String(vMax));
  }
  if ($inMin && document.activeElement !== $inMin) $inMin.value = String(vMin);
  if ($inMax && document.activeElement !== $inMax) $inMax.value = String(vMax);
}

function establecerRangoPrecioFundasForm(min, max) {
  const limites = getLimitesSliderRangoFundas();
  let vMin = Math.round(Number(min) / limites.step) * limites.step;
  let vMax = Math.round(Number(max) / limites.step) * limites.step;
  if (!Number.isFinite(vMin)) vMin = FUNDAS_RANGO_PRECIO_MIN;
  if (!Number.isFinite(vMax)) vMax = FUNDAS_RANGO_PRECIO_MAX;
  vMin = Math.max(limites.min, Math.min(vMin, limites.max));
  vMax = Math.max(vMin, Math.min(vMax, limites.max));
  const $rMin = document.getElementById('prod-funda-precio-rango-min');
  const $rMax = document.getElementById('prod-funda-precio-rango-max');
  if ($rMin) $rMin.value = String(vMin);
  if ($rMax) $rMax.value = String(vMax);
  actualizarUiSliderRangoFundas();
}

function leerRangoPrecioFundasForm() {
  const limites = getLimitesSliderRangoFundas();
  const $inMin = document.getElementById('prod-funda-precio-input-min');
  const $inMax = document.getElementById('prod-funda-precio-input-max');
  const $rMin = document.getElementById('prod-funda-precio-rango-min');
  const $rMax = document.getElementById('prod-funda-precio-rango-max');
  if (!$rMin || !$rMax) return { ok: false, msg: 'No se pudo leer el rango de precio' };

  const rawMin = $inMin?.value !== '' && $inMin?.value != null ? $inMin.value : $rMin.value;
  const rawMax = $inMax?.value !== '' && $inMax?.value != null ? $inMax.value : $rMax.value;
  let vMin = Math.round(Number(rawMin) / limites.step) * limites.step;
  let vMax = Math.round(Number(rawMax) / limites.step) * limites.step;

  if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) {
    return { ok: false, msg: 'Ingresa un rango de precio válido' };
  }
  vMin = Math.max(limites.min, Math.min(vMin, limites.max));
  vMax = Math.max(vMin, Math.min(vMax, limites.max));
  if (vMin <= 0) return { ok: false, msg: 'Ingresa un rango de precio válido' };

  $rMin.value = String(vMin);
  $rMax.value = String(vMax);
  if ($inMin && document.activeElement !== $inMin) $inMin.value = String(vMin);
  if ($inMax && document.activeElement !== $inMax) $inMax.value = String(vMax);
  actualizarUiSliderRangoFundas();

  return { ok: true, min: vMin, max: vMax };
}

function initSliderRangoFundasProducto() {
  if (initSliderRangoFundasProducto._done) return;
  initSliderRangoFundasProducto._done = true;

  const $rMin = document.getElementById('prod-funda-precio-rango-min');
  const $rMax = document.getElementById('prod-funda-precio-rango-max');
  const $thumbMin = document.getElementById('prod-funda-precio-thumb-min');
  const $thumbMax = document.getElementById('prod-funda-precio-thumb-max');
  const $slider = document.getElementById('prod-funda-precio-slider');
  const $inMin = document.getElementById('prod-funda-precio-input-min');
  const $inMax = document.getElementById('prod-funda-precio-input-max');
  if (!$rMin || !$rMax || !$slider) return;

  const limites = getLimitesSliderRangoFundas();
  [$inMin, $inMax].forEach(($in) => {
    if (!$in) return;
    $in.min = String(limites.min);
    $in.max = String(limites.max);
    $in.step = String(limites.step);
  });

  const $wrapMin = $inMin?.closest('.filtro-precio-rango-input-wrap');
  const $wrapMax = $inMax?.closest('.filtro-precio-rango-input-wrap');

  function setCampoRangoFundasActivo(tipo) {
    $wrapMin?.classList.toggle('es-activo', tipo === 'min');
    $wrapMax?.classList.toggle('es-activo', tipo === 'max');
  }

  function syncCampoRangoFundasActivo() {
    if ($thumbMin?.classList.contains('es-activo')) {
      setCampoRangoFundasActivo('min');
      return;
    }
    if ($thumbMax?.classList.contains('es-activo')) {
      setCampoRangoFundasActivo('max');
      return;
    }
    if (document.activeElement === $inMin) setCampoRangoFundasActivo('min');
    else if (document.activeElement === $inMax) setCampoRangoFundasActivo('max');
    else setCampoRangoFundasActivo(null);
  }

  function moverThumb(tipo, clientX) {
    const rect = $slider.getBoundingClientRect();
    if (!rect.width) return;
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const lim = getLimitesSliderRangoFundas();
    let val = valorDesdePctPrecioFiltro(pct, lim);
    let vMin = Number($rMin.value);
    let vMax = Number($rMax.value);
    if (tipo === 'min') {
      val = Math.min(val, vMax);
      $rMin.value = String(val);
    } else {
      val = Math.max(val, vMin);
      $rMax.value = String(val);
    }
    actualizarUiSliderRangoFundas();
  }

  function initArrastre($thumb, tipo) {
    if (!$thumb) return;
    $thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      $thumb.classList.add('es-activo');
      setCampoRangoFundasActivo(tipo);
      $thumb.setPointerCapture(e.pointerId);
      const move = (ev) => moverThumb(tipo, ev.clientX);
      const up = (ev) => {
        $thumb.classList.remove('es-activo');
        if ($thumb.hasPointerCapture(ev.pointerId)) $thumb.releasePointerCapture(ev.pointerId);
        $thumb.removeEventListener('pointermove', move);
        $thumb.removeEventListener('pointerup', up);
        $thumb.removeEventListener('pointercancel', up);
        requestAnimationFrame(syncCampoRangoFundasActivo);
      };
      $thumb.addEventListener('pointermove', move);
      $thumb.addEventListener('pointerup', up);
      $thumb.addEventListener('pointercancel', up);
      moverThumb(tipo, e.clientX);
    });
  }

  initArrastre($thumbMin, 'min');
  initArrastre($thumbMax, 'max');

  $inMin?.addEventListener('focus', () => setCampoRangoFundasActivo('min'));
  $inMax?.addEventListener('focus', () => setCampoRangoFundasActivo('max'));
  $inMin?.addEventListener('blur', () => requestAnimationFrame(syncCampoRangoFundasActivo));
  $inMax?.addEventListener('blur', () => requestAnimationFrame(syncCampoRangoFundasActivo));

  $inMin?.addEventListener('input', () => {
    const lim = getLimitesSliderRangoFundas();
    let vMin = Math.round(Number($inMin.value) / lim.step) * lim.step;
    let vMax = Number($rMax.value);
    if (!Number.isFinite(vMin)) return;
    vMin = Math.max(lim.min, Math.min(vMin, lim.max));
    if (vMin > vMax) vMax = vMin;
    $rMin.value = String(vMin);
    $rMax.value = String(vMax);
    actualizarUiSliderRangoFundas();
  });

  $inMax?.addEventListener('input', () => {
    const lim = getLimitesSliderRangoFundas();
    let vMin = Number($rMin.value);
    let vMax = Math.round(Number($inMax.value) / lim.step) * lim.step;
    if (!Number.isFinite(vMax)) return;
    vMax = Math.max(lim.min, Math.min(vMax, lim.max));
    if (vMax < vMin) vMin = vMax;
    $rMin.value = String(vMin);
    $rMax.value = String(vMax);
    actualizarUiSliderRangoFundas();
  });

  $inMin?.addEventListener('change', () => {
    const lim = getLimitesSliderRangoFundas();
    let vMin = Number($inMin.value);
    let vMax = Number($rMax.value);
    if (!Number.isFinite(vMin)) vMin = lim.min;
    vMin = Math.max(lim.min, Math.min(vMin, lim.max));
    if (vMin > vMax) vMax = vMin;
    $rMin.value = String(vMin);
    $rMax.value = String(vMax);
    actualizarUiSliderRangoFundas();
  });

  $inMax?.addEventListener('change', () => {
    const lim = getLimitesSliderRangoFundas();
    let vMin = Number($rMin.value);
    let vMax = Number($inMax.value);
    if (!Number.isFinite(vMax)) vMax = lim.max;
    vMax = Math.max(lim.min, Math.min(vMax, lim.max));
    if (vMax < vMin) vMin = vMax;
    $rMin.value = String(vMin);
    $rMax.value = String(vMax);
    actualizarUiSliderRangoFundas();
  });

  actualizarUiSliderRangoFundas();
}

function resetRangoPrecioFundasForm() {
  establecerRangoPrecioFundasForm(FUNDAS_RANGO_PRECIO_MIN, FUNDAS_RANGO_PRECIO_MAX);
}

function leerPrecioFundasParaGuardar(esPrecioFijo) {
  if (esPrecioFijo) {
    const $fijo = document.getElementById('prod-funda-precio-fijo');
    const precio = parseFloat($fijo?.value || 0);
    if (!Number.isFinite(precio) || precio <= 0) {
      return { ok: false, msg: 'Ingresa un precio válido' };
    }
    return { ok: true, precio, precioMax: null };
  }
  const rango = leerRangoPrecioFundasForm();
  if (!rango.ok) return rango;
  return {
    ok: true,
    precio: rango.min,
    precioMax: rango.max > rango.min ? rango.max : null,
  };
}

function listarProductosParaLimitesPrecioFiltro() {
  const q = (document.getElementById('inventario-buscador')?.value || '').toLowerCase().trim();
  const cat = categoriaInventarioActiva;
  const fuente = getFuenteInventarioActiva();
  return fuente.filter((p) => {
    if (cat === 'consignados') return !q || (p.nombre || '').toLowerCase().includes(q);
    const matchCat = cat === 'todos' || (String(p.categoria || '').toLowerCase() === cat);
    const matchQ = !q || (p.nombre || '').toLowerCase().includes(q);
    return matchCat && matchQ && productoCoincideFiltroMicaInventario(p);
  });
}

function obtenerLimitesPrecioInventarioFiltro() {
  const rangos = listarProductosParaLimitesPrecioFiltro()
    .map((p) => ({ min: getPrecioMinProducto(p), max: getPrecioMaxProducto(p) }))
    .filter((r) => Number.isFinite(r.min) && r.min >= 0);
  if (!rangos.length) return { min: 0, max: 1000 };
  let min = Math.floor(Math.min(...rangos.map((r) => r.min)));
  let max = Math.ceil(Math.max(...rangos.map((r) => r.max)));
  if (max <= min) max = min + 1;
  return { min, max };
}

function formatearPrecioFiltroInventario(n) {
  const fmt = window.formatearPrecioPOS;
  if (typeof fmt === 'function') return fmt(Number(n));
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function calcularHistogramaPreciosInventarioFiltro(limites, numBuckets = 28) {
  const rangos = listarProductosParaLimitesPrecioFiltro()
    .map((p) => ({ min: getPrecioMinProducto(p), max: getPrecioMaxProducto(p) }))
    .filter((r) => Number.isFinite(r.min) && r.min >= 0);
  const buckets = Array(numBuckets).fill(0);
  if (!rangos.length) return buckets.map(() => 0);
  const span = (limites.max - limites.min) || 1;
  rangos.forEach(({ min, max }) => {
    let idxMin = Math.floor(((min - limites.min) / span) * numBuckets);
    let idxMax = Math.floor(((max - limites.min) / span) * numBuckets);
    if (idxMin < 0) idxMin = 0;
    if (idxMax >= numBuckets) idxMax = numBuckets - 1;
    for (let i = idxMin; i <= idxMax; i++) buckets[i] += 1;
  });
  const peak = Math.max(...buckets, 1);
  return buckets.map((c) => c / peak);
}

function getLimitesSliderPrecioFiltro() {
  const $slider = document.getElementById('filtro-precio-rango-slider');
  if (!$slider) return { min: 0, max: 1000, step: 1 };
  return {
    min: Number($slider.dataset.limiteMin ?? 0),
    max: Number($slider.dataset.limiteMax ?? 1000),
    step: Number($slider.dataset.step ?? 1),
  };
}

function pctDesdeValorPrecioFiltro(val, limites) {
  const span = (limites.max - limites.min) || 1;
  return ((val - limites.min) / span) * 100;
}

function valorDesdePctPrecioFiltro(pct, limites) {
  const span = (limites.max - limites.min) || 1;
  const step = limites.step || 1;
  let val = limites.min + (pct / 100) * span;
  val = Math.round(val / step) * step;
  return Math.max(limites.min, Math.min(limites.max, Number(val.toFixed(2))));
}

function renderHistogramaPrecioFiltro() {
  const $hist = document.getElementById('filtro-precio-rango-histograma');
  const $rMin = document.getElementById('filtro-precio-rango-min');
  const $rMax = document.getElementById('filtro-precio-rango-max');
  if (!$hist || !$rMin || !$rMax) return;

  const limites = getLimitesSliderPrecioFiltro();
  const heights = calcularHistogramaPreciosInventarioFiltro(limites);
  const vMin = Number($rMin.value);
  const vMax = Number($rMax.value);
  const span = (limites.max - limites.min) || 1;

  $hist.innerHTML = heights.map((h, i) => {
    const bucketStart = limites.min + (i / heights.length) * span;
    const bucketEnd = limites.min + ((i + 1) / heights.length) * span;
    const activo = bucketEnd >= vMin && bucketStart <= vMax;
    const pct = Math.max(6, Math.round(h * 100));
    return `<div class="filtro-precio-rango-bar${activo ? ' activo' : ''}" style="height:${pct}%"></div>`;
  }).join('');
}

function actualizarUiSliderPrecioFiltro() {
  const $rMin = document.getElementById('filtro-precio-rango-min');
  const $rMax = document.getElementById('filtro-precio-rango-max');
  const $thumbMin = document.getElementById('filtro-precio-thumb-min');
  const $thumbMax = document.getElementById('filtro-precio-thumb-max');
  const $inMin = document.getElementById('filtro-precio-input-min');
  const $inMax = document.getElementById('filtro-precio-input-max');
  if (!$rMin || !$rMax) return;

  const limites = getLimitesSliderPrecioFiltro();
  let vMin = Number($rMin.value);
  let vMax = Number($rMax.value);

  if (vMin > vMax) {
    if (document.activeElement === $inMin) {
      vMin = vMax;
      $rMin.value = String(vMin);
    } else {
      vMax = vMin;
      $rMax.value = String(vMax);
    }
  }

  const pctMin = pctDesdeValorPrecioFiltro(vMin, limites);
  const pctMax = pctDesdeValorPrecioFiltro(vMax, limites);
  if ($thumbMin) {
    $thumbMin.style.left = `${pctMin}%`;
    $thumbMin.setAttribute('aria-valuenow', String(vMin));
    $thumbMin.setAttribute('aria-valuemin', String(limites.min));
    $thumbMin.setAttribute('aria-valuemax', String(limites.max));
  }
  if ($thumbMax) {
    $thumbMax.style.left = `${pctMax}%`;
    $thumbMax.setAttribute('aria-valuenow', String(vMax));
    $thumbMax.setAttribute('aria-valuemin', String(limites.min));
    $thumbMax.setAttribute('aria-valuemax', String(limites.max));
  }

  if ($inMin && document.activeElement !== $inMin) $inMin.value = String(vMin);
  if ($inMax && document.activeElement !== $inMax) $inMax.value = String(vMax);

  renderHistogramaPrecioFiltro();
}

function sincronizarInputsPrecioFiltro(limites) {
  const $inMin = document.getElementById('filtro-precio-input-min');
  const $inMax = document.getElementById('filtro-precio-input-max');
  [$inMin, $inMax].forEach(($in) => {
    if (!$in) return;
    $in.min = String(limites.min);
    $in.max = String(limites.max);
    $in.step = limites.max - limites.min > 100 ? '1' : '0.01';
  });
}

function aplicarInputPrecioFiltro(tipo) {
  const $rMin = document.getElementById('filtro-precio-rango-min');
  const $rMax = document.getElementById('filtro-precio-rango-max');
  const $inMin = document.getElementById('filtro-precio-input-min');
  const $inMax = document.getElementById('filtro-precio-input-max');
  if (!$rMin || !$rMax || !$inMin || !$inMax) return;

  const limites = obtenerLimitesPrecioInventarioFiltro();
  let vMin = Number($inMin.value);
  let vMax = Number($inMax.value);
  if (!Number.isFinite(vMin)) vMin = limites.min;
  if (!Number.isFinite(vMax)) vMax = limites.max;

  vMin = Math.max(limites.min, Math.min(vMin, limites.max));
  vMax = Math.max(limites.min, Math.min(vMax, limites.max));

  if (tipo === 'min' && vMin > vMax) vMax = vMin;
  if (tipo === 'max' && vMax < vMin) vMin = vMax;

  $rMin.value = String(vMin);
  $rMax.value = String(vMax);
  actualizarUiSliderPrecioFiltro();
}

function sincronizarSliderPrecioFiltro() {
  const f = inventarioFiltrosBusqueda;
  const $rMin = document.getElementById('filtro-precio-rango-min');
  const $rMax = document.getElementById('filtro-precio-rango-max');
  const $slider = document.getElementById('filtro-precio-rango-slider');
  if (!$rMin || !$rMax || !$slider) return;

  const limites = obtenerLimitesPrecioInventarioFiltro();
  const step = limites.max - limites.min > 100 ? 1 : 0.01;
  $slider.dataset.limiteMin = String(limites.min);
  $slider.dataset.limiteMax = String(limites.max);
  $slider.dataset.step = String(step);
  sincronizarInputsPrecioFiltro(limites);

  let valMin = f.precioMin !== '' ? Number(f.precioMin) : limites.min;
  let valMax = f.precioMax !== '' ? Number(f.precioMax) : limites.max;
  if (!Number.isFinite(valMin)) valMin = limites.min;
  if (!Number.isFinite(valMax)) valMax = limites.max;
  valMin = Math.max(limites.min, Math.min(valMin, limites.max));
  valMax = Math.max(valMin, Math.min(valMax, limites.max));

  $rMin.value = String(valMin);
  $rMax.value = String(valMax);
  actualizarUiSliderPrecioFiltro();
}

function leerSliderPrecioFiltroInventario() {
  const $rMin = document.getElementById('filtro-precio-rango-min');
  const $rMax = document.getElementById('filtro-precio-rango-max');
  if (!$rMin || !$rMax) return { precioMin: '', precioMax: '' };

  const limites = obtenerLimitesPrecioInventarioFiltro();
  const vMin = Number($rMin.value);
  const vMax = Number($rMax.value);
  return {
    precioMin: vMin > limites.min ? String(vMin) : '',
    precioMax: vMax < limites.max ? String(vMax) : '',
  };
}

function sincronizarFormularioFiltrosInventario() {
  const f = inventarioFiltrosBusqueda;
  if (f.orden === 'favoritos') f.orden = '';
  document.querySelectorAll('[data-filtro-stock]').forEach((chip) => {
    chip.classList.toggle('activo', chip.dataset.filtroStock === f.stock);
  });
  document.querySelectorAll('[data-filtro-imagen]').forEach((chip) => {
    chip.classList.toggle('activo', chip.dataset.filtroImagen === f.imagen);
  });
  const $orden = document.getElementById('filtro-orden');
  actualizarOpcionOrdenCategoriaFiltro();
  if ($orden) {
    let orden = f.orden;
    if (orden === 'favoritos') orden = '';
    if (orden === 'categoria' && !inventarioChipTodosActivo()) orden = '';
    if (orden) $orden.value = orden;
    else $orden.selectedIndex = 0;
    customSelectFiltroOrden?.syncDisplay?.();
  }
  sincronizarSliderPrecioFiltro();
  const $rowStock = document.getElementById('filtro-row-stock');
  if ($rowStock) $rowStock.hidden = inventarioEsVistaConsignados();
}

function leerFormularioFiltrosInventario() {
  const stockChip = document.querySelector('[data-filtro-stock].activo');
  const imagenChip = document.querySelector('[data-filtro-imagen].activo');
  const precios = leerSliderPrecioFiltroInventario();
  return {
    stock: stockChip?.dataset.filtroStock || 'todos',
    precioMin: precios.precioMin,
    precioMax: precios.precioMax,
    imagen: imagenChip?.dataset.filtroImagen || 'todos',
    orden: document.getElementById('filtro-orden')?.value || '',
  };
}

function initCustomSelectBasico($select) {
  if (!$select || $select.dataset.customSelectBasico) return null;
  $select.dataset.customSelectBasico = '1';

  const wrap = document.createElement('div');
  wrap.className = 'custom-select-wrap';
  $select.parentNode.insertBefore(wrap, $select);
  wrap.appendChild($select);

  const row = document.createElement('div');
  row.className = 'custom-select-row no-pencil';
  wrap.appendChild(row);

  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('tabindex', '0');
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('aria-haspopup', 'listbox');
  row.appendChild(trigger);

  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'custom-select-options';
  optionsDiv.setAttribute('role', 'listbox');
  wrap.appendChild(optionsDiv);

  function placeholderTexto() {
    const first = $select.options[0];
    return first?.value === '' ? String(first.textContent || 'Seleccionar').trim() : 'Seleccionar';
  }

  function syncDisplay() {
    const opt = $select.options[$select.selectedIndex];
    const ph = placeholderTexto();
    trigger.textContent = (opt?.value === '' ? '' : opt?.textContent?.trim()) || ph;
    trigger.classList.toggle('placeholder', !opt?.value);
  }

  function buildOptions() {
    optionsDiv.innerHTML = '';
    for (let i = 0; i < $select.options.length; i++) {
      const opt = $select.options[i];
      if (opt.value === '' && i === 0) continue;
      if (opt.hidden || opt.disabled) continue;
      const div = document.createElement('div');
      div.className = 'custom-select-option';
      if (i === $select.selectedIndex) div.classList.add('activo');
      div.textContent = opt.textContent;
      div.dataset.index = String(i);
      div.setAttribute('role', 'option');
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        $select.selectedIndex = parseInt(div.dataset.index, 10);
        $select.dispatchEvent(new Event('change', { bubbles: true }));
        syncDisplay();
        wrap.classList.remove('abierto');
      });
      optionsDiv.appendChild(div);
    }
  }

  function cerrarOpciones() {
    wrap.classList.remove('abierto');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if ($select.disabled) return;
    document.querySelectorAll('.custom-select-wrap.abierto').forEach((w) => {
      if (w !== wrap) w.classList.remove('abierto');
    });
    const abriendo = !wrap.classList.contains('abierto');
    wrap.classList.toggle('abierto');
    if (abriendo) {
      buildOptions();
      optionsDiv.scrollTop = 0;
    }
  });

  trigger.addEventListener('keydown', (e) => {
    if ($select.disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger.click();
    }
    if (e.key === 'Escape') cerrarOpciones();
  });

  if (!initCustomSelectBasico._closeListener) {
    initCustomSelectBasico._closeListener = true;
    document.addEventListener('click', (e) => {
      if (e.target.closest('.custom-select-wrap')) return;
      document.querySelectorAll('.custom-select-wrap.abierto').forEach((w) => {
        w.classList.remove('abierto');
      });
    });
  }

  buildOptions();
  syncDisplay();
  return {
    syncDisplay,
    cerrarOpciones,
    refresh: () => { buildOptions(); syncDisplay(); },
    setDisabled: (disabled) => {
      $select.disabled = Boolean(disabled);
      wrap.classList.toggle('custom-select-wrap--disabled', Boolean(disabled));
      if (disabled) wrap.classList.remove('abierto');
    },
    wrap,
  };
}

function initCustomSelectFiltroOrden($select) {
  return initCustomSelectBasico($select);
}

function initInventarioFiltrosModal() {
  if (initInventarioFiltrosModal._done) return;
  initInventarioFiltrosModal._done = true;

  const $modal = document.getElementById('modal-inventario-filtros');
  const $form = document.getElementById('form-inventario-filtros');
  const $btnAbrir = document.getElementById('btn-inventario-filtros');
  const $btnCerrar = document.getElementById('modal-filtros-cerrar');
  const $btnLimpiar = document.getElementById('modal-filtros-limpiar');
  if (!$modal || !$form || !$btnAbrir) return;

  customSelectFiltroOrden = initCustomSelectFiltroOrden(document.getElementById('filtro-orden'));
  actualizarOpcionOrdenCategoriaFiltro();

  function cerrarModalFiltros() {
    customSelectFiltroOrden?.cerrarOpciones?.();
    $modal.classList.remove('visible');
    $modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-inventario-filtros-abierto');
  }

  function abrirModalFiltros() {
    if (!puedeGestionarInventario()) return;
    sincronizarFormularioFiltrosInventario();
    $modal.classList.add('visible');
    $modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-inventario-filtros-abierto');
  }

  const $rMin = document.getElementById('filtro-precio-rango-min');
  const $rMax = document.getElementById('filtro-precio-rango-max');
  const $thumbMin = document.getElementById('filtro-precio-thumb-min');
  const $thumbMax = document.getElementById('filtro-precio-thumb-max');
  const $slider = document.getElementById('filtro-precio-rango-slider');
  const $inMin = document.getElementById('filtro-precio-input-min');
  const $inMax = document.getElementById('filtro-precio-input-max');

  function moverThumbPrecioFiltro(tipo, clientX) {
    if (!$slider || !$rMin || !$rMax) return;
    const rect = $slider.getBoundingClientRect();
    if (!rect.width) return;
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const limites = getLimitesSliderPrecioFiltro();
    let val = valorDesdePctPrecioFiltro(pct, limites);
    let vMin = Number($rMin.value);
    let vMax = Number($rMax.value);
    if (tipo === 'min') {
      val = Math.min(val, vMax);
      $rMin.value = String(val);
    } else {
      val = Math.max(val, vMin);
      $rMax.value = String(val);
    }
    actualizarUiSliderPrecioFiltro();
  }

  function initArrastreThumbPrecioFiltro($thumb, tipo) {
    if (!$thumb) return;
    $thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      $thumb.classList.add('es-activo');
      $thumb.setPointerCapture(e.pointerId);
      const move = (ev) => moverThumbPrecioFiltro(tipo, ev.clientX);
      const up = (ev) => {
        $thumb.classList.remove('es-activo');
        if ($thumb.hasPointerCapture(ev.pointerId)) $thumb.releasePointerCapture(ev.pointerId);
        $thumb.removeEventListener('pointermove', move);
        $thumb.removeEventListener('pointerup', up);
        $thumb.removeEventListener('pointercancel', up);
      };
      $thumb.addEventListener('pointermove', move);
      $thumb.addEventListener('pointerup', up);
      $thumb.addEventListener('pointercancel', up);
      moverThumbPrecioFiltro(tipo, e.clientX);
    });
  }

  initArrastreThumbPrecioFiltro($thumbMin, 'min');
  initArrastreThumbPrecioFiltro($thumbMax, 'max');
  $inMin?.addEventListener('input', () => aplicarInputPrecioFiltro('min'));
  $inMax?.addEventListener('input', () => aplicarInputPrecioFiltro('max'));
  $inMin?.addEventListener('change', () => aplicarInputPrecioFiltro('min'));
  $inMax?.addEventListener('change', () => aplicarInputPrecioFiltro('max'));

  $btnAbrir.addEventListener('click', abrirModalFiltros);
  $btnCerrar?.addEventListener('click', cerrarModalFiltros);
  $modal.addEventListener('click', (e) => {
    if (e.target === $modal) cerrarModalFiltros();
  });
  $modal.querySelector('.modal-content')?.addEventListener('click', (e) => e.stopPropagation());

  document.querySelectorAll('[data-filtro-stock]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filtro-stock]').forEach((c) => c.classList.remove('activo'));
      chip.classList.add('activo');
    });
  });
  document.querySelectorAll('[data-filtro-imagen]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filtro-imagen]').forEach((c) => c.classList.remove('activo'));
      chip.classList.add('activo');
    });
  });

  $btnLimpiar?.addEventListener('click', () => {
    inventarioFiltrosBusqueda = inventarioFiltrosPorDefecto();
    sincronizarFormularioFiltrosInventario();
  });

  $form.addEventListener('submit', (e) => {
    e.preventDefault();
    inventarioFiltrosBusqueda = leerFormularioFiltrosInventario();
    actualizarBtnFiltrosInventario();
    cerrarModalFiltros();
    renderInventarioProductos();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $modal.classList.contains('visible')) cerrarModalFiltros();
  });

  actualizarBtnFiltrosInventario();
}

function escHtmlInventario(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function productoTieneImagenInventario(p) {
  if (p?.tiene_imagen === true || p?.tiene_imagen === 't') return true;
  const img = p?.imagen;
  return typeof img === 'string' && img.trim().length > 0;
}

const inventarioImagenCache = new Map();
const inventarioCachePorSucursal = new Map();
let inventarioCargaEnCurso = null;
let inventarioCargaReqId = 0;
let inventarioLazyImagenObserver = null;

function claveCacheInventarioSucursal(raw, esTodasLasSucursales) {
  if (esTodasLasSucursales) return 'all';
  return String(raw || '');
}

function invalidarCacheInventario(sucursalRaw) {
  if (sucursalRaw == null || sucursalRaw === '') {
    inventarioCachePorSucursal.clear();
    inventarioImagenCache.clear();
    return;
  }
  const key = String(sucursalRaw).toLowerCase() === 'all' || String(sucursalRaw).toLowerCase() === 'todas'
    ? 'all'
    : String(sucursalRaw);
  inventarioCachePorSucursal.delete(key);
  inventarioCachePorSucursal.delete('all');
}

window.ucInvalidarCacheInventario = invalidarCacheInventario;

async function obtenerImagenProductoInventario(productoId) {
  const id = Number(productoId);
  if (!Number.isFinite(id)) return null;
  if (inventarioImagenCache.has(id)) return inventarioImagenCache.get(id);
  try {
    const r = await fetch(`${API}/productos/${id}/imagen`, { headers: authHeaders(false) });
    if (!r.ok) return null;
    const data = await r.json();
    const url = data?.imagen && String(data.imagen).trim() ? String(data.imagen).trim() : null;
    inventarioImagenCache.set(id, url);
    return url;
  } catch {
    return null;
  }
}

async function resolverImagenProductoInventario(p) {
  if (!productoTieneImagenInventario(p)) return null;
  if (typeof p?.imagen === 'string' && p.imagen.trim()) return p.imagen.trim();
  return obtenerImagenProductoInventario(p?.id);
}

function enlazarLazyImagenesInventario($root) {
  if (!$root) return;
  const pendientes = $root.querySelectorAll('img.inventario-producto-img[data-lazy-id]:not([data-lazy-listo])');
  if (!pendientes.length) return;

  const cargarImg = async (img) => {
    const id = Number(img.dataset.lazyId);
    if (!Number.isFinite(id) || img.dataset.lazyListo === '1') return;
    img.dataset.lazyListo = '1';
    const src = await obtenerImagenProductoInventario(id);
    if (!src) {
      ocultarImagenInventarioSiRota(img);
      return;
    }
    img.addEventListener('error', () => ocultarImagenInventarioSiRota(img), { once: true });
    img.src = src;
  };

  if (typeof IntersectionObserver === 'undefined') {
    pendientes.forEach((img) => { void cargarImg(img); });
    return;
  }

  if (!inventarioLazyImagenObserver) {
    inventarioLazyImagenObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        inventarioLazyImagenObserver.unobserve(img);
        void cargarImg(img);
      });
    }, { root: null, rootMargin: '120px', threshold: 0.01 });
  }

  pendientes.forEach((img) => inventarioLazyImagenObserver.observe(img));
}

function mostrarInventarioCargando() {
  const $grid = document.getElementById('inventario-productos');
  const $tbody = document.getElementById('tbody-inventario-productos');
  const msg = '<div class="inventario-vacio inventario-cargando">Cargando inventario…</div>';
  if ($grid && inventarioVistaModo !== 'tabla') $grid.innerHTML = msg;
  if ($tbody && inventarioVistaModo === 'tabla') {
    $tbody.innerHTML = '<tr><td colspan="8" class="inventario-tabla-vacio">Cargando inventario…</td></tr>';
  }
}

function ocultarImagenInventarioSiRota(img) {
  if (!img || img.dataset.rota === '1') return;
  img.dataset.rota = '1';
  img.hidden = true;
  img.alt = '';
  img.removeAttribute('src');
  const wrap = img.closest('.inventario-producto-img-wrap');
  if (wrap) {
    wrap.classList.add('inventario-producto-img-wrap--vacia');
    wrap.setAttribute('aria-label', 'Ver detalle ampliado');
  }
}

function nombreProductoInventarioDisplay(prod) {
  const nombre = String(prod?.nombre || '');
  if (prod?.categoria !== 'fundas') return nombre;
  let s = nombre.replace(/^Funda\s+/i, '').trim();
  for (const marca of MARCAS_CEL_DISPLAY) {
    const re = new RegExp(`^${marca}\\s+`, 'i');
    if (re.test(s)) {
      s = s.replace(re, '').trim();
      break;
    }
  }
  return s ? `Funda ${s}` : nombre;
}

function htmlInventarioCardImagen(p, sinStock = false) {
  const capaSinStock = sinStock
    ? '<div class="inventario-producto-sin-stock-layer" aria-hidden="true"><span class="inventario-producto-sin-stock-etiqueta">Sin stock</span></div>'
    : '';
  const claseSinStock = sinStock ? ' inventario-producto-img-wrap--sin-stock' : '';
  if (!productoTieneImagenInventario(p)) {
    return `<div class="inventario-producto-img-wrap inventario-producto-img-wrap--vacia${claseSinStock}" tabindex="0" role="button" aria-label="Ver detalle ampliado">${capaSinStock}</div>`;
  }
  if (typeof p.imagen === 'string' && p.imagen.trim()) {
    const src = escHtmlInventario(String(p.imagen).trim());
    return `<div class="inventario-producto-img-wrap${claseSinStock}" tabindex="0" role="button" aria-label="Ver imagen ampliada"><img class="inventario-producto-img" src="${src}" alt="">${capaSinStock}</div>`;
  }
  const pid = Number(p.id);
  const lazyAttr = Number.isFinite(pid) ? ` data-lazy-id="${pid}"` : '';
  return `<div class="inventario-producto-img-wrap${claseSinStock}" tabindex="0" role="button" aria-label="Ver imagen ampliada"><img class="inventario-producto-img inventario-producto-img--lazy"${lazyAttr} alt="">${capaSinStock}</div>`;
}

function etiquetaCategoriaInventario(cat) {
  const map = {
    micas: 'Micas',
    fundas: 'Fundas',
    cargadores: 'Cargadores',
    powerbanks: 'Power banks',
    audifonos: 'Audífonos',
    bocinas: 'Bocinas',
    accesorios: 'Accesorios',
    otros: 'Otros',
  };
  const key = String(cat || '').toLowerCase();
  return map[key] || (cat ? String(cat) : '—');
}

function actualizarContenedoresInventarioVista() {
  const $grid = document.getElementById('inventario-productos');
  const $tablaWrap = document.getElementById('inventario-tabla-wrap');
  const esTabla = inventarioVistaModo === 'tabla';
  if ($grid) $grid.hidden = esTabla;
  if ($tablaWrap) $tablaWrap.hidden = !esTabla;
}

function scrollInventarioAlInicio() {
  const $ancla = document.querySelector('#contenido-inventario .inventario-header')
    || document.getElementById('contenido-inventario');
  [
    document.getElementById('inventario-tabla-wrap'),
    document.getElementById('inventario-productos'),
    document.querySelector('.inventario-productos-wrap'),
    document.getElementById('contenido-inventario'),
    document.getElementById('vista-pos'),
    document.querySelector('#vista-pos .vista-main-col'),
    document.getElementById('vista-pos')?.closest('.app-glass'),
    document.querySelector('.app'),
  ].forEach((el) => {
    if (el) el.scrollTop = 0;
  });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  if ($ancla) {
    $ancla.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
  }
}

function actualizarBtnLimpiarBuscadorInventario() {
  const $buscador = document.getElementById('inventario-buscador');
  const $btn = document.getElementById('btn-inventario-buscador-limpiar');
  if (!$buscador || !$btn) return;
  $btn.hidden = !$buscador.value;
}

function mensajeVacioInventario() {
  if (ultimoErrorCargaInventario) {
    const safe = escHtmlInventario(ultimoErrorCargaInventario);
    return `<div class="inventario-vacio inventario-vacio-error">No se pudo cargar el inventario: ${safe}</div>`;
  }
  if (getFuenteInventarioActiva().length === 0) {
    const msg = inventarioEsVistaConsignados()
      ? 'No hay productos consignados en esta vista.'
      : 'No hay productos en esta vista.';
    return `<div class="inventario-vacio">${msg}</div>`;
  }
  return '<div class="inventario-vacio">No hay productos que coincidan con la búsqueda</div>';
}

function mensajeVacioInventarioTexto() {
  if (ultimoErrorCargaInventario) return `No se pudo cargar el inventario: ${ultimoErrorCargaInventario}`;
  if (getFuenteInventarioActiva().length === 0) {
    return inventarioEsVistaConsignados()
      ? 'No hay productos consignados en esta vista.'
      : 'No hay productos en esta vista.';
  }
  return 'No hay productos que coincidan con la búsqueda';
}

function renderInventarioPaginacion($pag, paginaActual, totalPaginas, mostrar = true) {
  if (!$pag) return;
  if (!mostrar) {
    $pag.hidden = true;
    $pag.innerHTML = '';
    return;
  }
  const paginas = Math.max(1, totalPaginas);
  const pagina = Math.min(Math.max(1, paginaActual), paginas);
  $pag.hidden = false;

  const maxVisible = 5;
  let start = Math.max(1, pagina - 2);
  let end = Math.min(paginas, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);

  let html = `<button type="button" class="inventario-pag-btn" data-pag="prev" ${pagina <= 1 ? 'disabled' : ''} aria-label="Página anterior">‹ Anterior</button>`;
  html += '<div class="inventario-pag-numeros">';
  if (start > 1) {
    html += '<button type="button" class="inventario-pag-num" data-pag="1">1</button>';
    if (start > 2) html += '<span class="inventario-pag-ellipsis" aria-hidden="true">…</span>';
  }
  for (let i = start; i <= end; i++) {
    html += `<button type="button" class="inventario-pag-num${i === pagina ? ' activo' : ''}" data-pag="${i}"${i === pagina ? ' aria-current="page"' : ''}>${i}</button>`;
  }
  if (end < paginas) {
    if (end < paginas - 1) html += '<span class="inventario-pag-ellipsis" aria-hidden="true">…</span>';
    html += `<button type="button" class="inventario-pag-num" data-pag="${paginas}">${paginas}</button>`;
  }
  html += '</div>';
  html += `<button type="button" class="inventario-pag-btn" data-pag="next" ${pagina >= paginas ? 'disabled' : ''} aria-label="Página siguiente">Siguiente ›</button>`;
  html += `<span class="inventario-pag-info">Página ${pagina} de ${paginas}</span>`;
  $pag.innerHTML = html;
}

function initInventarioVista() {
  const $buscador = document.getElementById('inventario-buscador');
  const $grid = document.getElementById('inventario-productos');
  const $btnAgregar = document.getElementById('btn-agregar-producto');

  async function cargarProductosInventario(opciones = {}) {
    const forzar = Boolean(opciones.forzar);
    const { raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
    const cacheKey = claveCacheInventarioSucursal(raw, esTodasLasSucursales);

    if (!raw) {
      productosInventario = [];
      productosConsignadosInventario = [];
      ultimoErrorCargaInventario = '';
      renderInventarioProductos();
      return;
    }

    if (forzar) {
      invalidarCacheInventario(cacheKey);
      inventarioImagenCache.clear();
    }

    if (!forzar && inventarioCachePorSucursal.has(cacheKey)) {
      const cached = inventarioCachePorSucursal.get(cacheKey);
      productosInventario = cached.productos;
      productosConsignadosInventario = cached.consignados;
      ultimoErrorCargaInventario = cached.error || '';
      renderInventarioProductos();
      return;
    }

    if (inventarioCargaEnCurso) return inventarioCargaEnCurso;

    const reqId = ++inventarioCargaReqId;
    productosInventario = [];
    productosConsignadosInventario = [];
    ultimoErrorCargaInventario = '';
    mostrarInventarioCargando();

    inventarioCargaEnCurso = (async () => {
      try {
        const url = esTodasLasSucursales
          ? `${API}/productos/inventario-todas-sucursales`
          : `${API}/productos?${new URLSearchParams({ sucursal_id: raw }).toString()}`;
        const urlConsignados = esTodasLasSucursales
          ? `${API}/productos-consignados/inventario-todas-sucursales`
          : `${API}/productos-consignados?${new URLSearchParams({ sucursal_id: raw }).toString()}`;
        const [r, rConsignados] = await Promise.all([
          fetch(url, { headers: authHeaders(false) }),
          fetch(urlConsignados, { headers: authHeaders(false) }),
        ]);
        if (reqId !== inventarioCargaReqId) return;
        if (!r.ok) {
          const rawErr = await r.text().catch(() => r.statusText);
          try {
            const j = JSON.parse(rawErr);
            ultimoErrorCargaInventario = (j && j.error) ? String(j.error) : rawErr || r.statusText;
          } catch {
            ultimoErrorCargaInventario = rawErr || r.statusText || 'Error de red';
          }
          console.error('productos inventario:', r.status, ultimoErrorCargaInventario);
          productosInventario = [];
        } else {
          const data = await r.json();
          productosInventario = Array.isArray(data) ? data : [];
        }
        if (rConsignados.ok) {
          const dataConsignados = await rConsignados.json();
          productosConsignadosInventario = (Array.isArray(dataConsignados) ? dataConsignados : [])
            .map(normalizarConsignadoInventario);
        } else {
          productosConsignadosInventario = [];
        }
        inventarioCachePorSucursal.set(cacheKey, {
          productos: productosInventario,
          consignados: productosConsignadosInventario,
          error: ultimoErrorCargaInventario,
        });
      } catch (err) {
        if (reqId !== inventarioCargaReqId) return;
        console.error(err);
        productosInventario = [];
        productosConsignadosInventario = [];
        ultimoErrorCargaInventario = err?.message ? String(err.message) : 'Error de red';
      }
      if (reqId !== inventarioCargaReqId) return;
      renderInventarioProductos();
    })();

    try {
      await inventarioCargaEnCurso;
    } finally {
      inventarioCargaEnCurso = null;
    }
  }

  window.ucCargarInventarioProductos = (opciones) => cargarProductosInventario(opciones || {});

  if (typeof initInventarioVista._inited !== 'undefined' && initInventarioVista._inited) {
    actualizarEstadoBtnAgregarProducto();
    renderInventarioChipsNavegacion();
    void Promise.all([cargarInventarioFavoritosDesdeApi(), cargarProductosInventario()]);
    return;
  }
  initInventarioVista._inited = true;

  initInventarioFiltrosModal();
  productosInventario = [];

  void Promise.all([cargarInventarioFavoritosDesdeApi(), cargarProductosInventario()]);

  const $chipsLinea = document.getElementById('inventario-chips-linea');
  if ($chipsLinea && !initInventarioVista._chipsBound) {
    initInventarioVista._chipsBound = true;
    $chipsLinea.addEventListener('click', (e) => {
      const chip = e.target.closest('.inventario-chip');
      if (!chip) return;
      manejarClickChipInventario(chip);
    });
  }
  renderInventarioChipsNavegacion();

  let inventarioBuscarDebounce = null;
  $buscador?.addEventListener('input', () => {
    actualizarBtnLimpiarBuscadorInventario();
    clearTimeout(inventarioBuscarDebounce);
    inventarioBuscarDebounce = setTimeout(() => renderInventarioProductos(), 200);
  });

  const $btnLimpiarBuscador = document.getElementById('btn-inventario-buscador-limpiar');
  $btnLimpiarBuscador?.addEventListener('click', () => {
    if (!$buscador) return;
    $buscador.value = '';
    actualizarBtnLimpiarBuscadorInventario();
    $buscador.focus();
    renderInventarioProductos();
  });
  actualizarBtnLimpiarBuscadorInventario();

  const $btnVistaTabla = document.getElementById('btn-inventario-vista-tabla');
  $btnVistaTabla?.addEventListener('click', () => {
    if (!puedeGestionarInventario()) return;
    inventarioVistaModo = inventarioVistaModo === 'tabla' ? 'cards' : 'tabla';
    paginaInventarioActual = 1;
    const esTabla = inventarioVistaModo === 'tabla';
    $btnVistaTabla.classList.toggle('activo', esTabla);
    $btnVistaTabla.setAttribute('aria-pressed', esTabla ? 'true' : 'false');
    const titulo = esTabla ? 'Ver como tarjetas' : 'Ver como tabla';
    $btnVistaTabla.title = titulo;
    $btnVistaTabla.setAttribute('aria-label', titulo);
    renderInventarioProductos();
  });

  document.getElementById('btn-inventario-restock')?.addEventListener('click', () => {
    if (!puedeGestionarInventario()) return;
    window.ucToggleModoRestockRapido?.();
  });

  const $pag = document.getElementById('inventario-paginacion');
  $pag?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pag]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    const paginaAnterior = paginaInventarioActual;
    const val = btn.dataset.pag;
    const totalPaginas = getInventarioTotalPaginas(filtrarProductosInventario().length);
    if (val === 'prev') paginaInventarioActual = Math.max(1, paginaInventarioActual - 1);
    else if (val === 'next') paginaInventarioActual = Math.min(totalPaginas, paginaInventarioActual + 1);
    else paginaInventarioActual = Number(val);
    btn.blur();
    renderInventarioProductos();
    if (paginaInventarioActual !== paginaAnterior) {
      scrollInventarioAlInicio();
      requestAnimationFrame(scrollInventarioAlInicio);
      setTimeout(scrollInventarioAlInicio, 0);
    }
  });

  if ($grid && typeof initInventarioVista._resizeObs === 'undefined') {
    let inventarioResizeTimer;
    initInventarioVista._resizeObs = new ResizeObserver(() => {
      if (inventarioVistaModo !== 'cards') return;
      clearTimeout(inventarioResizeTimer);
      inventarioResizeTimer = setTimeout(() => renderInventarioProductos(), 150);
    });
    initInventarioVista._resizeObs.observe($grid);
  }

  $btnAgregar?.addEventListener('click', () => {
    if (!puedeGestionarInventario() || $btnAgregar.disabled) return;
    window.ucAbrirModalAgregarProducto?.();
  });

  const $btnAgregarCons = document.getElementById('btn-agregar-consignado');
  $btnAgregarCons?.addEventListener('click', () => {
    if (!puedeGestionarInventario() || $btnAgregarCons.disabled) return;
    window.ucAbrirModalConsignadaInventario?.();
  });

  actualizarEstadoBtnAgregarProducto();
}

function renderInventarioProductos() {
  actualizarContenedoresInventarioVista();
  if (inventarioEsVistaConsignados() || inventarioVistaModo !== 'tabla') {
    renderInventarioVistaCards();
  } else {
    renderInventarioVistaTabla();
  }
}

function renderInventarioVistaTabla() {
  const $tablaWrap = document.getElementById('inventario-tabla-wrap');
  const $tbody = document.getElementById('tbody-inventario-productos');
  const $pag = document.getElementById('inventario-paginacion');
  const $grid = document.getElementById('inventario-productos');
  if (!$tbody || !$tablaWrap) return;

  const { raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
  if (!raw) {
    paginaInventarioActual = 1;
    inventarioFiltroClave = '';
    $tbody.innerHTML = '<tr><td colspan="8" class="inventario-tabla-vacio">Selecciona una sucursal o «Todas las sucursales» arriba para ver productos</td></tr>';
    document.querySelectorAll('.inventario-col-sucursal').forEach((el) => { el.hidden = true; });
    if ($grid) $grid.innerHTML = '';
    renderInventarioPaginacion($pag, 1, 1, false);
    return;
  }

  const filtroActual = claveFiltroInventario();
  if (filtroActual !== inventarioFiltroClave) {
    paginaInventarioActual = 1;
    inventarioFiltroClave = filtroActual;
  }

  const verTodasSucursales = esTodasLasSucursales;
  const ocultarIdYStock = verTodasSucursales;
  const $thSucursal = document.querySelector('#inventario-tabla thead .inventario-col-sucursal');
  if ($thSucursal) $thSucursal.textContent = verTodasSucursales ? 'Sucursales y stock' : 'Sucursal';
  document.querySelectorAll('#inventario-tabla .inventario-col-id, #inventario-tabla .inventario-col-stock').forEach((el) => {
    el.hidden = ocultarIdYStock;
  });
  document.querySelectorAll('.inventario-col-sucursal').forEach((el) => { el.hidden = !verTodasSucursales; });
  document.querySelectorAll('.inventario-col-acciones').forEach((el) => { el.hidden = verTodasSucursales; });

  const lista = aplicarListaInventarioParaVista(filtrarProductosInventario(), verTodasSucursales);
  const formatearPrecio = window.formatearPrecioPOS || (n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }));
  const totalPaginas = getInventarioTotalPaginas(lista.length);
  if (paginaInventarioActual > totalPaginas) paginaInventarioActual = totalPaginas;

  if ($grid) $grid.innerHTML = '';

  if (lista.length === 0) {
    const colsVacias = verTodasSucursales ? 6 : 7;
    $tbody.innerHTML = `<tr><td colspan="${colsVacias}" class="inventario-tabla-vacio">${escHtmlInventario(mensajeVacioInventarioTexto())}</td></tr>`;
    renderInventarioPaginacion($pag, 1, 1, false);
    return;
  }

  const inicio = (paginaInventarioActual - 1) * INVENTARIO_FILAS_TABLA_POR_PAGINA;
  const paginaLista = lista.slice(inicio, inicio + INVENTARIO_FILAS_TABLA_POR_PAGINA);

  $tbody.innerHTML = paginaLista.map((p) => {
    const esConsignado = Boolean(p.es_consignado);
    const agrupado = Boolean(p.inventario_agrupado_todas);
    let celSucursalInner = '';
    let colPrecioVenta;
    let colStock;
    if (agrupado) {
      celSucursalInner = `<div class="inventario-producto-sucursales-lista inventario-tabla-sucursales-lista${sucursalesTienenPreciosVentaDistintos(p.sucursales_detalle) ? ' inventario-producto-sucursales-lista--precios-distintos' : ''}">${htmlDetalleSucursalesInventarioCard(p, formatearPrecio)}</div>`;
      if (sucursalesTienenPreciosVentaDistintos(p.sucursales_detalle)) {
        colPrecioVenta = (p.sucursales_detalle || []).map((s) => {
          const nom = escHtmlInventario(s.sucursal_nombre) || '—';
          if (esConsignado) {
            return `${nom}: ${formatearPrecio(Number(s.precio_venta ?? s.precio) || 0)}`;
          }
          return `${nom}: ${formatearPrecioProductoInventario(productoLikeDesdeDetalleSucursal(s, p))}`;
        }).join('<br>');
      } else {
        colPrecioVenta = esConsignado
          ? formatearPrecio(Number(p.sucursales_detalle[0]?.precio_venta ?? p.sucursales_detalle[0]?.precio) || 0)
          : formatearPrecioProductoInventario(productoLikeDesdeDetalleSucursal(p.sucursales_detalle[0], p));
      }
      colStock = '—';
    } else {
      if (verTodasSucursales) {
        celSucursalInner = escHtmlInventario(p.sucursal_nombre) || '<span style="opacity:.4">—</span>';
      }
      colStock = esConsignado ? '—' : (p.stock ?? 0);
      colPrecioVenta = esConsignado
        ? formatearPrecio(Number(p.precio_venta ?? p.precio) || 0)
        : formatearPrecioProductoInventario(p);
    }
    const colCostoCompra = esConsignado
      ? formatearPrecio(Number(p.costo_consignacion) || 0)
      : formatearCostoCompraInventario(p);
    const puedeTrasladar = puedeGestionarInventario() && !agrupado && puedeTrasladarProductoInventario(p);
    const puedeCarrito = !agrupado && inventarioPuedeAgregarAlCarrito(p, esConsignado);
    const tituloCarrito = tituloBotonAgregarInventarioCarrito(p, esConsignado);
    const filaGestion = puedeGestionarInventario()
      ? `<div class="inventario-tabla-acciones-fila">
          <button type="button" class="btn-tabla inventario-tabla-editar" data-id="${p.id}">Editar</button>
          <button type="button" class="btn-tabla btn-tabla-danger inventario-tabla-eliminar" data-id="${p.id}">Eliminar</button>
        </div>`
      : '';
    const accionesHtml = `${filaGestion}
        <div class="inventario-tabla-acciones-fila inventario-tabla-acciones-fila--iconos">
          <button type="button" class="btn-tabla btn-tabla-icono inventario-tabla-carrito" data-id="${p.id}" title="${escHtmlInventario(tituloCarrito)}" aria-label="${escHtmlInventario(tituloCarrito)}"${puedeCarrito ? '' : ' disabled'}><i class="fa-solid ${iconoBotonAgregarInventarioCarrito()}" aria-hidden="true"></i></button>
          ${puedeTrasladar ? `<button type="button" class="btn-tabla btn-tabla-icono inventario-tabla-trasladar" data-id="${p.id}" title="Trasladar a otra sucursal" aria-label="Trasladar a otra sucursal"><i class="fa-solid fa-arrows-turn-to-dots" aria-hidden="true"></i></button>` : ''}
        </div>`;
    return `
    <tr data-id="${p.id}"${esConsignado ? ' data-consignado="1"' : ''}${agrupado ? ' data-agrupado="1"' : ''}>
      <td class="tabla-num inventario-col-id">${agrupado ? '—' : p.id}</td>
      <td>${escHtmlInventario(nombreProductoInventarioDisplay(p))}</td>
      <td>${escHtmlInventario(esConsignado ? 'Consignado' : etiquetaCategoriaInventario(p.categoria))}</td>
      <td class="tabla-num">${colPrecioVenta}</td>
      <td class="tabla-num">${colCostoCompra}</td>
      <td class="tabla-num inventario-col-stock">${colStock}</td>
      ${verTodasSucursales ? `<td class="inventario-col-sucursal inventario-tabla-multisucursal">${celSucursalInner}</td>` : ''}
      ${verTodasSucursales ? '' : `<td class="inventario-tabla-acciones inventario-col-acciones">
        ${accionesHtml}
      </td>`}
    </tr>`;
  }).join('');
  document.querySelectorAll('#inventario-tabla .inventario-col-id, #inventario-tabla .inventario-col-stock').forEach((el) => {
    el.hidden = ocultarIdYStock;
  });

  $tbody.querySelectorAll('.inventario-tabla-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const row = btn.closest('tr');
      const esConsignado = row?.dataset?.consignado === '1';
      if (esConsignado) {
        const prod = productosConsignadosInventario.find((item) => Number(item.id) === id);
        if (prod) window.ucAbrirModalEditarConsignado?.(prod);
        return;
      }
      const prod = productosInventario.find((item) => Number(item.id) === id);
      if (prod) window.ucAbrirModalEditarProducto?.(prod);
    });
  });

  $tbody.querySelectorAll('.inventario-tabla-eliminar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const row = btn.closest('tr');
      const esConsignado = row?.dataset?.consignado === '1';
      const prod = esConsignado
        ? productosConsignadosInventario.find((item) => Number(item.id) === id)
        : productosInventario.find((item) => Number(item.id) === id);
      if (!prod) return;
      eliminarProductoDesdeInventario(id, prod.nombre || 'este producto', esConsignado);
    });
  });

  $tbody.querySelectorAll('.inventario-tabla-carrito').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const row = btn.closest('tr');
      const esConsignado = row?.dataset?.consignado === '1';
      const prod = esConsignado
        ? productosConsignadosInventario.find((item) => Number(item.id) === id)
        : productosInventario.find((item) => Number(item.id) === id);
      if (!prod) return;
      if (!inventarioPuedeAgregarAlCarrito(prod, esConsignado)) return;
      if (esConsignado) {
        window.ucAgregarConsignadoAlCarrito?.({
          consignadoId: prod.id,
          nombre: prod.nombre,
          precio: prod.precio_venta ?? prod.precio,
          costoConsignacion: prod.costo_consignacion,
          categoria: prod.categoria,
          imagen: prod.imagen || null,
        });
      } else if (window.agregarAlCarrito) {
        window.agregarAlCarrito(prod);
      }
    });
  });

  $tbody.querySelectorAll('.inventario-tabla-trasladar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const prod = productosInventario.find((item) => Number(item.id) === id);
      if (prod) window.ucAbrirModalTrasladarProducto?.(prod);
    });
  });

  renderInventarioPaginacion($pag, paginaInventarioActual, totalPaginas, true);
  if ($tablaWrap) $tablaWrap.scrollTop = 0;
}

function renderInventarioVistaCards() {
  const $grid = document.getElementById('inventario-productos');
  const $pag = document.getElementById('inventario-paginacion');
  const $tbody = document.getElementById('tbody-inventario-productos');
  if (!$grid) return;
  if ($tbody) $tbody.innerHTML = '';
  const { raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
  if (!raw) {
    paginaInventarioActual = 1;
    inventarioFiltroClave = '';
    $grid.innerHTML = '<div class="inventario-vacio">Selecciona una sucursal o «Todas las sucursales» arriba para ver productos</div>';
    renderInventarioPaginacion($pag, 1, 1, false);
    return;
  }

  const filtroActual = claveFiltroInventario();
  if (filtroActual !== inventarioFiltroClave) {
    paginaInventarioActual = 1;
    inventarioFiltroClave = filtroActual;
  }

  const verTodasSucursales = esTodasLasSucursales;
  const lista = aplicarListaInventarioParaVista(filtrarProductosInventario(), verTodasSucursales);
  const totalPaginas = getInventarioTotalPaginas(lista.length);
  if (paginaInventarioActual > totalPaginas) paginaInventarioActual = totalPaginas;
  const porPagina = getInventarioItemsPorPagina();

  const formatearPrecio = window.formatearPrecioPOS || (n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }));

  if (lista.length === 0) {
    $grid.innerHTML = mensajeVacioInventario();
    renderInventarioPaginacion($pag, 1, 1, false);
    return;
  }

  const inicio = (paginaInventarioActual - 1) * porPagina;
  const paginaLista = lista.slice(inicio, inicio + porPagina);

  $grid.innerHTML = paginaLista.map((p) => {
    const esConsignado = Boolean(p.es_consignado);
    const agrupado = Boolean(p.inventario_agrupado_todas);
    if (agrupado) {
      const sinStock = productoSinStockEnTodasSucursales(p);
      const preciosDistintos = sucursalesTienenPreciosVentaDistintos(p.sucursales_detalle);
      const precioUnicoInner = preciosDistintos ? '' : htmlPrecioUnicoAgrupadoInventario(p, formatearPrecio);
      const precioSlotHtml = `<div class="inventario-producto-precio-slot${preciosDistintos ? ' inventario-producto-precio-slot--vacio' : ''}">${precioUnicoInner}</div>`;
      const detalleSucursalesHtml = htmlDetalleSucursalesInventarioCard(p, formatearPrecio);
      const claseConsignado = esConsignado ? ' inventario-producto-card--consignado' : '';
      const etiquetaConsignado = esConsignado ? '<div class="inventario-consignado-etiqueta">Consignado</div>' : '';
      return `
    <article class="inventario-producto-card inventario-producto-card--agrupado-todas${claseConsignado}${sinStock ? ' inventario-producto-card--sin-stock' : ''}" data-id="${p.id}" data-agrupado="1"${esConsignado ? ' data-consignado="1"' : ''}>
      ${etiquetaConsignado}
      ${htmlInventarioCardImagen(p, sinStock && !esConsignado)}
      <div class="inventario-producto-nombre">${escHtmlInventario(nombreProductoInventarioDisplay(p))}</div>
      <div class="inventario-producto-meta">
        <div class="inventario-producto-meta-principal inventario-producto-meta-principal--agrupado">
          <div class="inventario-producto-info">
            ${precioSlotHtml}
            <div class="inventario-producto-sucursales-lista${preciosDistintos ? ' inventario-producto-sucursales-lista--precios-distintos' : ''}">${detalleSucursalesHtml}</div>
          </div>
        </div>
      </div>
    </article>
  `;
    }
    const nomSuc = (p.sucursal_nombre || '').replace(/</g, '&lt;');
    const lineaSucursal =
      verTodasSucursales && nomSuc
        ? `<div class="inventario-producto-sucursal">${nomSuc}</div>`
        : '';
    if (esConsignado) {
      const precioVenta = Number(p.precio_venta ?? p.precio) || 0;
      const costo = Number(p.costo_consignacion) || 0;
      const btnEditar = puedeGestionarInventario()
        ? `<button type="button" class="inventario-producto-editar" data-id="${p.id}" title="Editar producto consignado" aria-label="Editar producto consignado">${UC_ICONO_EDITAR}</button>`
        : '';
      const puedeCarrito = inventarioPuedeAgregarAlCarrito(p, true);
      const tituloCarrito = tituloBotonAgregarInventarioCarrito(p, true);
      return `
    <article class="inventario-producto-card inventario-producto-card--consignado" data-id="${p.id}" data-consignado="1">
      ${htmlBotonFavoritoInventario(p)}
      <div class="inventario-consignado-etiqueta">Consignado</div>
      <div class="inventario-producto-nombre">${escHtmlInventario(nombreProductoInventarioDisplay(p))}</div>
      <div class="inventario-producto-meta">
        <div class="inventario-producto-meta-principal">
          <div class="inventario-consignado-datos">
            <div class="inventario-producto-precio inventario-consignado-venta">Venta: ${formatearPrecio(precioVenta)}</div>
            <div class="inventario-consignado-costo">Costo: ${formatearPrecio(costo)}</div>
          </div>
          ${btnEditar}
        </div>
        ${lineaSucursal}
      </div>
      <div class="inventario-producto-acciones">
        <button type="button" class="inventario-producto-btn" data-id="${p.id}" title="${escHtmlInventario(tituloCarrito)}"${puedeCarrito ? '' : ' disabled'}>${escHtmlInventario(etiquetaBotonAgregarInventarioCarrito())}</button>
      </div>
    </article>
  `;
    }
    const stockNum = Number(p.stock) || 0;
    const sinStock = stockNum <= 0;
    const cantidadLabel = `Stock: ${stockNum}`;
    const btnEditar = puedeGestionarInventario()
      ? `<button type="button" class="inventario-producto-editar" data-id="${p.id}" title="Editar producto" aria-label="Editar producto">${UC_ICONO_EDITAR}</button>`
      : '';
    const puedeCarrito = inventarioPuedeAgregarAlCarrito(p, false);
    const tituloCarrito = tituloBotonAgregarInventarioCarrito(p, false);
    return `
    <article class="inventario-producto-card${sinStock ? ' inventario-producto-card--sin-stock' : ''}" data-id="${p.id}">
      ${htmlBotonFavoritoInventario(p)}
      ${htmlInventarioCardImagen(p, sinStock)}
      <div class="inventario-producto-nombre">${escHtmlInventario(nombreProductoInventarioDisplay(p))}</div>
      <div class="inventario-producto-meta">
        <div class="inventario-producto-meta-principal">
          <div class="inventario-producto-info">
            <div class="inventario-producto-precio">${formatearPrecioProductoInventario(p)}</div>
            <div class="inventario-producto-stock${sinStock ? ' inventario-producto-stock--agotado' : ''}">${cantidadLabel}</div>
          </div>
          ${btnEditar}
        </div>
        ${lineaSucursal}
      </div>
      <div class="inventario-producto-acciones">
        <button type="button" class="inventario-producto-btn" data-id="${p.id}" title="${escHtmlInventario(tituloCarrito)}"${puedeCarrito ? '' : ' disabled'}>${escHtmlInventario(etiquetaBotonAgregarInventarioCarrito())}</button>
      </div>
    </article>
  `;
  }).join('');

  renderInventarioPaginacion($pag, paginaInventarioActual, totalPaginas, true);
  $grid.scrollTop = 0;

  $grid.querySelectorAll('.inventario-producto-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const card = btn.closest('.inventario-producto-card');
      const esConsignado = card?.dataset?.consignado === '1';
      const prod = esConsignado
        ? productosConsignadosInventario.find((p) => Number(p.id) === id)
        : productosInventario.find((p) => Number(p.id) === id);
      if (!prod) return;
      if (!inventarioPuedeAgregarAlCarrito(prod, esConsignado)) return;
      if (esConsignado) {
        window.ucAgregarConsignadoAlCarrito?.({
          consignadoId: prod.id,
          nombre: prod.nombre,
          precio: prod.precio_venta ?? prod.precio,
          costoConsignacion: prod.costo_consignacion,
          categoria: prod.categoria,
          imagen: prod.imagen || null,
        });
      } else if (window.agregarAlCarrito) {
        window.agregarAlCarrito(prod);
      }
    });
  });

  $grid.querySelectorAll('.inventario-producto-favorito').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = btn.closest('.inventario-producto-card');
      const id = Number(card?.dataset.id);
      const esConsignado = card?.dataset?.consignado === '1';
      const prod = esConsignado
        ? productosConsignadosInventario.find((item) => Number(item.id) === id)
        : productosInventario.find((item) => Number(item.id) === id);
      if (!prod) return;
      const prevActivo = esInventarioFavorito(prod);
      actualizarBotonFavoritoInventario(btn, !prevActivo);
      btn.disabled = true;
      try {
        const activo = await toggleInventarioFavorito(prod);
        actualizarBotonFavoritoInventario(btn, activo);
        renderInventarioProductos();
      } catch (err) {
        actualizarBotonFavoritoInventario(btn, prevActivo);
        console.error(err);
      } finally {
        btn.disabled = false;
      }
    });
  });

  $grid.querySelectorAll('.inventario-producto-editar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const card = btn.closest('.inventario-producto-card');
      const esConsignado = card?.dataset?.consignado === '1';
      if (esConsignado) {
        const prod = productosConsignadosInventario.find((p) => Number(p.id) === id);
        if (prod) window.ucAbrirModalEditarConsignado?.(prod);
        return;
      }
      const prod = productosInventario.find((p) => Number(p.id) === id);
      if (prod) window.ucAbrirModalEditarProducto?.(prod);
    });
  });

  function abrirZoomDesdeCardEl(el) {
    const card = el.closest('.inventario-producto-card');
    if (card?.dataset?.agrupado === '1') return;
    const id = Number(card?.dataset.id);
    const prod = productosInventario.find((p) => Number(p.id) === id);
    if (prod) abrirInventarioProductoZoom(prod);
  }

  function enlazarZoomInventario(el) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirZoomDesdeCardEl(el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirZoomDesdeCardEl(el);
      }
    });
  }

  $grid.querySelectorAll('.inventario-producto-img-wrap').forEach((wrap) => {
    enlazarZoomInventario(wrap);
    const img = wrap.querySelector('.inventario-producto-img');
    if (img) {
      img.addEventListener('error', () => ocultarImagenInventarioSiRota(img), { once: true });
      if (img.complete && img.src && !img.naturalWidth) ocultarImagenInventarioSiRota(img);
    }
  });
  enlazarLazyImagenesInventario($grid);
}

let inventarioZoomAbierto = false;
let inventarioZoomProducto = null;

function puedeTrasladarProductoInventario(p) {
  if (!p || p.es_consignado) return false;
  const stock = Number(p.stock) || 0;
  return stock > 0;
}

function getSucursalIdProductoInventario(p) {
  const sid = p?.sucursal_id ?? p?.id_sucursal;
  const n = Number(sid);
  return Number.isFinite(n) ? n : NaN;
}

/** Evita que la rueda del mouse cambie inputs type=number; desplaza el panel scrollable. */
function redirigirWheelScrollPanelDesdeInputNumerico($scrollContainer) {
  if (!$scrollContainer || $scrollContainer.dataset.wheelNumeroPanel === '1') return;
  $scrollContainer.dataset.wheelNumeroPanel = '1';
  $scrollContainer.addEventListener('wheel', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'number') return;
    e.preventDefault();
    $scrollContainer.scrollTop += e.deltaY;
  }, { passive: false });
}

function cerrarInventarioProductoZoom() {
  const $bd = document.getElementById('inventario-producto-zoom-backdrop');
  const $panel = document.getElementById('inventario-producto-zoom-panel');
  if (!$bd || !$panel) return;
  $bd.classList.remove('visible');
  $panel.classList.remove('visible');
  $bd.setAttribute('aria-hidden', 'true');
  $panel.setAttribute('aria-hidden', 'true');
  inventarioZoomAbierto = false;
  inventarioZoomProducto = null;
  document.body.classList.remove('inventario-zoom-abierto');
}

function configurarImagenZoomInventario($img, src) {
  if (!$img) return;
  $img.alt = '';
  $img.onerror = () => {
    $img.hidden = true;
    $img.removeAttribute('src');
    $img.onerror = null;
  };
  $img.onload = () => {
    $img.hidden = false;
  };
  if (src) {
    $img.src = src;
  } else {
    $img.onerror = null;
    $img.onload = null;
    $img.removeAttribute('src');
    $img.hidden = true;
  }
}

function abrirInventarioProductoZoom(p) {
  const $bd = document.getElementById('inventario-producto-zoom-backdrop');
  const $panel = document.getElementById('inventario-producto-zoom-panel');
  const $img = document.getElementById('inventario-zoom-img');
  const $nom = document.getElementById('inventario-zoom-nombre');
  const $pre = document.getElementById('inventario-zoom-precio');
  const $costoCompra = document.getElementById('inventario-zoom-costo-compra');
  const $stock = document.getElementById('inventario-zoom-stock');
  const $cat = document.getElementById('inventario-zoom-cat');
  const $suc = document.getElementById('inventario-zoom-sucursal');
  if (!$bd || !$panel || !$img || !$nom || !p) return;
  const formatearPrecio = window.formatearPrecioPOS || (n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }));
  configurarImagenZoomInventario($img, null);
  if (productoTieneImagenInventario(p)) {
    void resolverImagenProductoInventario(p).then((src) => {
      if (inventarioZoomProducto !== p) return;
      configurarImagenZoomInventario($img, src);
    });
  }
  $nom.textContent = nombreProductoInventarioDisplay(p) || 'Producto';
  const esConsignado = Boolean(p.es_consignado);
  if ($pre) {
    if (esConsignado) {
      $pre.textContent = `Venta: ${formatearPrecio(Number(p.precio_venta ?? p.precio) || 0)}`;
    } else {
      $pre.textContent = `Venta: ${formatearPrecioProductoInventario(p)}`;
    }
  }
  if ($costoCompra) {
    let costo = null;
    if (esConsignado) {
      const c = Number(p.costo_consignacion);
      costo = Number.isFinite(c) && c > 0 ? c : null;
    } else {
      costo = getCostoCompraProducto(p);
    }
    if (costo != null) {
      $costoCompra.textContent = esConsignado
        ? `Costo de consignación: ${formatearPrecio(costo)}`
        : `Costo de compra: ${formatearPrecio(costo)}`;
      $costoCompra.hidden = false;
    } else {
      $costoCompra.textContent = '';
      $costoCompra.hidden = true;
    }
  }
  if ($stock) $stock.textContent = `Stock: ${p.stock ?? 0}`;
  if ($cat) {
    const catRaw = (p.categoria || '').trim();
    if (catRaw) {
      $cat.textContent = `Categoría: ${catRaw.charAt(0).toUpperCase() + catRaw.slice(1)}`;
      $cat.hidden = false;
    } else {
      $cat.textContent = '';
      $cat.hidden = true;
    }
  }
  if ($suc) {
    const nomSuc = (p.sucursal_nombre || '').trim();
    if (nomSuc) {
      $suc.textContent = `Sucursal: ${nomSuc}`;
      $suc.hidden = false;
    } else {
      $suc.textContent = '';
      $suc.hidden = true;
    }
  }
  inventarioZoomProducto = p;
  const $btnTrasladar = document.getElementById('inventario-zoom-trasladar');
  if ($btnTrasladar) {
    $btnTrasladar.hidden = !puedeGestionarInventario() || !puedeTrasladarProductoInventario(p);
  }
  $bd.classList.add('visible');
  $panel.classList.add('visible');
  $bd.setAttribute('aria-hidden', 'false');
  $panel.setAttribute('aria-hidden', 'false');
  inventarioZoomAbierto = true;
  document.body.classList.add('inventario-zoom-abierto');
}

function initInventarioProductoZoom() {
  const $bd = document.getElementById('inventario-producto-zoom-backdrop');
  const $panel = document.getElementById('inventario-producto-zoom-panel');
  const $cerrar = document.getElementById('inventario-zoom-cerrar');
  const $trasladar = document.getElementById('inventario-zoom-trasladar');
  if (!$bd || !$panel || initInventarioProductoZoom._done) return;
  initInventarioProductoZoom._done = true;
  $cerrar?.addEventListener('click', (e) => {
    e.stopPropagation();
    cerrarInventarioProductoZoom();
  });
  $trasladar?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (inventarioZoomProducto) window.ucAbrirModalTrasladarProducto?.(inventarioZoomProducto);
  });
  $bd.addEventListener('click', cerrarInventarioProductoZoom);
  $panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inventarioZoomAbierto) cerrarInventarioProductoZoom();
  });
}

function initModalTrasladarInventario() {
  if (initModalTrasladarInventario._done) return;
  initModalTrasladarInventario._done = true;

  const $modal = document.getElementById('modal-trasladar-inventario');
  const $nombre = document.getElementById('trasladar-producto-nombre');
  const $stockInfo = document.getElementById('trasladar-stock-disponible');
  const $cantidad = document.getElementById('trasladar-cantidad');
  const $cantidadMenos = document.getElementById('trasladar-cantidad-menos');
  const $cantidadMas = document.getElementById('trasladar-cantidad-mas');
  const $sucursalDestino = document.getElementById('trasladar-sucursal-destino');
  const $cancelar = document.getElementById('trasladar-cancelar');
  const $confirmar = document.getElementById('trasladar-confirmar');
  const trasladarSucursalDestinoUi = initCustomSelectBasico($sucursalDestino);
  let productoTrasladoActual = null;
  let guardandoTraslado = false;

  function cerrarModalTraslado() {
    $modal?.classList.remove('visible');
    $modal?.setAttribute('aria-hidden', 'true');
    trasladarSucursalDestinoUi?.cerrarOpciones?.();
    productoTrasladoActual = null;
    guardandoTraslado = false;
    if ($confirmar) {
      $confirmar.disabled = false;
      $confirmar.textContent = 'Trasladar';
    }
  }

  async function poblarSucursalesDestino(sucursalOrigenId) {
    if (!$sucursalDestino) return;
    $sucursalDestino.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Seleccionar sucursal';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.hidden = true;
    $sucursalDestino.appendChild(placeholder);
    try {
      const r = await fetch(`${API}/sucursales`, { headers: authHeaders(false) });
      if (!r.ok) throw new Error('No se pudieron cargar las sucursales');
      const sucursales = filtrarSucursalesActivas(await r.json());
      if (!Array.isArray(sucursales)) return;
      sucursales.forEach((s) => {
        const sid = Number(s.id);
        if (!Number.isFinite(sid) || sid === sucursalOrigenId) return;
        const opt = document.createElement('option');
        opt.value = String(sid);
        opt.textContent = s.nombre || `Sucursal ${sid}`;
        $sucursalDestino.appendChild(opt);
      });
    } catch (err) {
      console.error(err);
    }
    $sucursalDestino.selectedIndex = 0;
    trasladarSucursalDestinoUi?.refresh?.();
  }

  function actualizarMaxCantidadTraslado() {
    if (!$cantidad || !productoTrasladoActual) return;
    const max = Number(productoTrasladoActual.stock) || 0;
    $cantidad.max = String(Math.max(1, max));
    let val = parseInt($cantidad.value || '1', 10);
    if (!Number.isFinite(val) || val < 1) val = 1;
    if (val > max) val = max;
    $cantidad.value = String(val);
  }

  async function abrirModalTrasladarProducto(prod) {
    if (!puedeGestionarInventario()) return;
    if (!prod || !puedeTrasladarProductoInventario(prod)) {
      alert('Este producto no tiene stock disponible para trasladar');
      return;
    }
    const sucursalOrigenId = getSucursalIdProductoInventario(prod);
    if (!Number.isFinite(sucursalOrigenId)) {
      alert('No se pudo determinar la sucursal de origen del producto');
      return;
    }
    productoTrasladoActual = prod;
    if ($nombre) $nombre.textContent = nombreProductoInventarioDisplay(prod) || prod.nombre || 'Producto';
    if ($stockInfo) $stockInfo.textContent = `Stock disponible: ${prod.stock ?? 0}`;
    if ($cantidad) $cantidad.value = '1';
    await poblarSucursalesDestino(sucursalOrigenId);
    actualizarMaxCantidadTraslado();
    $modal?.classList.add('visible');
    $modal?.setAttribute('aria-hidden', 'false');
  }

  async function confirmarTraslado() {
    if (guardandoTraslado || !productoTrasladoActual) return;
    const cantidad = parseInt($cantidad?.value || '0', 10);
    const sucursalDestinoId = Number($sucursalDestino?.value);
    const stockMax = Number(productoTrasladoActual.stock) || 0;
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      alert('Ingresa una cantidad válida');
      return;
    }
    if (cantidad > stockMax) {
      alert(`Solo hay ${stockMax} unidades disponibles`);
      return;
    }
    if (!Number.isFinite(sucursalDestinoId)) {
      alert('Selecciona una sucursal destino');
      return;
    }
    guardandoTraslado = true;
    if ($confirmar) {
      $confirmar.disabled = true;
      $confirmar.textContent = 'Trasladando…';
    }
    try {
      const r = await fetch(`${API}/productos/trasladar`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          producto_id: productoTrasladoActual.id,
          cantidad,
          sucursal_destino_id: sucursalDestinoId,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data.error || 'No se pudo trasladar el inventario');
        return;
      }
      cerrarModalTraslado();
      cerrarInventarioProductoZoom();
      window.ucCerrarModalProducto?.();
      await window.ucCargarInventarioProductos?.({ forzar: true });
    } catch (err) {
      console.error(err);
      alert('Error de red al trasladar inventario');
    } finally {
      guardandoTraslado = false;
      if ($confirmar) {
        $confirmar.disabled = false;
        $confirmar.textContent = 'Trasladar';
      }
    }
  }

  $cantidadMenos?.addEventListener('click', () => {
    if (!$cantidad) return;
    const val = Math.max(1, parseInt($cantidad.value || '1', 10) - 1);
    $cantidad.value = String(val);
  });
  $cantidadMas?.addEventListener('click', () => {
    if (!$cantidad || !productoTrasladoActual) return;
    const max = Number(productoTrasladoActual.stock) || 1;
    const val = Math.min(max, parseInt($cantidad.value || '1', 10) + 1);
    $cantidad.value = String(val);
  });
  $cantidad?.addEventListener('input', actualizarMaxCantidadTraslado);
  redirigirWheelScrollPanelDesdeInputNumerico($modal?.querySelector('.modal-content'));
  $cancelar?.addEventListener('click', cerrarModalTraslado);
  $confirmar?.addEventListener('click', confirmarTraslado);
  $modal?.addEventListener('click', (e) => {
    if (e.target === $modal) cerrarModalTraslado();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $modal?.classList.contains('visible')) cerrarModalTraslado();
  });

  window.ucAbrirModalTrasladarProducto = abrirModalTrasladarProducto;
}

// ===================== MODAL AGREGAR PRODUCTO =====================

const IMAGEN_PRODUCTO_MAX_BYTES = 3 * 1024 * 1024;
const IMAGEN_PRODUCTO_MAX_BASE64 = 3_500_000;

function initProductoModal() {
  const $modal = document.getElementById('modal-producto');
  const $form = document.getElementById('form-producto');
  const $modalTitulo = document.getElementById('modal-producto-titulo');
  const $modalSubmit = document.getElementById('modal-producto-submit');
  let guardandoProductoModal = false;

  function bloquearEnvioProductoModal() {
    if (guardandoProductoModal) return false;
    guardandoProductoModal = true;
    if ($modalSubmit) {
      $modalSubmit.dataset.textoOriginal = $modalSubmit.textContent || '';
      $modalSubmit.disabled = true;
      $modalSubmit.textContent = 'Guardando…';
    }
    return true;
  }

  function desbloquearEnvioProductoModal() {
    guardandoProductoModal = false;
    if (!$modalSubmit) return;
    $modalSubmit.disabled = false;
    if ($modalSubmit.dataset.textoOriginal) {
      $modalSubmit.textContent = $modalSubmit.dataset.textoOriginal;
    }
  }

  const $categoria = document.getElementById('prod-categoria');
  const $camposMicas = document.getElementById('prod-campos-micas');
  const $camposFundas = document.getElementById('prod-campos-fundas');
  const $camposCargadores = document.getElementById('prod-campos-cargadores');
  const $camposAudifonos = document.getElementById('prod-campos-audifonos');
  const $camposPowerbanks = document.getElementById('prod-campos-powerbanks');
  const $camposBocinas = document.getElementById('prod-campos-bocinas');
  const $chipCristal = document.querySelector('.form-chip[data-tipo="cristal"]');
  const $chipHidrogel = document.querySelector('.form-chip[data-tipo="hidrogel"]');
  const $tipoCristalWrap = document.getElementById('prod-mica-cristal-opciones');
  const $tipoCristal = document.getElementById('prod-mica-tipo-cristal');
  const $tipoHidrogelWrap = document.getElementById('prod-mica-hidrogel-opciones');
  const $tipoHidrogel = document.getElementById('prod-mica-tipo-hidrogel');
  const $marcaModeloWrap = document.getElementById('prod-mica-marca-modelo');
  const $marca = document.getElementById('prod-mica-marca');
  const $micaSerieWrap = document.getElementById('prod-mica-serie-wrap');
  const $micaSerieCel = document.getElementById('prod-mica-serie-cel');
  const $modelo = document.getElementById('prod-mica-modelo');
  const $precio = document.getElementById('prod-precio');
  const $precioMenos = document.getElementById('prod-precio-menos');
  const $precioMas = document.getElementById('prod-precio-mas');
  const $prodPrecioWrap = document.getElementById('prod-precio-wrap');
  const $costoCompraWrap = document.getElementById('prod-costo-compra-wrap');
  const $costoCompra = document.getElementById('prod-costo-compra');
  const $costoCompraMenos = document.getElementById('prod-costo-compra-menos');
  const $costoCompraMas = document.getElementById('prod-costo-compra-mas');
  const $fundaRangoPrecioWrap = document.getElementById('prod-funda-rango-precio-wrap');
  const $fundaPrecioRangoTab = document.getElementById('prod-funda-precio-rango-tab');
  const $fundaPrecioFijoTab = document.getElementById('prod-funda-precio-fijo-tab');
  const $fundaPrecioRangoPanel = document.getElementById('prod-funda-precio-rango-panel');
  const $fundaPrecioFijoPanel = document.getElementById('prod-funda-precio-fijo-panel');
  const $fundaPrecioFijo = document.getElementById('prod-funda-precio-fijo');
  const $fundaPrecioFijoMenos = document.getElementById('prod-funda-precio-fijo-menos');
  const $fundaPrecioFijoMas = document.getElementById('prod-funda-precio-fijo-mas');
  let fundaModoPrecioFijo = false;
  const $labelPrecio = document.getElementById('prod-label-precio');
  const $precioVentaWrap = document.getElementById('prod-precio-venta-wrap');
  const $precioVenta = document.getElementById('prod-precio-venta');
  const $precioVentaMenos = document.getElementById('prod-precio-venta-menos');
  const $precioVentaMas = document.getElementById('prod-precio-venta-mas');
  const $labelStock = document.getElementById('prod-label-stock');
  const $stockWrap = document.getElementById('prod-stock-wrap');
  const $stockValor = document.getElementById('prod-stock-valor');
  const $stockMenos = document.getElementById('prod-stock-menos');
  const $stockMas = document.getElementById('prod-stock-mas');
  const $imagen = document.getElementById('prod-imagen');
  const $imagenNombre = document.getElementById('prod-imagen-nombre');
  const $imagenWrap = document.getElementById('prod-imagen-wrap');
  const $imagenPreviewWrap = document.getElementById('prod-imagen-preview-wrap');
  const $imagenPreview = document.getElementById('prod-imagen-preview');
  let imagenProductoActual = '';
  let imagenPendienteDataUrl = '';
  const $cancelar = document.getElementById('modal-producto-cancelar');
  const $eliminarWrap = document.getElementById('modal-producto-eliminar-wrap');
  const $eliminar = document.getElementById('modal-producto-eliminar');
  const $trasladarWrap = document.getElementById('modal-producto-trasladar-wrap');
  const $trasladar = document.getElementById('modal-producto-trasladar');

  const $fundaMarcaCel = document.getElementById('prod-funda-marca-cel');
  const $fundaSerieWrap = document.getElementById('prod-funda-serie-wrap');
  const $fundaSerieCel = document.getElementById('prod-funda-serie-cel');
  const $fundaModeloCel = document.getElementById('prod-funda-modelo-cel');

  const $cargadorTipo = document.getElementById('prod-cargador-tipo');
  const $cargadorMarca = document.getElementById('prod-cargador-marca');
  const $cargadorWattsWrap = document.getElementById('prod-cargador-watts-wrap');
  const $cargadorWatts = document.getElementById('prod-cargador-watts');
  const $cargadorWattsMenos = document.getElementById('prod-cargador-watts-menos');
  const $cargadorWattsMas = document.getElementById('prod-cargador-watts-mas');
  const $cargadorConexion = document.getElementById('prod-cargador-conexion');
  const $cargadorConexionLabel = document.getElementById('prod-cargador-conexion-label');
  const $cargadorMetrosWrap = document.getElementById('prod-cargador-metros-wrap');
  const $cargadorMetros = document.getElementById('prod-cargador-metros');
  const $cargadorMetrosMenos = document.getElementById('prod-cargador-metros-menos');
  const $cargadorMetrosMas = document.getElementById('prod-cargador-metros-mas');

  const $audifonosTipo = document.getElementById('prod-audifonos-tipo');
  const $audifonosConexion = document.getElementById('prod-audifonos-conexion');
  const $audifonosMarca = document.getElementById('prod-audifonos-marca');
  const $audifonosModelo = document.getElementById('prod-audifonos-modelo');

  const $powerbankMarca = document.getElementById('prod-powerbank-marca');
  const $powerbankModelo = document.getElementById('prod-powerbank-modelo');
  const $powerbankMah = document.getElementById('prod-powerbank-mah');
  const $powerbankMahMenos = document.getElementById('prod-powerbank-mah-menos');
  const $powerbankMahMas = document.getElementById('prod-powerbank-mah-mas');
  const $powerbankWatts = document.getElementById('prod-powerbank-watts');
  const $powerbankWattsMenos = document.getElementById('prod-powerbank-watts-menos');
  const $powerbankWattsMas = document.getElementById('prod-powerbank-watts-mas');
  const $powerbankConexion = document.getElementById('prod-powerbank-conexion');

  const $bocinaMarca = document.getElementById('prod-bocina-marca');
  const $bocinaModelo = document.getElementById('prod-bocina-modelo');
  const $bocinaWatts = document.getElementById('prod-bocina-watts');
  const $bocinaWattsMenos = document.getElementById('prod-bocina-watts-menos');
  const $bocinaWattsMas = document.getElementById('prod-bocina-watts-mas');
  const $bocinaColor = document.getElementById('prod-bocina-color');

  const customDropdowns = {};
  let cargandoEdicionProducto = false;
  let productoEditNombre = '';

  function mostrarBtnEliminarProducto(visible, esConsignado = false) {
    if ($eliminarWrap) $eliminarWrap.hidden = !visible;
    if ($eliminar) {
      $eliminar.textContent = esConsignado ? 'Eliminar producto consignado' : 'Eliminar producto';
    }
  }

  function mostrarBtnTrasladarProducto(visible) {
    if ($trasladarWrap) $trasladarWrap.hidden = !visible;
  }

  const iconPencil = UC_ICONO_EDITAR;

  const NO_PENCIL_IDS = ['prod-categoria', 'prod-mica-tipo-cristal', 'prod-mica-tipo-hidrogel', 'prod-cargador-tipo', 'prod-audifonos-tipo', 'prod-audifonos-conexion'];
  const MODELO_CEL_SELECT_IDS = new Set(['prod-mica-modelo', 'prod-funda-modelo-cel']);
  const MARCA_POR_MODELO_ID = {
    'prod-mica-modelo': 'prod-mica-marca',
    'prod-funda-modelo-cel': 'prod-funda-marca-cel',
  };
  const PREFIJO_MODELO_APPLE = 'iPhone ';

  function esMarcaAppleEnModelo($modeloSel) {
    const marcaId = MARCA_POR_MODELO_ID[$modeloSel?.id];
    if (!marcaId) return false;
    const $marcaSel = document.getElementById(marcaId);
    return $marcaSel?.value === 'Apple';
  }

  function valorInicialInputModelo($modeloSel, valorInicial, textoOpcionActual) {
    if (!MODELO_CEL_SELECT_IDS.has($modeloSel?.id) || !esMarcaAppleEnModelo($modeloSel)) {
      if (valorInicial !== undefined) return String(valorInicial);
      return textoOpcionActual || '';
    }
    if (valorInicial !== undefined && String(valorInicial).trim()) {
      return String(valorInicial);
    }
    const texto = String(textoOpcionActual || '').trim();
    if (texto) {
      return texto.startsWith('iPhone') ? texto : PREFIJO_MODELO_APPLE + texto;
    }
    return PREFIJO_MODELO_APPLE;
  }

  function enfocarInputModeloApple($modeloSel, customInput, valor) {
    if (!customInput || !MODELO_CEL_SELECT_IDS.has($modeloSel?.id) || !esMarcaAppleEnModelo($modeloSel)) return;
    if (!String(valor).startsWith(PREFIJO_MODELO_APPLE)) return;
    requestAnimationFrame(() => {
      customInput.focus();
      const pos = customInput.value.length;
      customInput.setSelectionRange(pos, pos);
    });
  }

  function textoPlaceholderSinPuntos(texto) {
    return String(texto || 'Seleccionar').trim().replace(/\.{3}$/u, '').replace(/…$/u, '');
  }

  function actualizarPreviewImagenProducto(src) {
    const url = src || imagenPendienteDataUrl || imagenProductoActual || '';
    if (!$imagenPreviewWrap || !$imagenPreview) return;

    $imagenPreview.onload = null;
    $imagenPreview.onerror = null;

    if (!url) {
      $imagenPreview.removeAttribute('src');
      $imagenPreview.alt = '';
      $imagenPreviewWrap.hidden = true;
      return;
    }

    function mostrarPreviewCargada() {
      $imagenPreview.alt = 'Vista previa del producto';
      $imagenPreviewWrap.hidden = false;
      $imagenPreview.onload = null;
      $imagenPreview.onerror = null;
    }

    function ocultarPreviewRota() {
      $imagenPreview.removeAttribute('src');
      $imagenPreview.alt = '';
      $imagenPreviewWrap.hidden = true;
      $imagenPreview.onload = null;
      $imagenPreview.onerror = null;
    }

    $imagenPreviewWrap.hidden = true;
    $imagenPreview.alt = '';
    $imagenPreview.onload = mostrarPreviewCargada;
    $imagenPreview.onerror = ocultarPreviewRota;
    $imagenPreview.src = url;
    if ($imagenPreview.complete && $imagenPreview.naturalWidth > 0) {
      mostrarPreviewCargada();
    }
  }

  function leerArchivoImagenProducto(file) {
    return new Promise((resolve) => {
      if (!file) {
        resolve({ data: null, error: null });
        return;
      }
      const maxMb = Math.round(IMAGEN_PRODUCTO_MAX_BYTES / 1024 / 1024);
      if (file.size > IMAGEN_PRODUCTO_MAX_BYTES) {
        resolve({ data: null, error: `La imagen es muy pesada (máx. ${maxMb} MB).` });
        return;
      }
      const img = new Image();
      const blobUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const maxSide = 1200;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ data: null, error: 'No se pudo procesar la imagen seleccionada.' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const usarPng = file.type === 'image/png';
        const data = canvas.toDataURL(usarPng ? 'image/png' : 'image/jpeg', usarPng ? undefined : 0.88);
        if (data.length > IMAGEN_PRODUCTO_MAX_BASE64) {
          resolve({ data: null, error: 'La imagen es demasiado grande. Usa otra foto.' });
          return;
        }
        resolve({ data, error: null });
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve({ data: null, error: 'No se pudo leer la imagen seleccionada.' });
      };
      img.src = blobUrl;
    });
  }

  async function resolverImagenParaGuardarProducto() {
    if (imagenPendienteDataUrl) {
      return { data: imagenPendienteDataUrl, error: null };
    }
    const file = $imagen?.files?.[0];
    if (file) {
      return leerArchivoImagenProducto(file);
    }
    if (imagenProductoActual) {
      return { data: imagenProductoActual, error: null };
    }
    return { data: null, error: null };
  }

  function placeholderSeleccionarDelSelect($select) {
    const first = $select.options[0];
    const raw = first?.value === '' ? (first.textContent || 'Seleccionar').trim() : 'Seleccionar';
    return textoPlaceholderSinPuntos(raw);
  }

  function placeholderModoIngresar(textoSeleccionar) {
    return textoPlaceholderSinPuntos(String(textoSeleccionar || 'Seleccionar').replace(/^Seleccionar/i, 'Ingresar'));
  }

  function createCustomDropdown($select) {
    if (!$select || customDropdowns[$select.id]) return customDropdowns[$select.id];
    const hasPencil = !NO_PENCIL_IDS.includes($select.id);
    const wrap = document.createElement('div');
    wrap.className = 'custom-select-wrap';
    $select.parentNode.insertBefore(wrap, $select);
    wrap.appendChild($select);

    const row = document.createElement('div');
    row.className = 'custom-select-row';
    wrap.appendChild(row);

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.setAttribute('tabindex', '0');
    row.appendChild(trigger);

    let btnToggle = null;
    let customInput = null;
    if (hasPencil) {
      customInput = document.createElement('input');
      customInput.type = 'text';
      customInput.className = 'custom-select-input';
      customInput.spellcheck = false;
      customInput.style.display = 'none';
      customInput.placeholder = placeholderModoIngresar(placeholderSeleccionarDelSelect($select));
      row.appendChild(customInput);

      btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.className = 'custom-select-pencil-btn';
      btnToggle.setAttribute('aria-label', 'Escribir valor personalizado');
      btnToggle.innerHTML = iconPencil;
      row.appendChild(btnToggle);
    } else {
      row.classList.add('no-pencil');
    }

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'custom-select-options';
    wrap.appendChild(optionsDiv);

    function removeCustomOption(exceptValue) {
      for (let i = $select.options.length - 1; i >= 0; i--) {
        const opt = $select.options[i];
        if (opt?.dataset?.custom === '1' && opt.value !== exceptValue) {
          opt.remove();
        }
      }
    }

    function getSelectedCustomOption() {
      const opt = $select.options[$select.selectedIndex];
      if (opt?.dataset?.custom === '1' && opt.value) {
        return { text: opt.textContent.trim(), value: opt.value };
      }
      return null;
    }

    function restoreCustomOption(keep) {
      if (!keep?.value) return;
      removeCustomOption(keep.value);
      const opt = new Option(keep.text, keep.value);
      opt.dataset.custom = '1';
      $select.add(opt);
      $select.value = keep.value;
    }

    function indiceOpcionPredefinida(texto) {
      const t = String(texto || '').trim();
      if (!t) return -1;
      for (let i = 0; i < $select.options.length; i++) {
        const opt = $select.options[i];
        if (!opt.value || opt.dataset.custom === '1') continue;
        if (opt.textContent.trim() === t || opt.value === t) return i;
      }
      return -1;
    }

    function switchToInput(valorInicial) {
      if (!hasPencil || !customInput || !btnToggle) return;
      removeCustomOption();
      $select.selectedIndex = 0;
      wrap.classList.add('input-mode');
      wrap.classList.remove('abierto');
      trigger.style.display = 'none';
      customInput.style.display = 'block';
      customInput.placeholder = placeholderModoIngresar(placeholderSeleccionarDelSelect($select));
      const opt = $select.options[$select.selectedIndex];
      const fromSelect = (opt && opt.value) ? opt.textContent : '';
      const valor = valorInicialInputModelo($select, valorInicial, fromSelect);
      customInput.value = valor;
      enfocarInputModeloApple($select, customInput, valor);
      btnToggle.classList.add('activo');
    }

    function switchToInputWithValue(valor) {
      switchToInput(valor ?? '');
    }

    function switchToDropdown() {
      if (!hasPencil || !customInput || !btnToggle) return;
      if (!wrap.classList.contains('input-mode')) return;
      const val = customInput.value.trim();
      removeCustomOption();
      const idx = indiceOpcionPredefinida(val);
      if (idx >= 0) {
        $select.selectedIndex = idx;
        wrap.classList.remove('input-mode');
        trigger.style.display = '';
        customInput.style.display = 'none';
        customInput.value = '';
        btnToggle.classList.remove('activo');
        syncDisplay();
        $select.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      $select.selectedIndex = 0;
      wrap.classList.remove('input-mode');
      trigger.style.display = '';
      customInput.style.display = 'none';
      customInput.value = '';
      btnToggle.classList.remove('activo');
      syncDisplay();
      $select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setDisabled(disabled) {
      $select.disabled = Boolean(disabled);
      wrap.classList.toggle('custom-select-wrap--disabled', Boolean(disabled));
      if (disabled) wrap.classList.remove('abierto');
    }

    function syncDisplay() {
      const opt = $select.options[$select.selectedIndex];
      const text = opt ? opt.textContent : '';
      const placeholder = placeholderSeleccionarDelSelect($select);
      trigger.textContent = (opt?.value === '' ? '' : text) || placeholder;
      trigger.classList.toggle('placeholder', opt?.value === '');
    }

    function buildOptions() {
      optionsDiv.innerHTML = '';
      for (let i = 0; i < $select.options.length; i++) {
        const opt = $select.options[i];
        if (opt.value === '' && i === 0) continue;
        const div = document.createElement('div');
        div.className = 'custom-select-option';
        div.textContent = opt.textContent;
        div.dataset.value = opt.value;
        div.dataset.index = String(i);
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          if ($select.disabled) return;
          $select.selectedIndex = parseInt(div.dataset.index, 10);
          $select.dispatchEvent(new Event('change', { bubbles: true }));
          syncDisplay();
          wrap.classList.remove('abierto');
        });
        optionsDiv.appendChild(div);
      }
    }

    function refresh() {
      const enModoInput = wrap.classList.contains('input-mode');
      const textoInput = enModoInput && customInput ? customInput.value : '';
      const keepCustom = getSelectedCustomOption();
      removeCustomOption(keepCustom?.value);
      buildOptions();
      if (keepCustom) restoreCustomOption(keepCustom);
      if (enModoInput && customInput) {
        switchToInputWithValue(textoInput);
        return;
      }
      syncDisplay();
    }

    if (hasPencil && btnToggle) {
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if ($select.disabled) return;
        if (wrap.classList.contains('input-mode')) {
          switchToDropdown();
        } else {
          switchToInput();
        }
      });
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if ($select.disabled) return;
      if (wrap.classList.contains('input-mode')) return;
      document.querySelectorAll('#modal-producto .custom-select-wrap.abierto').forEach(w => w.classList.remove('abierto'));
      const abriendo = !wrap.classList.contains('abierto');
      wrap.classList.toggle('abierto');
      if (abriendo) {
        if (!wrap.classList.contains('input-mode')) buildOptions();
        optionsDiv.scrollTop = 0;
      }
    });

    trigger.addEventListener('keydown', (e) => {
      if ($select.disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger.click();
      }
    });

    if (hasPencil && customInput) {
      customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') switchToDropdown();
      });
    }

    if (!customDropdowns._closeListener) {
      customDropdowns._closeListener = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#modal-producto .custom-select-wrap')) {
          document.querySelectorAll('#modal-producto .custom-select-wrap.abierto').forEach(w => w.classList.remove('abierto'));
        }
      });
    }

    refresh();
    customDropdowns[$select.id] = { refresh, syncDisplay, switchToDropdown, switchToInputWithValue, setDisabled, wrap };
    return customDropdowns[$select.id];
  }

  function setCategoriaProductoModalBloqueada(bloquear) {
    customDropdowns['prod-categoria']?.setDisabled?.(bloquear);
  }

  let modalModoConsignada = false;
  let costoCompraDomPlaceholder = null;

  function ocultarCostoCompraEnModal(ocultar) {
    if (!$costoCompraWrap) return;
    if (ocultar) {
      $costoCompraWrap.hidden = true;
      $costoCompraWrap.style.display = 'none';
      $costoCompraWrap.classList.add('uc-modal-oculto');
      if ($costoCompra) $costoCompra.value = '';
      if ($costoCompraWrap.isConnected && $costoCompraWrap.parentNode) {
        if (!costoCompraDomPlaceholder) {
          costoCompraDomPlaceholder = document.createComment('prod-costo-compra');
          $costoCompraWrap.parentNode.insertBefore(costoCompraDomPlaceholder, $costoCompraWrap);
        }
        $costoCompraWrap.remove();
      }
      return;
    }
    $costoCompraWrap.classList.remove('uc-modal-oculto');
    $costoCompraWrap.hidden = false;
    $costoCompraWrap.style.display = '';
    if (costoCompraDomPlaceholder?.parentNode && !$costoCompraWrap.isConnected) {
      costoCompraDomPlaceholder.parentNode.insertBefore(
        $costoCompraWrap,
        costoCompraDomPlaceholder.nextSibling
      );
    }
  }

  function leerMontoInput($input) {
    const raw = String($input?.value ?? '').trim().replace(',', '.');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : NaN;
  }

  function validarMontosConsignada(costoConsignacion, precioVenta) {
    if (!Number.isFinite(costoConsignacion) || costoConsignacion <= 0) {
      return { ok: false, msg: 'Ingresa un costo de consignación válido' };
    }
    if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
      return { ok: false, msg: 'Ingresa un precio de venta válido' };
    }
    if (Math.round(costoConsignacion * 100) > Math.round(precioVenta * 100)) {
      return { ok: false, msg: 'El costo de consignación no puede ser mayor al precio de venta' };
    }
    return { ok: true };
  }

  function esModoConsignadaModal() {
    if (modalModoConsignada) return true;
    if ($form?.dataset?.modo === 'consignada') return true;
    const modalAbierto = $modal?.classList.contains('visible');
    const wrapVisible = $precioVentaWrap && !$precioVentaWrap.hidden;
    return Boolean(modalAbierto && wrapVisible);
  }

  function aplicarModoModalConsignada(consignada) {
    modalModoConsignada = consignada;
    if ($form) {
      if (consignada) $form.dataset.modo = 'consignada';
      else delete $form.dataset.modo;
    }
    if ($modal) {
      if (consignada) $modal.setAttribute('data-modo-consignada', '1');
      else $modal.removeAttribute('data-modo-consignada');
    }
    if ($labelPrecio) $labelPrecio.textContent = consignada ? 'Costo de consignación' : 'Precio de venta';
    if ($precioVentaWrap) $precioVentaWrap.hidden = !consignada;
    ocultarCostoCompraEnModal(consignada);
    if ($stockWrap) $stockWrap.hidden = consignada;
    if ($imagenWrap) $imagenWrap.hidden = consignada;
    actualizarVisibilidadPrecioFundas();
    if ($precio) $precio.setAttribute('aria-label', consignada ? 'Costo de consignación' : 'Precio de venta');
    if ($modalTitulo) $modalTitulo.textContent = consignada ? 'Producto consignado' : 'Agregar producto';
    if ($modalSubmit) {
      $modalSubmit.textContent = consignada ? 'Guardar producto consignado' : 'Agregar producto';
    }
    if (consignada && $precioVenta) $precioVenta.value = '';
  }

  document.querySelectorAll('#modal-producto select').forEach($s => createCustomDropdown($s));
  document.querySelectorAll('#modal-producto input, #modal-producto textarea').forEach((el) => {
    el.spellcheck = false;
  });

  function esCategoriaFundasActiva() {
    return $categoria?.value === 'fundas';
  }

  function esFundaPrecioFijoActivo() {
    return fundaModoPrecioFijo;
  }

  function aplicarModoPrecioFunda(fijo) {
    fundaModoPrecioFijo = fijo;
    $fundaPrecioRangoTab?.classList.toggle('activo', !fijo);
    $fundaPrecioFijoTab?.classList.toggle('activo', fijo);
    $fundaPrecioRangoTab?.setAttribute('aria-selected', fijo ? 'false' : 'true');
    $fundaPrecioFijoTab?.setAttribute('aria-selected', fijo ? 'true' : 'false');
    if ($fundaPrecioRangoPanel) $fundaPrecioRangoPanel.hidden = fijo;
    if ($fundaPrecioFijoPanel) $fundaPrecioFijoPanel.hidden = !fijo;
    if (fijo) {
      initSliderRangoFundasProducto();
    } else {
      actualizarUiSliderRangoFundas();
    }
  }

  function resetPrecioFundasForm() {
    aplicarModoPrecioFunda(false);
    resetRangoPrecioFundasForm();
    if ($fundaPrecioFijo) $fundaPrecioFijo.value = '';
  }

  function actualizarVisibilidadPrecioFundas() {
    if (esModoConsignadaModal()) {
      ocultarCostoCompraEnModal(true);
      if ($fundaRangoPrecioWrap) $fundaRangoPrecioWrap.hidden = true;
      if ($prodPrecioWrap) $prodPrecioWrap.hidden = false;
      return;
    }
    const esFundas = esCategoriaFundasActiva();
    if ($prodPrecioWrap) $prodPrecioWrap.hidden = esFundas;
    if ($fundaRangoPrecioWrap) $fundaRangoPrecioWrap.hidden = !esFundas;
    ocultarCostoCompraEnModal(false);
    if (esFundas) {
      initSliderRangoFundasProducto();
      actualizarUiSliderRangoFundas();
    }
  }

  function salirModoInputCustomDropdownsModal() {
    Object.keys(customDropdowns).forEach((id) => {
      if (id === '_closeListener') return;
      const wrap = customDropdowns[id]?.wrap;
      if (!wrap?.classList.contains('input-mode')) return;
      wrap.classList.remove('input-mode');
      const trigger = wrap.querySelector('.custom-select-trigger');
      const customInput = wrap.querySelector('.custom-select-input');
      const btnToggle = wrap.querySelector('.custom-select-pencil-btn');
      if (trigger) trigger.style.display = '';
      if (customInput) {
        customInput.style.display = 'none';
        customInput.value = '';
      }
      btnToggle?.classList.remove('activo');
    });
  }

  function resetModal() {
    if ($categoria) $categoria.value = '';
    if ($camposMicas) $camposMicas.style.display = 'none';
    if ($camposFundas) $camposFundas.style.display = 'none';
    if ($camposCargadores) $camposCargadores.style.display = 'none';
    if ($camposAudifonos) $camposAudifonos.style.display = 'none';
    if ($camposPowerbanks) $camposPowerbanks.style.display = 'none';
    if ($camposBocinas) $camposBocinas.style.display = 'none';
    $chipCristal?.classList.remove('activo');
    $chipHidrogel?.classList.remove('activo');
    $tipoCristalWrap.style.display = 'none';
    $tipoCristal.value = '';
    $tipoHidrogelWrap.style.display = 'none';
    $tipoHidrogel.value = '';
    $marcaModeloWrap.style.display = 'none';
    $marca.innerHTML = '<option value="">Seleccionar marca</option>';
    if ($micaSerieWrap) $micaSerieWrap.style.display = 'none';
    if ($micaSerieCel) $micaSerieCel.innerHTML = '<option value="">Seleccionar serie</option>';
    $modelo.innerHTML = '<option value="">Seleccionar modelo</option>';
    if ($fundaMarcaCel) $fundaMarcaCel.value = '';
    if ($fundaSerieWrap) $fundaSerieWrap.style.display = 'none';
    if ($fundaSerieCel) $fundaSerieCel.innerHTML = '<option value="">Seleccionar serie</option>';
    if ($fundaModeloCel) $fundaModeloCel.innerHTML = '<option value="">Seleccionar modelo</option>';
    customDropdowns['prod-funda-serie-cel']?.refresh();
    customDropdowns['prod-funda-modelo-cel']?.refresh();
    if ($cargadorTipo) $cargadorTipo.value = '';
    if ($cargadorMarca) $cargadorMarca.value = '';
    if ($cargadorWatts) $cargadorWatts.value = '0';
    if ($cargadorConexion) $cargadorConexion.value = '';
    if ($cargadorMetros) $cargadorMetros.value = '1';
    if ($audifonosTipo) $audifonosTipo.value = '';
    if ($audifonosConexion) $audifonosConexion.value = '';
    if ($audifonosMarca) $audifonosMarca.value = '';
    if ($audifonosModelo) $audifonosModelo.value = '';
    if ($powerbankMarca) $powerbankMarca.value = '';
    if ($powerbankModelo) $powerbankModelo.value = '';
    if ($powerbankMah) $powerbankMah.value = '10000';
    if ($powerbankWatts) $powerbankWatts.value = '0';
    if ($powerbankConexion) $powerbankConexion.value = '';
    if ($bocinaMarca) $bocinaMarca.value = '';
    if ($bocinaModelo) $bocinaModelo.value = '';
    if ($bocinaWatts) $bocinaWatts.value = '0';
    if ($bocinaColor) $bocinaColor.value = '';
    $precio.value = '';
    if ($costoCompra) $costoCompra.value = '';
    resetPrecioFundasForm();
    if ($prodPrecioWrap) $prodPrecioWrap.hidden = false;
    if ($fundaRangoPrecioWrap) $fundaRangoPrecioWrap.hidden = true;
    if ($stockValor) $stockValor.value = '';
    if ($imagen) $imagen.value = '';
    if ($imagenNombre) $imagenNombre.textContent = '';
    delete $form?.dataset.editId;
    delete $form?.dataset.editSucursalId;
    delete $form?.dataset.editConsignadoId;
    delete $form?.dataset.editConsignadoSucursalId;
    delete $form?.dataset.modo;
    imagenProductoActual = '';
    imagenPendienteDataUrl = '';
    actualizarPreviewImagenProducto('');
    modalModoConsignada = false;
    if ($modal) $modal.removeAttribute('data-modo-consignada');
    if ($labelPrecio) $labelPrecio.textContent = 'Precio de venta';
    if ($labelStock) $labelStock.textContent = 'Stock';
    if ($precioVentaWrap) $precioVentaWrap.hidden = true;
    ocultarCostoCompraEnModal(false);
    if ($stockWrap) $stockWrap.hidden = false;
    if ($imagenWrap) $imagenWrap.hidden = false;
    if ($precioVenta) $precioVenta.value = '';
    if ($precio) $precio.setAttribute('aria-label', 'Precio de venta');
    if ($stockValor) {
      $stockValor.value = '';
      $stockValor.setAttribute('aria-label', 'Cantidad en stock');
    }
    if ($modalTitulo) $modalTitulo.textContent = 'Agregar producto';
    if ($modalSubmit) $modalSubmit.textContent = 'Agregar producto';
    productoEditNombre = '';
    mostrarBtnEliminarProducto(false);
    mostrarBtnTrasladarProducto(false);
    setCategoriaProductoModalBloqueada(false);
    desbloquearEnvioProductoModal();
    actualizarCamposCargadorTipo();
    salirModoInputCustomDropdownsModal();
    document.querySelectorAll('#modal-producto .custom-select-wrap.abierto').forEach(w => w.classList.remove('abierto'));
    Object.keys(customDropdowns).forEach(id => {
      if (id === '_closeListener') return;
      customDropdowns[id].refresh?.();
      customDropdowns[id].syncDisplay?.();
    });
  }

  function asignarValorSelect($select, texto) {
    if (!$select || texto == null || texto === '') return;
    const t = String(texto).trim();
    const dd = customDropdowns[$select.id];
    for (let i = 0; i < $select.options.length; i++) {
      const opt = $select.options[i];
      if (!opt.value || opt.dataset.custom === '1') continue;
      if (opt.textContent.trim() === t || opt.value === t) {
        if (dd?.wrap?.classList.contains('input-mode')) dd.switchToDropdown?.();
        $select.value = opt.value;
        dd?.syncDisplay?.();
        return;
      }
    }
    if (dd?.switchToInputWithValue) {
      dd.switchToInputWithValue(t);
      return;
    }
    const opt = new Option(t, t);
    opt.dataset.custom = '1';
    $select.add(opt);
    $select.value = t;
    dd?.syncDisplay?.();
  }

  function setSelectValorPorTexto($select, texto) {
    asignarValorSelect($select, texto);
  }

  function aplicarValorSelectOTextoLibre($select, texto) {
    asignarValorSelect($select, texto);
  }

  function poblarSelectMarcasCel($marcaSel, $modeloSel, $serieWrap, $serieSel) {
    if (!$marcaSel) return;
    $marcaSel.innerHTML = '<option value="">Seleccionar marca</option>' +
      Object.keys(MARCAS_MODELOS).map((m) => `<option value="${m}">${m}</option>`).join('');
    customDropdowns[$marcaSel.id]?.refresh?.();
    if ($serieWrap) $serieWrap.style.display = 'none';
    if ($serieSel) {
      $serieSel.innerHTML = '<option value="">Seleccionar serie</option>';
      customDropdowns[$serieSel.id]?.refresh?.();
    }
    if ($modeloSel) {
      $modeloSel.innerHTML = '<option value="">Seleccionar modelo</option>';
      customDropdowns[$modeloSel.id]?.refresh?.();
    }
  }

  function poblarSelectSeriesSamsung($serieSel) {
    if (!$serieSel) return;
    $serieSel.innerHTML = '<option value="">Seleccionar serie</option>' +
      Object.keys(SAMSUNG_SERIES).map((s) => `<option value="${s}">${s}</option>`).join('');
    customDropdowns[$serieSel.id]?.refresh?.();
  }

  function inferirSerieSamsung(modelo) {
    const m = String(modelo || '').trim();
    if (!m) return '';
    for (const [serie, modelos] of Object.entries(SAMSUNG_SERIES)) {
      if (modelos.includes(m)) return serie;
    }
    if (m.startsWith('Galaxy S')) return 'Galaxy S';
    if (m.startsWith('Galaxy A')) return 'Galaxy A';
    if (m.startsWith('Galaxy Z')) return 'Galaxy Z';
    if (m.startsWith('Galaxy Note')) return 'Galaxy Note';
    return '';
  }

  function actualizarUiSerieSamsung($serieWrap, $serieSel, $modeloSel, marca, seriePrefijada) {
    const esSamsung = marca === 'Samsung';
    if ($serieWrap) $serieWrap.style.display = esSamsung ? '' : 'none';
    if (!esSamsung) {
      if ($serieSel) $serieSel.value = '';
      return;
    }
    poblarSelectSeriesSamsung($serieSel);
    if (seriePrefijada) asignarValorSelect($serieSel, seriePrefijada);
  }

  function poblarModelosParaMarca($marcaSel, $modeloSel, marca, serie) {
    if (!$modeloSel) return;
    let modelos = MARCAS_MODELOS[marca] || [];
    if (marca === 'Samsung') {
      modelos = serie && SAMSUNG_SERIES[serie] ? SAMSUNG_SERIES[serie] : [];
    }
    $modeloSel.innerHTML = '<option value="">Seleccionar modelo</option>' +
      modelos.map((m) => `<option value="${m}">${m}</option>`).join('');
    customDropdowns[$modeloSel.id]?.refresh?.();
  }

  function onMarcaCelChange($marcaSel, $modeloSel, $serieWrap, $serieSel) {
    const marca = $marcaSel?.value || '';
    actualizarUiSerieSamsung($serieWrap, $serieSel, $modeloSel, marca);
    if (marca === 'Samsung') {
      poblarModelosParaMarca($marcaSel, $modeloSel, marca);
      return;
    }
    if (marca) poblarModelosParaMarca($marcaSel, $modeloSel, marca);
    else if ($modeloSel) {
      $modeloSel.innerHTML = '<option value="">Seleccionar modelo</option>';
      customDropdowns[$modeloSel.id]?.refresh?.();
    }
  }

  function getSerieElementsForMarca($marcaSel) {
    if ($marcaSel?.id === 'prod-mica-marca') {
      return { wrap: $micaSerieWrap, sel: $micaSerieCel };
    }
    if ($marcaSel?.id === 'prod-funda-marca-cel') {
      return { wrap: $fundaSerieWrap, sel: $fundaSerieCel };
    }
    return { wrap: null, sel: null };
  }

  function asignarMarcaYModeloEnSelects($marcaSel, $modeloSel, marcaTexto, modeloTexto) {
    const marca = String(marcaTexto || '').trim();
    const modelo = String(modeloTexto || '').trim();
    const { wrap: $serieWrap, sel: $serieSel } = getSerieElementsForMarca($marcaSel);
    if (!marca) {
      if (modelo) asignarValorSelect($modeloSel, modelo);
      return;
    }
    if (MARCAS_MODELOS[marca]) {
      if ($marcaSel.options.length <= 1) poblarSelectMarcasCel($marcaSel, $modeloSel, $serieWrap, $serieSel);
      asignarValorSelect($marcaSel, marca);
      const serie = marca === 'Samsung' ? inferirSerieSamsung(modelo) : '';
      actualizarUiSerieSamsung($serieWrap, $serieSel, $modeloSel, marca, serie);
      poblarModelosParaMarca($marcaSel, $modeloSel, marca, serie);
      if (modelo) asignarValorSelect($modeloSel, modelo);
      return;
    }
    if ($marcaSel.options.length <= 1) poblarSelectMarcasCel($marcaSel, $modeloSel, $serieWrap, $serieSel);
    asignarValorSelect($marcaSel, marca);
    actualizarUiSerieSamsung($serieWrap, $serieSel, $modeloSel, marca);
    if (modelo) asignarValorSelect($modeloSel, modelo);
  }

  function refrescarDropdownsModalProducto() {
    Object.keys(customDropdowns).forEach((id) => {
      if (id === '_closeListener') return;
      const d = customDropdowns[id];
      d.refresh?.();
      if (!d.wrap?.classList.contains('input-mode')) d.syncDisplay?.();
    });
  }

  function opcionesTextoSelect($select) {
    if (!$select) return [];
    return Array.from($select.options)
      .filter((o) => o.value)
      .map((o) => ({ value: o.value, text: o.textContent.trim() }))
      .sort((a, b) => b.text.length - a.text.length);
  }

  function limpiarNombreProducto(texto) {
    return String(texto || '')
      .replace(/^[\s·]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limpiarTextoCampoProducto(texto) {
    return String(texto || '').replace(/^[\s·]+/, '').trim();
  }

  function normalizarSeparadoresNombre(texto) {
    return String(texto || '')
      .replace(/\s*·\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extraerMarcaModeloDesdeRestoAudifonos(resto) {
    const s = String(resto || '').trim();
    if (!s) return { marca: '', modelo: '' };
    const marcas = Array.from($audifonosMarca?.options || [])
      .filter((o) => o.value)
      .map((o) => o.textContent.trim())
      .sort((a, b) => b.length - a.length);
    for (const m of marcas) {
      if (s === m || s.endsWith(` ${m}`)) {
        return { marca: m, modelo: s.slice(0, s.length - m.length).trim() };
      }
    }
    const sp = s.lastIndexOf(' ');
    if (sp > 0) {
      return { marca: s.slice(sp + 1).trim(), modelo: s.slice(0, sp).trim() };
    }
    return { marca: '', modelo: s };
  }

  function parsearCargadorDesdeNombre(nombre) {
    let s = normalizarSeparadoresNombre(nombre);
    let connText = '';
    let wattsVal = null;
    let metrosVal = null;

    const metrosM = s.match(/\s+de\s+(\d+(?:[.,]\d+)?)\s*m\s*$/i);
    if (metrosM) {
      metrosVal = parseFloat(metrosM[1].replace(',', '.')) || 1;
      s = s.slice(0, metrosM.index).trim();
    }
    const connM = s.match(/\s+(entrada|conexion)\s+(.+)$/i);
    if (connM) {
      connText = connM[2].trim();
      s = s.slice(0, connM.index).trim();
    }
    const deW = s.match(/\s+de\s+(\d+)W\s*$/i);
    if (deW) {
      wattsVal = deW[1];
      s = s.slice(0, deW.index).trim();
    }

    const prefijosTipo = [
      { re: /^Cargador\s+Completo\s+/i, tipo: 'Completo' },
      { re: /^Cable\s+/i, tipo: 'Cable' },
      { re: /^Cubo\s+/i, tipo: 'Cubo' },
    ];
    let tipoOk = false;
    for (const p of prefijosTipo) {
      if (p.re.test(s)) {
        asignarValorSelect($cargadorTipo, p.tipo);
        s = s.replace(p.re, '').trim();
        tipoOk = true;
        break;
      }
    }
    if (!tipoOk) {
      const tiposOpts = opcionesTextoSelect($cargadorTipo).sort((a, b) => b.text.length - a.text.length);
      for (const o of tiposOpts) {
        if (s === o.text || s.startsWith(`${o.text} `)) {
          asignarValorSelect($cargadorTipo, o.text);
          s = s === o.text ? '' : s.slice(o.text.length).trim();
          tipoOk = true;
          break;
        }
      }
    }
    if (!tipoOk && s) asignarValorSelect($cargadorTipo, s);

    actualizarCamposCargadorTipo();
    if (s && $cargadorMarca) $cargadorMarca.value = s;
    if (wattsVal != null && $cargadorWatts) $cargadorWatts.value = wattsVal;
    if (metrosVal != null && $cargadorMetros) $cargadorMetros.value = String(metrosVal);
    if (connText) asignarValorSelect($cargadorConexion, connText);
  }

  function parsearPowerbankDesdeNombre(nombre) {
    let s = limpiarNombreProducto(nombre)
      .replace(/^Power\s*bank\s+/i, '')
      .trim();
    s = normalizarSeparadoresNombre(s);
    let connText = '';

    const conMatch = s.match(/\s+con\s+(.+)$/i);
    if (conMatch) {
      connText = conMatch[1].trim();
      s = s.slice(0, conMatch.index).trim();
    }
    const specsMatch = s.match(/\s+de\s+(\d+)\s*mAh\s+y\s+(\d+)W\s*$/i);
    if (specsMatch) {
      if ($powerbankMah) $powerbankMah.value = specsMatch[1];
      if ($powerbankWatts) $powerbankWatts.value = specsMatch[2];
      s = s.slice(0, specsMatch.index).trim();
    } else {
      const mahM = s.match(/\s+(\d+)\s*mAh\s+/i);
      const wattsM = s.match(/\s+(\d+)W\s*$/i);
      if (mahM && wattsM && $powerbankMah && $powerbankWatts) {
        $powerbankMah.value = mahM[1];
        $powerbankWatts.value = wattsM[1];
        s = s.slice(0, mahM.index).trim();
      }
    }
    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      if ($powerbankMarca) $powerbankMarca.value = limpiarTextoCampoProducto(tokens[0]);
      if ($powerbankModelo) $powerbankModelo.value = tokens.slice(1).join(' ');
    } else if (tokens.length === 1 && $powerbankMarca) {
      $powerbankMarca.value = limpiarTextoCampoProducto(tokens[0]);
    }
    if (connText) asignarValorSelect($powerbankConexion, connText);
  }

  function parsearBocinaDesdeNombre(nombre) {
    let s = limpiarNombreProducto(nombre).replace(/^Bocina\s+/i, '').trim();
    if (!s) return;
    s = normalizarSeparadoresNombre(s);

    const colores = opcionesTextoSelect($bocinaColor).sort((a, b) => b.text.length - a.text.length);
    let colorAsignado = false;
    for (const o of colores) {
      const esc = o.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\s+${esc}$`, 'i');
      if (re.test(s) || s.toLowerCase() === o.text.toLowerCase()) {
        asignarValorSelect($bocinaColor, o.text);
        s = s.slice(0, s.length - o.text.length).trim();
        colorAsignado = true;
        break;
      }
    }
    if (!colorAsignado && s.includes(' ')) {
      const ult = s.lastIndexOf(' ');
      const posibleColor = s.slice(ult + 1).trim();
      if (posibleColor && !/^\d+W$/i.test(posibleColor)) {
        asignarValorSelect($bocinaColor, posibleColor);
        s = s.slice(0, ult).trim();
      }
    }

    const wattsM = s.match(/\s+(\d+)W\s*$/i);
    if (wattsM && $bocinaWatts) {
      $bocinaWatts.value = wattsM[1];
      s = s.slice(0, wattsM.index).trim();
    }

    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length >= 1) asignarValorSelect($bocinaMarca, tokens[0]);
    if (tokens.length >= 2 && $bocinaModelo) {
      $bocinaModelo.value = tokens.slice(1).join(' ');
    }
  }

  function normalizarConexionAudifonos(texto) {
    const map = {
      Alámbrico: 'Alámbrica',
      Alámbricos: 'Alámbrica',
      Inalámbrico: 'Inalámbrica',
      Inalámbricos: 'Inalámbrica',
      Híbrido: 'Híbrida',
      Híbridos: 'Híbrida',
    };
    return map[String(texto || '').trim()] || String(texto || '').trim();
  }

  function extraerPartesAudifonosPorEspacios(s) {
    let resto = String(s || '').trim();
    let conn = '';
    const etiquetasConn = [
      'Alámbrica', 'Inalámbrica', 'Híbrida',
      'Alámbricos', 'Inalámbricos', 'Híbridos',
      'Alámbrico', 'Inalámbrico', 'Híbrido',
    ].sort((a, b) => b.length - a.length);
    for (const c of etiquetasConn) {
      if (resto.endsWith(c)) {
        conn = normalizarConexionAudifonos(c);
        resto = resto.slice(0, resto.length - c.length).trim();
        break;
      }
    }
    let tipo = '';
    if (resto.endsWith('In Ear')) {
      tipo = 'In Ear';
      resto = resto.slice(0, -6).trim();
    } else if (resto.endsWith('Diadema')) {
      tipo = 'Diadema';
      resto = resto.slice(0, -7).trim();
    }
    const mmAud = extraerMarcaModeloDesdeRestoAudifonos(resto);
    return { modelo: mmAud.modelo, marca: mmAud.marca, tipo, conn };
  }

  function extraerPartesAudifonosDesdeNombre(nombre) {
    let s = limpiarNombreProducto(nombre).replace(/^Audífonos\s*(?:·\s*)?/i, '').trim();
    if (!s) return { modelo: '', marca: '', tipo: '', conn: '' };

    if (/\s+tipo\s+/i.test(s) || /\s+conexion\s+/i.test(s)) {
      let conn = '';
      let tipo = '';
      let resto = s;
      const conMatch = resto.match(/\s+conexion\s+(.+)$/i);
      if (conMatch) {
        conn = normalizarConexionAudifonos(conMatch[1].trim());
        resto = resto.slice(0, conMatch.index).trim();
      }
      const tipoMatch = resto.match(/\s+tipo\s+(.+)$/i);
      if (tipoMatch) {
        tipo = tipoMatch[1].trim();
        resto = resto.slice(0, tipoMatch.index).trim();
      }
      const mmAud = extraerMarcaModeloDesdeRestoAudifonos(resto);
      return { modelo: mmAud.modelo, marca: mmAud.marca, tipo, conn };
    }

    if (s.includes(' · ')) {
      const partes = s.split(' · ').map((p) => p.trim()).filter(Boolean);
      const tiposConocidos = ['Diadema', 'In Ear'];
      if (partes.length >= 4) {
        if (tiposConocidos.includes(partes[0])) {
          return {
            tipo: partes[0],
            conn: normalizarConexionAudifonos(partes[1]),
            marca: partes[2],
            modelo: partes[3],
          };
        }
        return {
          modelo: partes[0],
          marca: partes[1],
          tipo: partes[2],
          conn: normalizarConexionAudifonos(partes[3]),
        };
      }
    }

    return extraerPartesAudifonosPorEspacios(s);
  }

  function parsearNombreEnFormulario(prod) {
    const nombre = prod.nombre || '';
    const cat = prod.categoria || '';

    if (cat === 'fundas') {
      let s = nombre.replace(/^Funda\s+/i, '').trim();
      s = s.replace(/\s+—\s+Rango\s+[\d-]+\s*$/i, '').trim();
      const dashIdx = s.indexOf(' — ');
      if (dashIdx >= 0) s = s.slice(0, dashIdx).trim();
      poblarSelectMarcasCel($fundaMarcaCel, $fundaModeloCel, $fundaSerieWrap, $fundaSerieCel);
      const mm = extraerMarcaModeloCel(s) || inferirMarcaDesdeModelo(s);
      if (mm) {
        asignarMarcaYModeloEnSelects($fundaMarcaCel, $fundaModeloCel, mm.marca, mm.modelo);
        customDropdowns['prod-funda-marca-cel']?.syncDisplay?.();
        customDropdowns['prod-funda-modelo-cel']?.syncDisplay?.();
      }
      return;
    }

    if (cat === 'micas') {
      if (/^Mica\s+cristal\s+/i.test(nombre)) {
        $chipCristal?.classList.add('activo');
        $chipHidrogel?.classList.remove('activo');
        $tipoCristalWrap.style.display = 'block';
        $tipoHidrogelWrap.style.display = 'none';
        let rest = nombre.replace(/^Mica\s+cristal\s+/i, '').trim();
        const dash = rest.indexOf(' — ');
        let mmPart = rest;
        if (dash >= 0) {
          mmPart = rest.slice(dash + 3).trim();
          const tipoPart = rest.slice(0, dash).trim();
          asignarValorSelect($tipoCristal, tipoPart);
        } else {
          const sp = rest.indexOf(' ');
          if (sp > 0) {
            asignarValorSelect($tipoCristal, rest.slice(0, sp));
            mmPart = rest.slice(sp + 1).trim();
          }
        }
        const mm = extraerMarcaModeloCel(mmPart);
        if (mm) {
          $marcaModeloWrap.style.display = 'block';
          poblarSelectMarcasCel($marca, $modelo, $micaSerieWrap, $micaSerieCel);
          asignarMarcaYModeloEnSelects($marca, $modelo, mm.marca, mm.modelo);
        } else if (mmPart) {
          $marcaModeloWrap.style.display = 'block';
          poblarSelectMarcasCel($marca, $modelo, $micaSerieWrap, $micaSerieCel);
          asignarValorSelect($marca, mmPart);
        }
        return;
      }
      if (/^Mica\s+hidrogel\s+/i.test(nombre)) {
        $chipHidrogel?.classList.add('activo');
        $chipCristal?.classList.remove('activo');
        $tipoHidrogelWrap.style.display = 'block';
        $tipoCristalWrap.style.display = 'none';
        const tipoPart = nombre.replace(/^Mica\s+hidrogel\s+/i, '').trim();
        asignarValorSelect($tipoHidrogel, tipoPart);
      }
      return;
    }

    if (cat === 'cargadores' && (/^Cargador\s+/i.test(nombre) || /^Cable\s+/i.test(nombre) || /^Cubo\s+/i.test(nombre))) {
      parsearCargadorDesdeNombre(nombre);
    }

    if (cat === 'powerbanks') {
      parsearPowerbankDesdeNombre(nombre);
    }

    if (cat === 'audifonos') {
      const p = extraerPartesAudifonosDesdeNombre(nombre);
      if (p.modelo && $audifonosModelo) $audifonosModelo.value = p.modelo;
      if (p.marca) asignarValorSelect($audifonosMarca, p.marca);
      if (p.tipo) asignarValorSelect($audifonosTipo, p.tipo);
      if (p.conn) asignarValorSelect($audifonosConexion, p.conn);
    }

    if (cat === 'bocinas') {
      parsearBocinaDesdeNombre(nombre);
    }
  }

  function cargarProductoEnFormulario(prod) {
    if (!prod) return;
    cargandoEdicionProducto = true;
    if ($precio) $precio.value = String(prod.precio ?? '');
    if (prod.categoria === 'fundas') {
      if (productoFundaTieneRangoPrecio(prod)) {
        aplicarModoPrecioFunda(false);
        establecerRangoPrecioFundasForm(getPrecioMinProducto(prod), getPrecioMaxProducto(prod));
      } else {
        aplicarModoPrecioFunda(true);
        if ($fundaPrecioFijo) {
          const precioFijo = getPrecioMinProducto(prod);
          $fundaPrecioFijo.value = precioFijo > 0 ? String(precioFijo) : '';
        }
      }
    }
    if ($stockValor) {
      const stock = Number(prod.stock) || 0;
      $stockValor.value = stock > 0 ? String(stock) : '';
    }
    if ($categoria) {
      $categoria.value = prod.categoria || '';
      $categoria.dispatchEvent(new Event('change'));
    }
    parsearNombreEnFormulario(prod);
    refrescarDropdownsModalProducto();
    requestAnimationFrame(() => {
      refrescarDropdownsModalProducto();
      if (prod.categoria === 'fundas') {
        if (productoFundaTieneRangoPrecio(prod)) {
          aplicarModoPrecioFunda(false);
          establecerRangoPrecioFundasForm(getPrecioMinProducto(prod), getPrecioMaxProducto(prod));
        } else {
          aplicarModoPrecioFunda(true);
          if ($fundaPrecioFijo) {
            const precioFijo = getPrecioMinProducto(prod);
            $fundaPrecioFijo.value = precioFijo > 0 ? String(precioFijo) : '';
          }
        }
        customDropdowns['prod-funda-marca-cel']?.syncDisplay?.();
        customDropdowns['prod-funda-modelo-cel']?.syncDisplay?.();
      }
      actualizarVisibilidadPrecioFundas();
      cargandoEdicionProducto = false;
    });
  }

  const $modalPanel = $modal?.querySelector('.modal-content');
  redirigirWheelScrollPanelDesdeInputNumerico($modalPanel);

  function scrollModalProductoAlInicio() {
    if ($modalPanel) $modalPanel.scrollTop = 0;
  }

  function abrirModalAgregarProducto() {
    if (!puedeGestionarInventario()) return;
    resetModal();
    if ($modalTitulo) $modalTitulo.textContent = 'Agregar producto';
    if ($modalSubmit) $modalSubmit.textContent = 'Agregar producto';
    $modal?.classList.add('visible');
    document.body.classList.add('modal-producto-abierto');
  }

  function abrirModalConsignadaInventario() {
    if (!puedeGestionarInventario()) return;
    resetModal();
    aplicarModoModalConsignada(true);
    $modal?.classList.add('visible');
    document.body.classList.add('modal-producto-abierto');
    scrollModalProductoAlInicio();
  }

  function cargarConsignadoEnFormulario(prod) {
    if (!prod) return;
    cargandoEdicionProducto = true;
    if ($precio) $precio.value = String(prod.costo_consignacion ?? '');
    if ($precioVenta) $precioVenta.value = String(prod.precio_venta ?? prod.precio ?? '');
    if ($categoria) {
      $categoria.value = prod.categoria || '';
      $categoria.dispatchEvent(new Event('change'));
    }
    parsearNombreEnFormulario(prod);
    refrescarDropdownsModalProducto();
    requestAnimationFrame(() => {
      refrescarDropdownsModalProducto();
      if (prod.categoria === 'fundas') {
        customDropdowns['prod-funda-marca-cel']?.syncDisplay?.();
        customDropdowns['prod-funda-modelo-cel']?.syncDisplay?.();
      }
      actualizarVisibilidadPrecioFundas();
      cargandoEdicionProducto = false;
    });
  }

  function abrirModalEditarConsignado(prod) {
    if (!puedeGestionarInventario()) return;
    if (!prod || prod.id == null || prod.id === '') return;
    resetModal();
    aplicarModoModalConsignada(true);
    if ($form) {
      $form.dataset.editConsignadoId = String(prod.id);
      const sid = prod.sucursal_id ?? prod.id_sucursal;
      if (sid != null) $form.dataset.editConsignadoSucursalId = String(sid);
    }
    if ($modalTitulo) $modalTitulo.textContent = 'Actualizar producto consignado';
    if ($modalSubmit) $modalSubmit.textContent = 'Actualizar producto consignado';
    cargarConsignadoEnFormulario(prod);
    productoEditNombre = prod.nombre || 'este producto';
    mostrarBtnEliminarProducto(true, true);
    mostrarBtnTrasladarProducto(false);
    setCategoriaProductoModalBloqueada(true);
    $modal?.classList.add('visible');
    document.body.classList.add('modal-producto-abierto');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollModalProductoAlInicio());
    });
  }

  function abrirModalEditarProducto(prod) {
    if (!puedeGestionarInventario()) return;
    if (!prod || prod.id == null || prod.id === '') return;
    resetModal();
    if ($modalTitulo) $modalTitulo.textContent = 'Actualizar producto';
    if ($modalSubmit) $modalSubmit.textContent = 'Actualizar producto';
    ocultarCostoCompraEnModal(true);
    if ($form) {
      $form.dataset.editId = String(prod.id);
      const sid = prod.sucursal_id ?? prod.id_sucursal;
      if (sid != null) $form.dataset.editSucursalId = String(sid);
      imagenProductoActual = typeof prod.imagen === 'string' ? prod.imagen : '';
    }
    if ($imagenNombre && imagenProductoActual) {
      $imagenNombre.textContent = 'Imagen ya cargada';
    }
    actualizarPreviewImagenProducto(imagenProductoActual);
    cargarProductoEnFormulario(prod);
    productoEditNombre = prod.nombre || 'este producto';
    mostrarBtnEliminarProducto(true, false);
    mostrarBtnTrasladarProducto(puedeTrasladarProductoInventario(prod));
    setCategoriaProductoModalBloqueada(true);
    $modal?.classList.add('visible');
    document.body.classList.add('modal-producto-abierto');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollModalProductoAlInicio());
    });
  }

  window.ucAbrirModalAgregarProducto = abrirModalAgregarProducto;
  window.ucAbrirModalEditarProducto = abrirModalEditarProducto;
  window.ucAbrirModalConsignadaInventario = abrirModalConsignadaInventario;
  window.ucAbrirModalEditarConsignado = abrirModalEditarConsignado;

  function cerrarModal() {
    $modal?.classList.remove('visible');
    document.body.classList.remove('modal-producto-abierto');
    resetModal();
  }
  window.ucCerrarModalProducto = cerrarModal;

  function limpiarCamposAlCambiarCategoria() {
    $chipCristal?.classList.remove('activo');
    $chipHidrogel?.classList.remove('activo');
    $tipoCristalWrap.style.display = 'none';
    $tipoCristal.value = '';
    $tipoHidrogelWrap.style.display = 'none';
    $tipoHidrogel.value = '';
    $marcaModeloWrap.style.display = 'none';
    $marca.innerHTML = '<option value="">Seleccionar marca</option>';
    if ($micaSerieWrap) $micaSerieWrap.style.display = 'none';
    if ($micaSerieCel) $micaSerieCel.innerHTML = '<option value="">Seleccionar serie</option>';
    $modelo.innerHTML = '<option value="">Seleccionar modelo</option>';
    customDropdowns['prod-mica-marca']?.refresh();
    customDropdowns['prod-mica-serie-cel']?.refresh();
    customDropdowns['prod-mica-modelo']?.refresh();
    if ($fundaMarcaCel) $fundaMarcaCel.value = '';
    if ($fundaSerieWrap) $fundaSerieWrap.style.display = 'none';
    if ($fundaSerieCel) $fundaSerieCel.innerHTML = '<option value="">Seleccionar serie</option>';
    if ($fundaModeloCel) $fundaModeloCel.innerHTML = '<option value="">Seleccionar modelo</option>';
    customDropdowns['prod-funda-serie-cel']?.refresh();
    customDropdowns['prod-funda-modelo-cel']?.refresh();
    if ($cargadorTipo) $cargadorTipo.value = '';
    if ($cargadorMarca) $cargadorMarca.value = '';
    if ($cargadorWatts) $cargadorWatts.value = '0';
    if ($cargadorConexion) $cargadorConexion.value = '';
    if ($cargadorMetros) $cargadorMetros.value = '1';
    if ($audifonosTipo) $audifonosTipo.value = '';
    if ($audifonosConexion) $audifonosConexion.value = '';
    if ($audifonosMarca) $audifonosMarca.value = '';
    if ($audifonosModelo) $audifonosModelo.value = '';
    if ($powerbankMarca) $powerbankMarca.value = '';
    if ($powerbankModelo) $powerbankModelo.value = '';
    if ($powerbankMah) $powerbankMah.value = '10000';
    if ($powerbankWatts) $powerbankWatts.value = '0';
    if ($powerbankConexion) $powerbankConexion.value = '';
    if ($bocinaMarca) $bocinaMarca.value = '';
    if ($bocinaModelo) $bocinaModelo.value = '';
    if ($bocinaWatts) $bocinaWatts.value = '0';
    if ($bocinaColor) $bocinaColor.value = '';
    if (!esModoConsignadaModal()) {
      $precio.value = '';
      if ($costoCompra) $costoCompra.value = '';
      resetPrecioFundasForm();
      if ($prodPrecioWrap) $prodPrecioWrap.hidden = false;
      ocultarCostoCompraEnModal(false);
      if ($fundaRangoPrecioWrap) $fundaRangoPrecioWrap.hidden = true;
      if ($stockValor) $stockValor.value = '';
      if ($imagen) $imagen.value = '';
      if ($imagenNombre) $imagenNombre.textContent = '';
      imagenPendienteDataUrl = '';
      actualizarPreviewImagenProducto(imagenProductoActual);
    } else {
      ocultarCostoCompraEnModal(true);
    }
    Object.keys(customDropdowns).forEach((id) => {
      if (id === '_closeListener') return;
      customDropdowns[id].refresh?.();
      if (!customDropdowns[id].wrap?.classList.contains('input-mode')) {
        customDropdowns[id].syncDisplay?.();
      }
    });
  }

  $categoria?.addEventListener('change', () => {
    if (!cargandoEdicionProducto) limpiarCamposAlCambiarCategoria();
    const cat = $categoria.value;
    if ($camposMicas) $camposMicas.style.display = cat === 'micas' ? 'block' : 'none';
    if ($camposFundas) $camposFundas.style.display = cat === 'fundas' ? 'block' : 'none';
    if ($camposCargadores) $camposCargadores.style.display = cat === 'cargadores' ? 'block' : 'none';
    if (cat === 'cargadores') actualizarCamposCargadorTipo();
    if ($camposAudifonos) $camposAudifonos.style.display = cat === 'audifonos' ? 'block' : 'none';
    if ($camposPowerbanks) $camposPowerbanks.style.display = cat === 'powerbanks' ? 'block' : 'none';
    if ($camposBocinas) $camposBocinas.style.display = cat === 'bocinas' ? 'block' : 'none';
    if (cat === 'fundas') {
      poblarSelectMarcasCel($fundaMarcaCel, $fundaModeloCel, $fundaSerieWrap, $fundaSerieCel);
    }
    if (cat !== 'micas') {
      $chipCristal?.classList.remove('activo');
      $chipHidrogel?.classList.remove('activo');
      $tipoCristalWrap.style.display = 'none';
      $tipoHidrogelWrap.style.display = 'none';
      $marcaModeloWrap.style.display = 'none';
    }
    actualizarVisibilidadPrecioFundas();
    if (esModoConsignadaModal()) aplicarModoModalConsignada(true);
  });

  $chipCristal?.addEventListener('click', () => {
    $chipCristal.classList.add('activo');
    $chipHidrogel?.classList.remove('activo');
    $tipoCristalWrap.style.display = 'block';
    $tipoCristal.value = '';
    $tipoHidrogelWrap.style.display = 'none';
    $tipoHidrogel.value = '';
    $marcaModeloWrap.style.display = 'none';
  });

  $chipHidrogel?.addEventListener('click', () => {
    $chipHidrogel.classList.add('activo');
    $chipCristal?.classList.remove('activo');
    $tipoCristalWrap.style.display = 'none';
    $tipoCristal.value = '';
    $tipoHidrogelWrap.style.display = 'block';
    $tipoHidrogel.value = '';
    $marcaModeloWrap.style.display = 'none';
  });

  $cargadorTipo?.addEventListener('change', () => {
    if (!cargandoEdicionProducto) limpiarCamposCargadorDebajoTipo();
    actualizarCamposCargadorTipo(
      cargandoEdicionProducto ? {} : { valorConexion: '' },
    );
  });

  $tipoCristal?.addEventListener('change', () => {
    const tipo = $tipoCristal.value;
    if (tipo) {
      $marcaModeloWrap.style.display = 'block';
      poblarSelectMarcasCel($marca, $modelo, $micaSerieWrap, $micaSerieCel);
    } else {
      $marcaModeloWrap.style.display = 'none';
    }
  });

  $marca?.addEventListener('change', () => {
    onMarcaCelChange($marca, $modelo, $micaSerieWrap, $micaSerieCel);
  });

  $micaSerieCel?.addEventListener('change', () => {
    poblarModelosParaMarca($marca, $modelo, $marca?.value, $micaSerieCel?.value);
  });

  $fundaMarcaCel?.addEventListener('change', () => {
    onMarcaCelChange($fundaMarcaCel, $fundaModeloCel, $fundaSerieWrap, $fundaSerieCel);
  });

  $fundaSerieCel?.addEventListener('change', () => {
    poblarModelosParaMarca($fundaMarcaCel, $fundaModeloCel, $fundaMarcaCel?.value, $fundaSerieCel?.value);
  });

  function activarModoRangoPrecioFunda() {
    if (!fundaModoPrecioFijo) return;
    const precioFijo = parseFloat($fundaPrecioFijo?.value || 0);
    if (Number.isFinite(precioFijo) && precioFijo > 0) {
      establecerRangoPrecioFundasForm(precioFijo, Math.min(precioFijo + 100, FUNDAS_RANGO_PRECIO_MAX));
    } else {
      resetRangoPrecioFundasForm();
    }
    aplicarModoPrecioFunda(false);
  }

  function activarModoPrecioFijoFunda() {
    if (fundaModoPrecioFijo) return;
    const rango = leerRangoPrecioFundasForm();
    if (rango.ok && $fundaPrecioFijo) {
      $fundaPrecioFijo.value = String(rango.min);
    }
    aplicarModoPrecioFunda(true);
  }

  initSliderRangoFundasProducto();

  $fundaPrecioRangoTab?.addEventListener('click', activarModoRangoPrecioFunda);
  $fundaPrecioFijoTab?.addEventListener('click', activarModoPrecioFijoFunda);

  $imagen?.addEventListener('change', async () => {
    const file = $imagen.files?.[0];
    if (!$imagenNombre) return;
    imagenPendienteDataUrl = '';
    if (!file) {
      $imagenNombre.textContent = imagenProductoActual ? 'Imagen ya cargada' : '';
      actualizarPreviewImagenProducto(imagenProductoActual);
      return;
    }
    $imagenNombre.textContent = 'Procesando imagen…';
    const resultado = await leerArchivoImagenProducto(file);
    if (resultado.error || !resultado.data) {
      alert(resultado.error || 'No se pudo procesar la imagen.');
      if ($imagen) $imagen.value = '';
      $imagenNombre.textContent = imagenProductoActual ? 'Imagen ya cargada' : '';
      actualizarPreviewImagenProducto(imagenProductoActual);
      return;
    }
    imagenPendienteDataUrl = resultado.data;
    $imagenNombre.textContent = file.name;
    actualizarPreviewImagenProducto(imagenPendienteDataUrl);
  });

  function formatearMetrosCargador(val) {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n < 0) return 'de 0m';
    return `de ${Number(n.toFixed(1))}m`;
  }

  const OPCIONES_CONEXION_CARGADOR = {
    cableCompleto: [
      { value: '', text: 'Seleccionar' },
      { value: 'usb-c', text: 'USB-C' },
      { value: 'c-c', text: 'C-C' },
    ],
    cubo: [
      { value: '', text: 'Seleccionar' },
      { value: 'usb', text: 'USB' },
      { value: 'c', text: 'C' },
    ],
  };

  function mapearConexionCargadorAlCambiarTipo(valor, haciaCubo) {
    if (!valor) return '';
    if (haciaCubo) {
      if (valor === 'usb-c') return 'usb';
      if (valor === 'c-c') return 'c';
      return valor === 'usb' || valor === 'c' ? valor : '';
    }
    if (valor === 'usb') return 'usb-c';
    if (valor === 'c') return 'c-c';
    return valor === 'usb-c' || valor === 'c-c' ? valor : '';
  }

  function rellenarOpcionesConexionCargador(esCubo, valorPreferido) {
    if (!$cargadorConexion) return;
    const lista = esCubo ? OPCIONES_CONEXION_CARGADOR.cubo : OPCIONES_CONEXION_CARGADOR.cableCompleto;
    $cargadorConexion.innerHTML = lista.map((o) => `<option value="${o.value}">${o.text}</option>`).join('');
    const validos = new Set(lista.map((o) => o.value));
    const v = valorPreferido && validos.has(valorPreferido) ? valorPreferido : '';
    $cargadorConexion.value = v;
    customDropdowns['prod-cargador-conexion']?.refresh?.();
    customDropdowns['prod-cargador-conexion']?.syncDisplay?.();
  }

  function limpiarCamposCargadorDebajoTipo() {
    if ($cargadorMarca) $cargadorMarca.value = '';
    if ($cargadorWatts) $cargadorWatts.value = '0';
    if ($cargadorMetros) $cargadorMetros.value = '1';
    if ($cargadorConexion) $cargadorConexion.value = '';
  }

  function actualizarCamposCargadorTipo(opciones = {}) {
    const tipo = $cargadorTipo?.value || '';
    const esCable = tipo === 'cable';
    const esCubo = tipo === 'cubo';

    if ($cargadorWattsWrap) $cargadorWattsWrap.style.display = esCable ? 'none' : '';
    if ($cargadorMetrosWrap) $cargadorMetrosWrap.style.display = esCubo ? 'none' : '';
    if (esCable && $cargadorWatts) $cargadorWatts.value = '0';

    if ($cargadorConexionLabel) {
      $cargadorConexionLabel.textContent = esCubo ? 'Entrada' : 'Conexión';
    }

    const valorConexion = opciones.valorConexion !== undefined
      ? opciones.valorConexion
      : mapearConexionCargadorAlCambiarTipo($cargadorConexion?.value || '', esCubo);
    rellenarOpcionesConexionCargador(esCubo, valorConexion);
  }

  function crearAjusteContador($input, opts = {}) {
    const decimal = opts.decimal ?? false;
    const precision = opts.precision ?? 1;
    const min = opts.min ?? 0;
    const onUpdate = opts.onUpdate;

    return function aplicar(delta) {
      const current = decimal
        ? parseFloat($input?.value || 0)
        : parseInt($input?.value || 0, 10);
      const v = Math.max(min, (Number.isFinite(current) ? current : 0) + delta);
      if ($input) {
        if (!decimal && v === 0 && $input.placeholder !== '') {
          $input.value = '';
        } else {
          $input.value = decimal ? String(Number(v.toFixed(precision))) : String(v);
        }
      }
      onUpdate?.();
    };
  }

  function setupHoldRepeat($btn, $input, delta, opts = {}) {
    if (!$btn) return;
    let repeatTimer = null;
    let startTime = 0;
    const initialDelay = opts.delay ?? 380;
    const maxInterval = opts.interval ?? 160;
    const minInterval = opts.minInterval ?? 32;
    const aplicar = crearAjusteContador($input, opts);

    function intervalMs() {
      const elapsed = Date.now() - startTime;
      if (elapsed < initialDelay) return maxInterval;
      const held = elapsed - initialDelay;
      const decay = Math.pow(0.88, held / 65);
      return Math.max(minInterval, maxInterval * decay);
    }

    function tick() {
      aplicar(delta);
      repeatTimer = setTimeout(tick, intervalMs());
    }

    function stop() {
      clearTimeout(repeatTimer);
      repeatTimer = null;
    }

    function start(e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      stop();
      aplicar(delta);
      startTime = Date.now();
      repeatTimer = setTimeout(tick, initialDelay);
    }

    $btn.addEventListener('pointerdown', start);
    $btn.addEventListener('pointerup', stop);
    $btn.addEventListener('pointerleave', stop);
    $btn.addEventListener('pointercancel', stop);
  }

  setupHoldRepeat($precioMenos, $precio, -1);
  setupHoldRepeat($precioMas, $precio, 1);
  setupHoldRepeat($costoCompraMenos, $costoCompra, -1);
  setupHoldRepeat($costoCompraMas, $costoCompra, 1);
  setupHoldRepeat($fundaPrecioFijoMenos, $fundaPrecioFijo, -1);
  setupHoldRepeat($fundaPrecioFijoMas, $fundaPrecioFijo, 1);
  setupHoldRepeat($precioVentaMenos, $precioVenta, -1);
  setupHoldRepeat($precioVentaMas, $precioVenta, 1);
  setupHoldRepeat($stockMenos, $stockValor, -1);
  setupHoldRepeat($stockMas, $stockValor, 1);
  setupHoldRepeat($powerbankMahMenos, $powerbankMah, -500, { interval: 200, minInterval: 45 });
  setupHoldRepeat($powerbankMahMas, $powerbankMah, 500, { interval: 200, minInterval: 45 });
  setupHoldRepeat($powerbankWattsMenos, $powerbankWatts, -1);
  setupHoldRepeat($powerbankWattsMas, $powerbankWatts, 1);
  setupHoldRepeat($cargadorWattsMenos, $cargadorWatts, -1);
  setupHoldRepeat($cargadorWattsMas, $cargadorWatts, 1);
  setupHoldRepeat($cargadorMetrosMenos, $cargadorMetros, -0.5, { decimal: true });
  setupHoldRepeat($cargadorMetrosMas, $cargadorMetros, 0.5, { decimal: true });
  setupHoldRepeat($bocinaWattsMenos, $bocinaWatts, -1);
  setupHoldRepeat($bocinaWattsMas, $bocinaWatts, 1);

  function textoOpcionSeleccionada(selectEl) {
    if (!selectEl) return '';
    const dd = customDropdowns[selectEl.id];
    if (dd?.wrap?.classList.contains('input-mode')) {
      const inp = dd.wrap.querySelector('.custom-select-input');
      if (inp) return inp.value.trim();
    }
    const o = selectEl.options[selectEl.selectedIndex];
    return o?.value ? (o.textContent || '').trim() : '';
  }

  function leerImagenComoDataUrl(input) {
    return leerArchivoImagenProducto(input?.files?.[0]);
  }

  $cancelar?.addEventListener('click', cerrarModal);
  $trasladar?.addEventListener('click', () => {
    const editId = Number($form?.dataset?.editId);
    if (!Number.isFinite(editId)) return;
    const prod = productosInventario.find((item) => Number(item.id) === editId);
    if (prod) window.ucAbrirModalTrasladarProducto?.(prod);
  });
  $eliminar?.addEventListener('click', () => {
    if (!puedeGestionarInventario()) return;
    const editConsignadoId = $form?.dataset?.editConsignadoId;
    const editId = $form?.dataset?.editId;
    const nombre = productoEditNombre || 'este producto';
    if (editConsignadoId) {
      abrirConfirmar(`¿Eliminar el producto consignado "${nombre}"?`, async () => {
        const r = await fetch(`${API}/productos-consignados/${editConsignadoId}`, { method: 'DELETE', headers: authHeaders(false) });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          alert(d.error || 'No se pudo eliminar el producto consignado');
          return;
        }
        cerrarModal();
        resetInventarioNavegacionMica();
        categoriaInventarioActiva = 'consignados';
        renderInventarioChipsNavegacion();
        await window.ucCargarInventarioProductos?.({ forzar: true });
      });
      return;
    }
    if (!editId) return;
    abrirConfirmar(`¿Eliminar el producto "${nombre}"?`, async () => {
      const r = await fetch(`${API}/productos/${editId}`, { method: 'DELETE', headers: authHeaders(false) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || 'No se pudo eliminar el producto');
        return;
      }
      cerrarModal();
      await window.ucCargarInventarioProductos?.({ forzar: true });
    });
  });
  $modal?.addEventListener('click', e => { if (e.target.id === 'modal-producto') cerrarModal(); });

  function validarFormularioProducto() {
    const cat = $categoria.value;
    if (!cat) return { ok: false, msg: 'Selecciona una categoría' };

    let tipoMica = null;
    if (cat === 'micas') {
      tipoMica = $chipCristal?.classList.contains('activo') ? 'cristal' : ($chipHidrogel?.classList.contains('activo') ? 'hidrogel' : null);
      if (!tipoMica) return { ok: false, msg: 'Selecciona tipo de mica (Cristal o Hidrogel)' };
      if (tipoMica === 'cristal') {
        const tipoCristal = $tipoCristal.value;
        if (!tipoCristal) return { ok: false, msg: 'Selecciona tipo de cristal' };
        const marca = textoOpcionSeleccionada($marca);
        const modelo = textoOpcionSeleccionada($modelo);
        if (!marca || !modelo) return { ok: false, msg: 'Selecciona marca y modelo' };
        if (marca === 'Samsung' && !textoOpcionSeleccionada($micaSerieCel)) {
          return { ok: false, msg: 'Selecciona la serie Samsung' };
        }
      } else if (tipoMica === 'hidrogel') {
        const tipoHidrogelVal = $tipoHidrogel.value;
        if (!tipoHidrogelVal) return { ok: false, msg: 'Selecciona tipo de hidrogel' };
      }
    }
    if (cat === 'fundas') {
      const marcaCel = textoOpcionSeleccionada($fundaMarcaCel);
      const modeloCel = textoOpcionSeleccionada($fundaModeloCel);
      if (!marcaCel || !modeloCel) return { ok: false, msg: 'Selecciona marca y modelo del celular' };
      if (marcaCel === 'Samsung' && !textoOpcionSeleccionada($fundaSerieCel)) {
        return { ok: false, msg: 'Selecciona la serie Samsung' };
      }
      if (!esModoConsignadaModal()) {
        const precioFunda = leerPrecioFundasParaGuardar(esFundaPrecioFijoActivo());
        if (!precioFunda.ok) return precioFunda;
      }
    }
    if (cat === 'cargadores') {
      const tipo = $cargadorTipo?.value;
      if (!tipo) return { ok: false, msg: 'Selecciona tipo de cargador' };
    }
    if (cat === 'audifonos') {
      const tipo = $audifonosTipo?.value;
      const conexion = $audifonosConexion?.value;
      if (!tipo) return { ok: false, msg: 'Selecciona tipo de audífonos' };
      if (!conexion) return { ok: false, msg: 'Selecciona tipo de conexión' };
    }
    if (cat === 'powerbanks') {
      const mah = parseInt($powerbankMah?.value || 0, 10);
      if (mah < 1) return { ok: false, msg: 'Ingresa una capacidad válida en mAh' };
    }
    if (cat === 'bocinas') {
      const marca = ($bocinaMarca?.value || '').trim();
      const modelo = ($bocinaModelo?.value || '').trim();
      if (!marca) return { ok: false, msg: 'Ingresa la marca de la bocina' };
      if (!modelo) return { ok: false, msg: 'Ingresa el modelo de la bocina' };
      const color = textoOpcionSeleccionada($bocinaColor);
      if (!color) return { ok: false, msg: 'Selecciona un color' };
    }
    if (esModoConsignadaModal()) {
      const montos = validarMontosConsignada(
        leerMontoInput(document.getElementById('prod-precio')),
        leerMontoInput(document.getElementById('prod-precio-venta'))
      );
      if (!montos.ok) return montos;
    }
    return { ok: true, cat, tipoMica };
  }

  function construirNombreProductoDesdeForm(cat, tipoMica) {
    let nombreProducto = '';
    if (cat === 'micas') {
      if (tipoMica === 'cristal') {
        nombreProducto = `Mica cristal ${$tipoCristal.value} — ${textoOpcionSeleccionada($marca)} ${textoOpcionSeleccionada($modelo)}`;
      } else {
        nombreProducto = `Mica hidrogel ${$tipoHidrogel.value}`;
      }
    } else if (cat === 'fundas') {
      const modeloCel = textoOpcionSeleccionada($fundaModeloCel);
      nombreProducto = ['Funda', modeloCel].filter(Boolean).join(' ');
    } else if (cat === 'cargadores') {
      const tipoCargador = textoOpcionSeleccionada($cargadorTipo);
      const tipoVal = $cargadorTipo?.value;
      const sinPrefijoCargador = tipoVal === 'cable' || tipoVal === 'cubo';
      const partesCargador = [sinPrefijoCargador ? tipoCargador : `Cargador ${tipoCargador}`];
      const marcaCargador = ($cargadorMarca?.value || '').trim();
      if (marcaCargador) partesCargador.push(marcaCargador);
      if ($cargadorTipo?.value !== 'cable') {
        partesCargador.push(`de ${$cargadorWatts?.value || 0}W`);
      }
      const connCargador = textoOpcionSeleccionada($cargadorConexion);
      if (connCargador) {
        const prefijoConn = tipoVal === 'cubo' ? 'entrada' : 'conexion';
        partesCargador.push(`${prefijoConn} ${connCargador}`);
      }
      if ($cargadorTipo?.value !== 'cubo') {
        partesCargador.push(formatearMetrosCargador($cargadorMetros?.value));
      }
      nombreProducto = partesCargador.filter(Boolean).join(' ');
    } else if (cat === 'audifonos') {
      const partesAud = [];
      const modeloAud = ($audifonosModelo?.value || '').trim();
      const marcaAud = textoOpcionSeleccionada($audifonosMarca);
      const tipoAud = textoOpcionSeleccionada($audifonosTipo);
      const connAud = normalizarConexionAudifonos(textoOpcionSeleccionada($audifonosConexion));
      if (modeloAud) partesAud.push(modeloAud);
      if (marcaAud) partesAud.push(marcaAud);
      if (tipoAud) partesAud.push(`tipo ${tipoAud}`);
      if (connAud) partesAud.push(`conexion ${connAud}`);
      nombreProducto = limpiarNombreProducto(partesAud.join(' '));
    } else if (cat === 'powerbanks') {
      const partesPb = [];
      const marcaPb = limpiarTextoCampoProducto($powerbankMarca?.value);
      const modeloPb = limpiarTextoCampoProducto($powerbankModelo?.value);
      if (marcaPb) partesPb.push(marcaPb);
      if (modeloPb) partesPb.push(modeloPb);
      nombreProducto = partesPb.join(' ');
      const mahPb = $powerbankMah?.value || 0;
      const wattsPb = $powerbankWatts?.value || 0;
      nombreProducto += ` de ${mahPb} mAh y ${wattsPb}W`;
      const connPb = textoOpcionSeleccionada($powerbankConexion);
      if (connPb) nombreProducto += ` con ${connPb}`;
      nombreProducto = limpiarNombreProducto(nombreProducto);
    } else if (cat === 'bocinas') {
      nombreProducto = [
        'Bocina',
        textoOpcionSeleccionada($bocinaMarca),
        ($bocinaModelo?.value || '').trim(),
        `${$bocinaWatts?.value || 0}W`,
        textoOpcionSeleccionada($bocinaColor),
      ].filter(Boolean).join(' ');
    } else if (cat === 'accesorios') {
      nombreProducto = 'Accesorio';
    } else if (cat === 'otros') {
      nombreProducto = 'Otro — producto';
    } else {
      nombreProducto = `Producto (${cat})`;
    }
    return nombreProducto;
  }

  $form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!puedeGestionarInventario()) return;
    if (guardandoProductoModal) return;
    const validacion = validarFormularioProducto();
    if (!validacion.ok) {
      alert(validacion.msg);
      return;
    }
    if (!bloquearEnvioProductoModal()) return;

    try {
    const { cat, tipoMica } = validacion;

    if (esModoConsignadaModal()) {
      const costoConsignacion = leerMontoInput(document.getElementById('prod-precio'));
      const precioVenta = leerMontoInput(document.getElementById('prod-precio-venta'));
      const montos = validarMontosConsignada(costoConsignacion, precioVenta);
      if (!montos.ok) {
        alert(montos.msg);
        return;
      }

      const nombreProducto = construirNombreProductoDesdeForm(cat, tipoMica);
      const editConsignadoId = $form?.dataset?.editConsignadoId ? Number($form.dataset.editConsignadoId) : NaN;
      const esEdicionConsignado = Number.isFinite(editConsignadoId);

      let sidProd = NaN;
      if (esEdicionConsignado) {
        const sidEdit = $form?.dataset?.editConsignadoSucursalId;
        sidProd = sidEdit != null && sidEdit !== '' ? Number(sidEdit) : NaN;
      } else {
        const { raw: sidRaw, esTodasLasSucursales } = leerDatasetSucursalInventario();
        if (esTodasLasSucursales) {
          alert('Elige una sucursal concreta para guardar productos consignados.');
          return;
        }
        if (!sidRaw || Number.isNaN(Number(sidRaw))) {
          alert('Selecciona una sucursal en la barra superior');
          return;
        }
        sidProd = Number(sidRaw);
      }
      if (!Number.isFinite(sidProd)) {
        alert('No se pudo determinar la sucursal del producto consignado');
        return;
      }

      try {
        const url = esEdicionConsignado
          ? `${API}/productos-consignados/${editConsignadoId}`
          : `${API}/productos-consignados`;
        const r = await fetch(url, {
          method: esEdicionConsignado ? 'PUT' : 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            nombre: nombreProducto,
            costo_consignacion: costoConsignacion,
            precio_venta: precioVenta,
            categoria: cat,
            sucursal_id: sidProd,
          }),
        });
        const rawResp = await r.text().catch(() => '');
        let data = {};
        try { data = rawResp ? JSON.parse(rawResp) : {}; } catch { data = {}; }
        if (!r.ok) {
          const msg = data.error
            || (r.status === 404 ? 'Ruta no encontrada. Reinicia el servidor (npm start en server/).' : '')
            || rawResp
            || (esEdicionConsignado ? 'No se pudo actualizar el producto consignado' : 'No se pudo guardar el producto consignado');
          alert(msg);
          return;
        }
        $modal?.classList.remove('visible');
        document.body.classList.remove('modal-producto-abierto');
        resetModal();
        resetInventarioNavegacionMica();
        categoriaInventarioActiva = 'consignados';
        renderInventarioChipsNavegacion();
        actualizarEstadoBtnAgregarProducto();
        await window.ucCargarInventarioProductos?.({ forzar: true });
      } catch (err) {
        console.error(err);
        alert('Error de red al guardar el producto consignado');
      }
      return;
    }

    let precio = parseFloat($precio?.value || 0);
    let precioMax = null;
    if (cat === 'fundas' && !esModoConsignadaModal()) {
      const precioFunda = leerPrecioFundasParaGuardar(esFundaPrecioFijoActivo());
      if (!precioFunda.ok) {
        alert(precioFunda.msg);
        return;
      }
      precio = precioFunda.precio;
      precioMax = precioFunda.precioMax;
    } else if (precio <= 0) {
      alert('Ingresa un precio válido');
      return;
    }
    const stock = parseInt($stockValor?.value || 0, 10);
    if (stock < 1) { alert('El stock debe ser al menos 1'); return; }

    const editId = $form?.dataset?.editId ? Number($form.dataset.editId) : NaN;
    const esEdicion = Number.isFinite(editId);
    let sidProd = NaN;
    if (!esEdicion) {
      const { raw: sidRaw, esTodasLasSucursales } = leerDatasetSucursalInventario();
      if (esTodasLasSucursales) {
        alert('Con «Todas las sucursales» solo ves el inventario reunido; elige una sucursal concreta para agregar productos.');
        return;
      }
      if (!sidRaw) {
        alert('Selecciona una sucursal en la barra superior');
        return;
      }
      sidProd = Number(sidRaw);
      if (!Number.isFinite(sidProd)) {
        alert('Selecciona una sucursal válida en la barra superior');
        return;
      }
    }

    const nombreProducto = construirNombreProductoDesdeForm(cat, tipoMica);

    try {
      const imagenRes = await resolverImagenParaGuardarProducto();
      const hayImagenNueva = Boolean(imagenPendienteDataUrl || $imagen?.files?.[0]);
      if (hayImagenNueva && imagenRes.error) {
        alert(imagenRes.error);
        return;
      }
      const url = esEdicion ? `${API}/productos/${editId}` : `${API}/productos`;
      const payload = {
        nombre: nombreProducto,
        precio,
        stock,
        categoria: cat,
      };
      if (!esEdicion) {
        const costoCompraRaw = leerMontoInput($costoCompra);
        payload.costo_compra = Number.isFinite(costoCompraRaw) && costoCompraRaw > 0 ? costoCompraRaw : null;
      }
      if (cat === 'fundas' && !esModoConsignadaModal()) {
        payload.precio_max = precioMax != null ? precioMax : null;
      }
      if (hayImagenNueva) {
        payload.imagen = imagenRes.data;
      } else if (!esEdicion) {
        payload.imagen = imagenRes.data ?? null;
      }
      if (!esEdicion) payload.sucursal_id = sidProd;
      const r = await fetch(url, {
        method: esEdicion ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const ct = r.headers.get('content-type') || '';
        let errMsg = '';
        if (ct.includes('application/json')) {
          try {
            const j = await r.json();
            errMsg = j.error || JSON.stringify(j);
          } catch (_) {
            errMsg = r.statusText;
          }
        } else if (r.status === 404) {
          errMsg =
            'No se encontró la API de productos (404). Cierra cualquier otro servidor en el puerto 3000. En la carpeta UrbanCase ejecuta: npm start y entra en http://localhost:3000/index.html';
        } else {
          errMsg = r.statusText || 'Error al guardar';
        }
        alert(errMsg || 'No se pudo guardar');
        return;
      }
      const guardado = await r.json().catch(() => ({}));
      if (imagenPendienteDataUrl && !guardado?.imagen) {
        alert('El producto se guardó, pero la imagen no se almacenó. Intenta con otra foto.');
        return;
      }
      await window.ucCargarInventarioProductos?.({ forzar: true });
      cerrarModal();
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar el producto');
    }
    } finally {
      desbloquearEnvioProductoModal();
    }
  });
}

// ===================== POS =====================

function initPOS() {
  const PRODUCTOS = [];
  let carrito = [];
  let carritoRestock = [];
  let modoRestockRapido = false;

  const $productos = document.getElementById('productos');
  const $carritoLista = document.getElementById('carrito-lista');
  redirigirWheelScrollPanelDesdeInputNumerico($carritoLista);
  const $carritoVacio = document.getElementById('carrito-vacio');
  const $carritoCount = document.getElementById('carrito-count');
  const $carritoTitulo = document.getElementById('carrito-titulo-texto');
  const $subtotal = document.getElementById('subtotal');
  const $total = document.getElementById('total');
  const $totalesVenta = document.getElementById('carrito-totales-venta');
  const $totalesRestock = document.getElementById('carrito-totales-restock');
  const $restockUnidades = document.getElementById('restock-unidades');
  const $restockProductos = document.getElementById('restock-productos');
  const $restockCostoTotal = document.getElementById('restock-costo-total');
  const $btnVaciar = document.getElementById('btn-vaciar');
  const $btnCobrar = document.getElementById('btn-cobrar');
  const $btnRestockConfirmar = document.getElementById('btn-restock-confirmar');
  const $btnRestockToggle = document.getElementById('btn-inventario-restock');
  const $modal = document.getElementById('modal-venta');
  const $modalTotal = document.getElementById('modal-total');
  const $modalCerrar = document.getElementById('modal-cerrar');
  const $modalCobro = document.getElementById('modal-cobro');
  const $modalCobroItems = document.getElementById('modal-cobro-items');
  const $modalCobroSucursal = document.getElementById('modal-cobro-sucursal');
  const $cobroSubtotal = document.getElementById('cobro-subtotal');
  const $cobroImpuesto = document.getElementById('cobro-impuesto');
  const $cobroTotal = document.getElementById('cobro-total');
  const $modalCobroPago = document.getElementById('modal-cobro-pago-opciones');
  const $modalCobroConfirmar = document.getElementById('modal-cobro-confirmar');
  const $modalCobroEfectivo = document.getElementById('modal-cobro-efectivo');
  const $modalCobroBody = $modalCobro?.querySelector('.modal-cobro-body');
  const $cobroEfectivoRecibido = document.getElementById('cobro-efectivo-recibido');
  const $cobroEfectivoCambioWrap = document.getElementById('cobro-efectivo-cambio-wrap');
  const $cobroEfectivoCambio = document.getElementById('cobro-efectivo-cambio');
  const $cobroEfectivoFalta = document.getElementById('cobro-efectivo-falta');
  let metodoPagoCobro = '';
  let sucursalCobroId = null;
  let totalCobroActualNum = 0;

  function formatearPrecio(n) {
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  }

  function claveCarritoItem(item) {
    return `${item.id}-${Number(item.precio)}`;
  }

  function cantidadProductoEnCarritoVenta(productoId, excluirClave = null) {
    const pid = Number(productoId);
    if (!Number.isFinite(pid)) return 0;
    return carrito
      .filter((i) => !i.consignado && Number(i.id) === pid && claveCarritoItem(i) !== excluirClave)
      .reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
  }

  function stockDisponibleVentaProducto(prodOrId) {
    if (prodOrId && typeof prodOrId === 'object') {
      const n = Number(prodOrId.stock);
      if (Number.isFinite(n)) return Math.max(0, n);
      return stockDisponibleVentaProducto(prodOrId.id);
    }
    const live = productosInventario.find((p) => Number(p.id) === Number(prodOrId));
    const n = live != null ? Number(live.stock) : NaN;
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function stockMaxCarritoVentaItem(it, clave = null) {
    if (it?.consignado) return 1;
    const stockTotal = stockDisponibleVentaProducto(it);
    const usadosOtros = cantidadProductoEnCarritoVenta(it.id, clave);
    const maxLinea = stockTotal - usadosOtros;
    if (maxLinea > 0) return maxLinea;
    const reserva = Number(it?.stock);
    if (Number.isFinite(reserva) && reserva > 0) {
      return Math.max(Number(it.cantidad) || 1, reserva - usadosOtros);
    }
    return Math.max(Number(it.cantidad) || 1, 1);
  }

  function agregarProductoAlCarritoDirecto(prod) {
    const precioSel = Number(prod.precio);
    const stockMax = Number(prod.stock) || 0;
    if (stockMax <= 0) return;
    const nombreDisplay = typeof nombreProductoInventarioDisplay === 'function'
      ? nombreProductoInventarioDisplay(prod)
      : (prod.nombre || 'Producto');
    const item = carrito.find((i) => Number(i.id) === Number(prod.id) && Number(i.precio) === precioSel);
    if (item) {
      const clave = claveCarritoItem(item);
      if (item.cantidad >= stockMaxCarritoVentaItem(item, clave)) return;
      item.cantidad++;
    } else {
      carrito.push({
        ...prod,
        nombre: nombreDisplay,
        precio: precioSel,
        cantidad: 1,
        stock: stockDisponibleVentaProducto(prod),
      });
    }
    actualizarCarrito();
  }

  const $modalFundaPrecio = document.getElementById('modal-funda-precio-carrito');
  const $fundaPrecioChipsCarrito = document.getElementById('modal-funda-precio-chips');
  const $fundaPrecioSubtitulo = document.getElementById('modal-funda-precio-subtitulo');
  let fundaCarritoPendiente = null;

  function cerrarModalPrecioFundaCarrito() {
    $modalFundaPrecio?.classList.remove('visible');
    $modalFundaPrecio?.setAttribute('aria-hidden', 'true');
    fundaCarritoPendiente = null;
  }

  function abrirModalPrecioFundaCarrito(prod) {
    if (!modoRestockRapido && (Number(prod?.stock) || 0) <= 0) return;
    if (!$modalFundaPrecio || !$fundaPrecioChipsCarrito) {
      agregarProductoAlCarritoDirecto(prod);
      return;
    }
    fundaCarritoPendiente = prod;
    const min = getPrecioMinProducto(prod);
    const max = getPrecioMaxProducto(prod);
    const opts = opcionesPrecioEnRangoFundas(min, max);
    if ($fundaPrecioSubtitulo) {
      const nom = typeof nombreProductoInventarioDisplay === 'function'
        ? nombreProductoInventarioDisplay(prod)
        : (prod.nombre || 'Funda');
      $fundaPrecioSubtitulo.textContent = `${nom} · ${formatearPrecioRangoSimple(min)} - ${formatearPrecioRangoSimple(max)}`;
    }
    $fundaPrecioChipsCarrito.innerHTML = opts.map((v) =>
      `<button type="button" class="form-chip" data-precio-funda-carrito="${v}">${formatearPrecioRangoSimple(v)}</button>`
    ).join('');
    $fundaPrecioChipsCarrito.querySelectorAll('.form-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const precio = Number(chip.dataset.precioFundaCarrito);
        if (!fundaCarritoPendiente || !Number.isFinite(precio)) return;
        agregarProductoAlCarritoDirecto({ ...fundaCarritoPendiente, precio });
        cerrarModalPrecioFundaCarrito();
      });
    });
    $modalFundaPrecio.classList.add('visible');
    $modalFundaPrecio.setAttribute('aria-hidden', 'false');
  }

  document.getElementById('modal-funda-precio-cancelar')?.addEventListener('click', cerrarModalPrecioFundaCarrito);
  $modalFundaPrecio?.addEventListener('click', (e) => {
    if (e.target === $modalFundaPrecio) cerrarModalPrecioFundaCarrito();
  });

  function renderProductos() {
    if (!$productos || document.getElementById('home-dashboards')) return;
    $productos.innerHTML = PRODUCTOS.map(p => `
      <article class="producto-card" data-id="${p.id}">
        <div class="producto-icono">${p.icono}</div>
        <div class="producto-nombre">${p.nombre}</div>
        <div class="producto-precio">${formatearPrecio(p.precio)}</div>
      </article>
    `).join('');
    $productos.querySelectorAll('.producto-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id);
        const prod = PRODUCTOS.find(p => p.id === id);
        if (!prod) return;
        const item = carrito.find(i => i.id === id);
        if (item) item.cantidad++; else carrito.push({ ...prod, cantidad: 1 });
        actualizarCarrito();
      });
    });
  }

  function agregarProductoAlRestock(prod) {
    if (!prod || prod.es_consignado) {
      alert('El restock rápido solo aplica a productos de inventario propio');
      return;
    }
    const id = Number(prod.id);
    if (!Number.isFinite(id)) return;
    const item = carritoRestock.find((i) => Number(i.id) === id);
    if (item) {
      item.cantidad++;
    } else {
      carritoRestock.push({
        id,
        nombre: nombreProductoInventarioDisplay(prod),
        stockActual: Number(prod.stock) || 0,
        costoCompraActual: getCostoCompraProducto(prod),
        cantidad: 1,
        costoNuevo: '',
      });
    }
    actualizarCarrito();
    mostrarCarritoPanel();
  }

  function restockItemValido(item) {
    const costo = Number(String(item?.costoNuevo ?? '').replace(',', '.'));
    return Number.isFinite(costo) && costo > 0;
  }

  function textoPromedioRestockItem(item) {
    const promedio = calcularPromedioCostoCompraRestock(
      item.stockActual,
      item.costoCompraActual,
      item.cantidad,
      item.costoNuevo
    );
    return promedio != null ? formatearPrecio(promedio) : '—';
  }

  function aplicarModoRestockPanel(activo) {
    document.body.classList.toggle('modo-restock-rapido', activo);
    if ($carritoTitulo) $carritoTitulo.textContent = activo ? 'Restock' : 'Carrito';
    if ($totalesVenta) $totalesVenta.hidden = activo;
    if ($totalesRestock) $totalesRestock.hidden = !activo;
    if ($btnCobrar) $btnCobrar.hidden = activo;
    if ($btnRestockConfirmar) $btnRestockConfirmar.hidden = !activo;
    if ($btnRestockToggle) {
      $btnRestockToggle.classList.toggle('activo', activo);
      $btnRestockToggle.setAttribute('aria-pressed', activo ? 'true' : 'false');
      if (!$btnRestockToggle.disabled) {
        $btnRestockToggle.title = activo ? 'Salir de restock rápido' : 'Restock rápido';
      }
    }
  }

  function setModoRestockRapido(activo) {
    if (activo && !puedeGestionarInventario()) return;
    if (activo) {
      const { esTodasLasSucursales } = leerDatasetSucursalInventario();
      if (esTodasLasSucursales) {
        alert('Elige una sucursal concreta para usar restock rápido');
        return;
      }
      if (inventarioEsVistaConsignados()) {
        alert('El restock rápido no aplica a productos consignados');
        return;
      }
    }
    modoRestockRapido = activo;
    aplicarModoRestockPanel(activo);
    actualizarCarrito();
    actualizarEstadoBtnRestockRapido();
    renderInventarioProductos();
    if (activo) mostrarCarritoPanel();
  }

  function refrescarTotalesRestock() {
    const totalItems = carritoRestock.reduce((s, i) => s + i.cantidad, 0);
    const totalCostoCompra = carritoRestock.reduce((s, i) => {
      const cantidad = Number(i?.cantidad) || 0;
      const costo = Number(String(i?.costoNuevo ?? '').replace(',', '.'));
      if (!Number.isFinite(costo) || costo <= 0 || cantidad <= 0) return s;
      return s + (costo * cantidad);
    }, 0);
    const totalCostoCompraRedondeado = Math.round(totalCostoCompra * 100) / 100;
    $carritoCount.textContent = totalItems;
    if ($restockUnidades) $restockUnidades.textContent = String(totalItems);
    if ($restockProductos) $restockProductos.textContent = String(carritoRestock.length);
    if ($restockCostoTotal) $restockCostoTotal.textContent = formatearPrecio(totalCostoCompraRedondeado);
    if ($btnRestockConfirmar) {
      $btnRestockConfirmar.disabled = !(carritoRestock.length > 0 && carritoRestock.every(restockItemValido));
    }
  }

  function setupRestockCantidadHoldRepeat($btn, aplicarDelta) {
    if (!$btn) return;
    let repeatTimer = null;
    let startTime = 0;
    const initialDelay = 380;
    const maxInterval = 160;
    const minInterval = 32;

    function intervalMs() {
      const elapsed = Date.now() - startTime;
      if (elapsed < initialDelay) return maxInterval;
      const held = elapsed - initialDelay;
      return Math.max(minInterval, maxInterval * Math.pow(0.88, held / 65));
    }

    function stop() {
      clearTimeout(repeatTimer);
      repeatTimer = null;
    }

    function tick() {
      if (aplicarDelta() === false) {
        stop();
        return;
      }
      repeatTimer = setTimeout(tick, intervalMs());
    }

    function start(e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      stop();
      if (aplicarDelta() === false) return;
      startTime = Date.now();
      repeatTimer = setTimeout(tick, initialDelay);
    }

    $btn.addEventListener('pointerdown', start);
    $btn.addEventListener('pointerup', stop);
    $btn.addEventListener('pointerleave', stop);
    $btn.addEventListener('pointercancel', stop);
  }

  function actualizarCarritoRestock() {
    refrescarTotalesRestock();

    if (carritoRestock.length === 0) {
      $carritoLista.innerHTML = '';
      $carritoLista.appendChild($carritoVacio);
      $carritoVacio.style.display = 'block';
      $carritoVacio.textContent = 'Agrega productos al restock desde inventario';
      $carritoVacio.classList.remove('carrito-vacio-link');
      return;
    }

    $carritoVacio.style.display = 'none';
    $carritoLista.innerHTML = carritoRestock.map((i) => `
      <div class="carrito-item carrito-item-restock" data-id="${i.id}">
        <div class="carrito-item-restock-top">
          <span class="carrito-item-nombre">${escHtmlInventario(i.nombre)}</span>
          <div class="carrito-item-cantidad">
            <button type="button" class="carrito-restock-cantidad-menos" aria-label="Menos">−</button>
            <input type="number" min="1" step="1" inputmode="numeric" class="carrito-restock-cantidad-input" value="${i.cantidad}" aria-label="Cantidad de ${escHtmlInventario(i.nombre)}">
            <button type="button" class="carrito-restock-cantidad-mas" aria-label="Más">+</button>
          </div>
          <button type="button" class="carrito-item-quitar" aria-label="Quitar">×</button>
        </div>
        <div class="carrito-item-restock-costos">
          <label class="carrito-restock-costo">
            <span class="carrito-restock-label">Costo compra</span>
            <div class="carrito-restock-costo-input">
              <span class="carrito-restock-signo">$</span>
              <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escHtmlInventario(i.costoNuevo)}" aria-label="Costo de compra de ${escHtmlInventario(i.nombre)}">
            </div>
          </label>
          <div class="carrito-restock-promedio">
            <span class="carrito-restock-label">Promedio</span>
            <strong class="carrito-restock-promedio-valor">${textoPromedioRestockItem(i)}</strong>
          </div>
        </div>
      </div>
    `).join('');

    $carritoLista.querySelectorAll('.carrito-item-restock').forEach((row) => {
      const id = Number(row.dataset.id);
      const item = carritoRestock.find((i) => Number(i.id) === id);
      if (!item) return;
      const $promedio = row.querySelector('.carrito-restock-promedio-valor');
      const $inputCosto = row.querySelector('.carrito-restock-costo-input input');
      const $inputCantidad = row.querySelector('.carrito-restock-cantidad-input');
      const $btnMenos = row.querySelector('.carrito-restock-cantidad-menos');
      const $btnMas = row.querySelector('.carrito-restock-cantidad-mas');
      const refrescarPromedio = () => {
        if ($promedio) $promedio.textContent = textoPromedioRestockItem(item);
        refrescarTotalesRestock();
      };
      $inputCosto?.addEventListener('input', () => {
        item.costoNuevo = $inputCosto.value;
        refrescarPromedio();
      });
      $inputCantidad?.addEventListener('blur', () => {
        const n = parseInt($inputCantidad.value, 10);
        if (!Number.isFinite(n) || n < 1) {
          item.cantidad = 1;
          $inputCantidad.value = '1';
        } else {
          item.cantidad = n;
          $inputCantidad.value = String(n);
        }
        refrescarPromedio();
      });
      $inputCantidad?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          $inputCantidad.blur();
        }
      });
      setupRestockCantidadHoldRepeat($btnMenos, () => {
        if (!carritoRestock.some((i) => Number(i.id) === id)) return false;
        if (item.cantidad <= 1) {
          carritoRestock = carritoRestock.filter((i) => Number(i.id) !== id);
          actualizarCarrito();
          return false;
        }
        item.cantidad--;
        if ($inputCantidad) $inputCantidad.value = String(item.cantidad);
        refrescarPromedio();
        return true;
      });
      setupRestockCantidadHoldRepeat($btnMas, () => {
        if (!carritoRestock.some((i) => Number(i.id) === id)) return false;
        item.cantidad++;
        if ($inputCantidad) $inputCantidad.value = String(item.cantidad);
        refrescarPromedio();
        return true;
      });
      row.querySelector('.carrito-item-quitar')?.addEventListener('click', () => {
        carritoRestock = carritoRestock.filter((i) => Number(i.id) !== id);
        actualizarCarrito();
      });
    });
  }

  function actualizarCarritoVenta() {
    carrito.forEach((i) => {
      if (i.consignado) return;
      const live = productosInventario.find((p) => Number(p.id) === Number(i.id));
      if (live != null) i.stock = Number(live.stock) || 0;
    });
    const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);
    const subtotalNum = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    $carritoCount.textContent = totalItems;
    $subtotal.textContent = formatearPrecio(subtotalNum);
    $total.textContent = formatearPrecio(subtotalNum);
    $btnCobrar.disabled = carrito.length === 0;

    if (carrito.length === 0) {
      $carritoLista.innerHTML = '';
      $carritoLista.appendChild($carritoVacio);
      $carritoVacio.style.display = 'block';
      const enInventario = document.getElementById('contenido-inventario')?.style.display === 'flex';
      $carritoVacio.textContent = enInventario ? 'Agrega productos' : 'Agrega productos tocando aquí';
      $carritoVacio.classList.toggle('carrito-vacio-link', !enInventario);
    } else {
      $carritoVacio.style.display = 'none';
      $carritoLista.innerHTML = carrito.map(i => {
        const clave = claveCarritoItem(i);
        const maxQty = stockMaxCarritoVentaItem(i, clave);
        const enTope = (Number(i.cantidad) || 0) >= maxQty;
        return `
        <div class="carrito-item" data-clave="${clave}">
          <span class="carrito-item-nombre">${i.nombre}</span>
          <div class="carrito-item-cantidad">
            <button type="button" aria-label="Menos">−</button>
            <span>${i.cantidad}</span>
            <button type="button" aria-label="Más"${enTope ? ' disabled title="Stock máximo"' : ''}>+</button>
          </div>
          <span class="carrito-item-precio">${formatearPrecio(i.precio * i.cantidad)}</span>
          <button type="button" class="carrito-item-quitar" aria-label="Quitar">×</button>
        </div>`;
      }).join('');
      $carritoLista.querySelectorAll('.carrito-item').forEach(row => {
        const clave = row.getAttribute('data-clave');
        row.querySelector('.carrito-item-cantidad button:first-child').onclick = () => {
          const it = carrito.find(i => claveCarritoItem(i) === clave);
          if (it) { it.cantidad--; if (it.cantidad <= 0) carrito = carrito.filter(i => claveCarritoItem(i) !== clave); }
          actualizarCarrito();
        };
        const $btnMas = row.querySelector('.carrito-item-cantidad button:last-child');
        $btnMas.onclick = () => {
          if ($btnMas.disabled) return;
          const it = carrito.find(i => claveCarritoItem(i) === clave);
          if (it && it.cantidad < stockMaxCarritoVentaItem(it, clave)) it.cantidad++;
          actualizarCarrito();
        };
        row.querySelector('.carrito-item-quitar').onclick = () => {
          carrito = carrito.filter(i => claveCarritoItem(i) !== clave);
          actualizarCarrito();
        };
      });
    }
  }

  function actualizarCarrito() {
    if (modoRestockRapido) actualizarCarritoRestock();
    else actualizarCarritoVenta();
  }

  async function confirmarRestockRapido() {
    if (!puedeGestionarInventario()) return;
    if (!modoRestockRapido || carritoRestock.length === 0) return;
    for (const item of carritoRestock) {
      if (!restockItemValido(item)) {
        alert(`Ingresa el costo de compra para «${item.nombre}»`);
        return;
      }
    }
    if ($btnRestockConfirmar) $btnRestockConfirmar.disabled = true;
    try {
      const items = carritoRestock.map((i) => ({
        producto_id: i.id,
        cantidad: i.cantidad,
        costo_compra: Number(String(i.costoNuevo).replace(',', '.')),
      }));
      const r = await fetch(`${API}/productos/restock-rapido`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ items }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data.error || 'No se pudo aplicar el restock');
        return;
      }
      carritoRestock = [];
      setModoRestockRapido(false);
      await window.ucCargarInventarioProductos?.({ forzar: true });
    } catch (err) {
      alert(err?.message || 'Error de red al aplicar restock');
    } finally {
      if ($btnRestockConfirmar) {
        $btnRestockConfirmar.disabled = !(carritoRestock.length > 0 && carritoRestock.every(restockItemValido));
      }
    }
  }

  $btnVaciar.addEventListener('click', () => {
    if (modoRestockRapido) carritoRestock = [];
    else carrito = [];
    actualizarCarrito();
  });
  $btnRestockConfirmar?.addEventListener('click', confirmarRestockRapido);

  const $carritoPanel = document.getElementById('carrito-panel');
  const $carritoOverlay = document.getElementById('carrito-overlay');
  const $btnExpand = document.getElementById('btn-carrito-expand');
  const $expandIcon = $btnExpand?.querySelector('.btn-expand-icon');
  const $vistaPos = document.getElementById('vista-pos');
  function toggleCarritoMaximizado() {
    const maximizado = $carritoPanel?.classList.toggle('carrito-maximizado');
    $carritoOverlay?.classList.toggle('visible', maximizado);
    $carritoOverlay?.setAttribute('aria-hidden', !maximizado);
    $btnExpand?.setAttribute('title', maximizado ? 'Minimizar carrito' : 'Maximizar carrito');
    $btnExpand?.setAttribute('aria-label', maximizado ? 'Minimizar carrito' : 'Maximizar carrito');
    if ($expandIcon) $expandIcon.textContent = maximizado ? '✕' : '⛶';
    if (maximizado && $carritoPanel && $vistaPos && $carritoOverlay) {
      document.body.appendChild($carritoOverlay);
      document.body.appendChild($carritoPanel);
    } else if (!maximizado && $carritoPanel && $vistaPos && $carritoOverlay) {
      const $app = document.querySelector('.app');
      if ($app) $app.insertBefore($carritoOverlay, $app.children[1]);
      $vistaPos.appendChild($carritoPanel);
    }
  }

  function actualizarBtnMostrarCarrito() {
    const permite = moduloPermiteCarritoUI();
    const oculto = $vistaPos?.classList.contains('carrito-oculto');
    const enInventario = document.getElementById('contenido-inventario')?.style.display === 'flex';
    const $btnMostrar = document.getElementById('btn-mostrar-carrito');
    const $btnMostrarHome = document.getElementById('btn-mostrar-carrito-home');
    if ($btnMostrar) $btnMostrar.hidden = !permite || !oculto || !enInventario;
    if ($btnMostrarHome) $btnMostrarHome.hidden = !permite || !oculto || enInventario;
  }

  function minimizarCarritoSiAbierto() {
    if ($carritoPanel?.classList.contains('carrito-maximizado')) toggleCarritoMaximizado();
  }
  window.ucMinimizarCarritoSiAbierto = minimizarCarritoSiAbierto;
  window.ucVaciarCarritoPorCambioSucursal = () => {
    carrito = [];
    carritoRestock = [];
    cerrarModalCobro();
    actualizarCarrito();
  };

  function ocultarCarritoPanel() {
    if ($carritoPanel?.classList.contains('carrito-maximizado')) toggleCarritoMaximizado();
    $vistaPos?.classList.add('carrito-oculto');
    actualizarBtnMostrarCarrito();
    renderInventarioProductos();
  }

  function mostrarCarritoPanel() {
    $vistaPos?.classList.remove('carrito-oculto');
    actualizarBtnMostrarCarrito();
    renderInventarioProductos();
  }

  window.actualizarBtnMostrarCarrito = actualizarBtnMostrarCarrito;

  $btnExpand?.addEventListener('click', toggleCarritoMaximizado);
  document.getElementById('btn-carrito-ocultar')?.addEventListener('click', ocultarCarritoPanel);
  document.getElementById('btn-mostrar-carrito')?.addEventListener('click', mostrarCarritoPanel);
  document.getElementById('btn-mostrar-carrito-home')?.addEventListener('click', mostrarCarritoPanel);
  actualizarBtnMostrarCarrito();
  $carritoOverlay?.addEventListener('click', () => {
    if ($carritoPanel?.classList.contains('carrito-maximizado')) toggleCarritoMaximizado();
  });

  $carritoVacio?.addEventListener('click', () => {
    if (!$carritoVacio.classList.contains('carrito-vacio-link')) return;
    const $btnInventario = document.querySelector('.categoria-btn[data-categoria="inventario"]');
    if ($btnInventario) $btnInventario.click();
  });

  window.actualizarCarritoVacioParaVista = () => {
    if ($carritoVacio.style.display !== 'block') return;
    if (modoRestockRapido) {
      $carritoVacio.textContent = 'Agrega productos al restock desde inventario';
      $carritoVacio.classList.remove('carrito-vacio-link');
      return;
    }
    const enInventario = document.getElementById('contenido-inventario')?.style.display === 'flex';
    $carritoVacio.textContent = enInventario ? 'Agrega productos' : 'Agrega productos tocando aquí';
    $carritoVacio.classList.toggle('carrito-vacio-link', !enInventario);
  };
  $btnCobrar.addEventListener('click', () => { abrirModalCobro(); });

  function escHtmlCobro(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function iconoPlaceholderCobroDesdeNodo(nodo) {
    const esConsignado = nodo?.closest('.cobro-item')?.dataset?.consignado === '1';
    return esConsignado ? 'fa-handshake' : 'fa-box';
  }

  function reemplazarImagenCobroPorPlaceholder(img) {
    const wrap = img?.closest('.cobro-item-media');
    if (!wrap) return;
    const icono = iconoPlaceholderCobroDesdeNodo(wrap);
    wrap.innerHTML = `<div class="cobro-item-img cobro-item-img--placeholder" aria-hidden="true"><i class="fa-solid ${icono}"></i></div>`;
  }

  function htmlImagenCobroItem(item) {
    const img = item?.imagen;
    if (typeof img === 'string' && img.trim()) {
      return `<img class="cobro-item-img" src="${escHtmlCobro(img.trim())}" alt="" loading="lazy">`;
    }
    const pid = Number(item?.id);
    const tieneImagenLazy = Number.isFinite(pid) && (productoTieneImagenInventario(item) || inventarioImagenCache.has(pid));
    if (!item?.consignado && tieneImagenLazy) {
      return `<img class="cobro-item-img cobro-item-img--lazy" data-cobro-lazy-id="${pid}" alt="" loading="lazy">`;
    }
    const icono = item?.consignado ? 'fa-handshake' : 'fa-box';
    return `<div class="cobro-item-img cobro-item-img--placeholder" aria-hidden="true"><i class="fa-solid ${icono}"></i></div>`;
  }

  function totalImporteCobro() {
    return carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  }

  function parseMontoCobroInput(valor) {
    if (valor == null || valor === '') return null;
    const n = Number(String(valor).replace(',', '.').trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function ocultarIndicadoresEfectivoCobro() {
    if ($cobroEfectivoCambioWrap) {
      $cobroEfectivoCambioWrap.hidden = true;
      $cobroEfectivoCambioWrap.setAttribute('hidden', '');
    }
    if ($cobroEfectivoFalta) {
      $cobroEfectivoFalta.hidden = true;
      $cobroEfectivoFalta.setAttribute('hidden', '');
      $cobroEfectivoFalta.textContent = '';
    }
    if ($cobroEfectivoCambio) $cobroEfectivoCambio.textContent = formatearPrecio(0);
  }

  function actualizarPanelEfectivoCobro() {
    const metodoSeleccionado = metodoPagoCobro === 'efectivo'
      || metodoPagoCobro === 'tarjeta'
      || metodoPagoCobro === 'transferencia';
    const esEfectivo = metodoPagoCobro === 'efectivo';
    if ($modalCobroEfectivo) $modalCobroEfectivo.hidden = !esEfectivo;
    if (!metodoSeleccionado) {
      ocultarIndicadoresEfectivoCobro();
      if ($modalCobroConfirmar) $modalCobroConfirmar.disabled = true;
      return;
    }
    if (!esEfectivo) {
      ocultarIndicadoresEfectivoCobro();
      if ($modalCobroConfirmar) $modalCobroConfirmar.disabled = false;
      return;
    }

    const recibido = parseMontoCobroInput($cobroEfectivoRecibido?.value);
    const total = totalCobroActualNum;

    if (recibido == null || recibido <= 0) {
      ocultarIndicadoresEfectivoCobro();
      if ($modalCobroConfirmar) $modalCobroConfirmar.disabled = true;
      return;
    }

    if (recibido < total) {
      const falta = total - recibido;
      if ($cobroEfectivoCambioWrap) {
        $cobroEfectivoCambioWrap.hidden = true;
        $cobroEfectivoCambioWrap.setAttribute('hidden', '');
      }
      if ($cobroEfectivoFalta) {
        $cobroEfectivoFalta.hidden = false;
        $cobroEfectivoFalta.removeAttribute('hidden');
        $cobroEfectivoFalta.textContent = `Faltan ${formatearPrecio(falta)} para cubrir el total`;
      }
      if ($modalCobroConfirmar) $modalCobroConfirmar.disabled = true;
      return;
    }

    const cambio = recibido - total;
    if ($cobroEfectivoFalta) {
      $cobroEfectivoFalta.hidden = true;
      $cobroEfectivoFalta.setAttribute('hidden', '');
    }
    if ($cobroEfectivoCambioWrap) {
      $cobroEfectivoCambioWrap.hidden = false;
      $cobroEfectivoCambioWrap.removeAttribute('hidden');
    }
    if ($cobroEfectivoCambio) $cobroEfectivoCambio.textContent = formatearPrecio(cambio);
    if ($modalCobroConfirmar) $modalCobroConfirmar.disabled = false;
  }

  function resetPanelEfectivoCobro() {
    if ($cobroEfectivoRecibido) $cobroEfectivoRecibido.value = '';
    actualizarPanelEfectivoCobro();
  }

  function etiquetaMetodoPago(valor) {
    if (valor === 'tarjeta') return 'Tarjeta';
    if (valor === 'transferencia') return 'Transferencia';
    return 'Efectivo';
  }

  function renderModalCobro() {
    if (!$modalCobroItems) return;
    const subtotalNum = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const impuestoNum = 0;
    const totalNum = subtotalNum + impuestoNum;

    $modalCobroItems.innerHTML = carrito.map((i) => {
      const lineaSub = i.precio * i.cantidad;
      const detalleExtra = i.consignado
        ? '<span class="cobro-item-badge">Consignado</span>'
        : (i.categoria ? `<span class="cobro-item-cat">${escHtmlCobro(i.categoria)}</span>` : '');
      return `
        <li class="cobro-item"${i.consignado ? ' data-consignado="1"' : ''}>
          <div class="cobro-item-media">${htmlImagenCobroItem(i)}</div>
          <div class="cobro-item-info">
            <div class="cobro-item-nombre">${escHtmlCobro(i.nombre)}</div>
            <div class="cobro-item-meta">
              ${detalleExtra}
              <span class="cobro-item-cant">${i.cantidad} × ${formatearPrecio(i.precio)}</span>
            </div>
          </div>
          <div class="cobro-item-linea-total">${formatearPrecio(lineaSub)}</div>
        </li>`;
    }).join('');

    if ($cobroSubtotal) $cobroSubtotal.textContent = formatearPrecio(subtotalNum);
    if ($cobroImpuesto) $cobroImpuesto.textContent = formatearPrecio(impuestoNum);
    if ($cobroTotal) $cobroTotal.textContent = formatearPrecio(totalNum);
    totalCobroActualNum = totalNum;
    actualizarPanelEfectivoCobro();

    $modalCobroItems.querySelectorAll('.cobro-item-img:not(.cobro-item-img--placeholder)').forEach((img) => {
      img.addEventListener('error', () => {
        reemplazarImagenCobroPorPlaceholder(img);
      }, { once: true });
    });

    $modalCobroItems.querySelectorAll('.cobro-item-img--lazy[data-cobro-lazy-id]').forEach((img) => {
      const id = Number(img.dataset.cobroLazyId);
      if (!Number.isFinite(id)) {
        reemplazarImagenCobroPorPlaceholder(img);
        return;
      }
      void obtenerImagenProductoInventario(id).then((src) => {
        if (!src) {
          reemplazarImagenCobroPorPlaceholder(img);
          return;
        }
        img.addEventListener('error', () => reemplazarImagenCobroPorPlaceholder(img), { once: true });
        img.src = src;
      }).catch(() => {
        reemplazarImagenCobroPorPlaceholder(img);
      });
    });
  }

  function seleccionarMetodoPagoCobro(valor) {
    metodoPagoCobro = (valor === 'efectivo' || valor === 'tarjeta' || valor === 'transferencia') ? valor : '';
    $modalCobroPago?.querySelectorAll('.cobro-pago-btn').forEach((btn) => {
      const activo = metodoPagoCobro !== '' && btn.dataset.pago === metodoPagoCobro;
      btn.classList.toggle('activo', activo);
      btn.setAttribute('aria-checked', activo ? 'true' : 'false');
    });
    if (metodoPagoCobro !== 'efectivo') resetPanelEfectivoCobro();
    else actualizarPanelEfectivoCobro();
  }

  function cerrarModalCobro() {
    $modalCobro?.classList.remove('visible');
    $modalCobro?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-cobro-abierto');
    sucursalCobroId = null;
  }

  function abrirModalCobro() {
    if (carrito.length === 0 || modoRestockRapido) return;
    minimizarCarritoSiAbierto();

    const { raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
    if (esTodasLasSucursales) {
      alert('Elige una sucursal concreta (no «Todas las sucursales») para cobrar');
      return;
    }
    const sucursalId = Number(raw);
    if (!Number.isFinite(sucursalId)) {
      alert('Selecciona una sucursal en la barra superior para cobrar');
      return;
    }

    sucursalCobroId = sucursalId;
    const $label = document.getElementById('dropdown-sucursales-label');
    const nombreSucursal = $label?.textContent?.trim() || 'Sucursal';
    if ($modalCobroSucursal) {
      $modalCobroSucursal.textContent = `${nombreSucursal} · ${carrito.reduce((s, i) => s + i.cantidad, 0)} artículo(s)`;
    }

    seleccionarMetodoPagoCobro('');
    if ($cobroEfectivoRecibido) $cobroEfectivoRecibido.value = '';
    renderModalCobro();
    if ($modalCobroBody) $modalCobroBody.scrollTop = 0;
    $modalCobro?.classList.add('visible');
    $modalCobro?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-cobro-abierto');
    requestAnimationFrame(() => {
      if ($modalCobroBody) $modalCobroBody.scrollTop = 0;
    });
  }

  $cobroEfectivoRecibido?.addEventListener('input', actualizarPanelEfectivoCobro);
  redirigirWheelScrollPanelDesdeInputNumerico($modalCobroBody);

  $modalCobroPago?.querySelectorAll('.cobro-pago-btn').forEach((btn) => {
    btn.addEventListener('click', () => seleccionarMetodoPagoCobro(btn.dataset.pago || 'efectivo'));
  });

  document.getElementById('modal-cobro-cerrar')?.addEventListener('click', cerrarModalCobro);
  document.getElementById('modal-cobro-cancelar')?.addEventListener('click', cerrarModalCobro);
  $modalCobro?.addEventListener('click', (e) => { if (e.target === $modalCobro) cerrarModalCobro(); });
  $modalCobroConfirmar?.addEventListener('click', () => { void procesarCobro(); });

  async function procesarCobro() {
    if (carrito.length === 0 || modoRestockRapido) return;

    const sucursalId = sucursalCobroId ?? Number(leerDatasetSucursalInventario().raw);
    if (!Number.isFinite(sucursalId)) {
      alert('Selecciona una sucursal en la barra superior para cobrar');
      return;
    }

    const totalVenta = totalImporteCobro();
    let efectivoRecibido = null;
    let efectivoCambio = null;
    if (metodoPagoCobro !== 'efectivo' && metodoPagoCobro !== 'tarjeta' && metodoPagoCobro !== 'transferencia') {
      alert('Selecciona un método de pago');
      actualizarPanelEfectivoCobro();
      return;
    }
    if (metodoPagoCobro === 'efectivo') {
      efectivoRecibido = parseMontoCobroInput($cobroEfectivoRecibido?.value);
      if (efectivoRecibido == null || efectivoRecibido < totalVenta) {
        alert('Ingresa un monto en efectivo igual o mayor al total');
        actualizarPanelEfectivoCobro();
        return;
      }
      efectivoCambio = efectivoRecibido - totalVenta;
    }

    const items = carrito.map((i) => {
      if (i.consignado) {
        return {
          es_consignado: true,
          producto_consignado_id: i.consignadoId ?? null,
          producto_nombre: i.nombre,
          cantidad: i.cantidad,
          precio_unitario: Number(i.precio),
        };
      }
      return {
        producto_id: Number(i.id),
        producto_nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio),
      };
    });

    if ($modalCobroConfirmar) $modalCobroConfirmar.disabled = true;
    if ($btnCobrar) $btnCobrar.disabled = true;
    const labelConfirmarOriginal = $modalCobroConfirmar?.textContent || 'Confirmar venta';
    if (metodoPagoCobro === 'tarjeta' && $modalCobroConfirmar) {
      $modalCobroConfirmar.textContent = 'Esperando pago en Point…';
    }
    try {
      const r = await fetch(`${API}/ventas`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          sucursal_id: sucursalId,
          metodo_pago: metodoPagoCobro,
          items,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data.error || data.pago_point?.aviso || 'No se pudo registrar la venta');
        return;
      }
      cerrarModalCobro();
      $modalTotal.textContent = formatearPrecio(totalVenta);
      const $modalVentaSub = document.getElementById('modal-venta-sub');
      if ($modalVentaSub) {
        let extraTicket = '';
        if (data.ticket?.print_en_cola) extraTicket = ' · Ticket en cola (Point en Ingresar monto)';
        else if (data.ticket?.print) {
          extraTicket = metodoPagoCobro === 'tarjeta'
            ? ' · Boucher y ticket impresos'
            : ' · Ticket enviado a la impresora';
        } else if (data.ticket?.print_omitido) extraTicket = '';
        else if (data.ticket && data.ticket.print === false) {
          extraTicket = data.ticket.print_error
            ? ` · ${data.ticket.print_error}`
            : ' · No se pudo imprimir el ticket';
        }
        if (metodoPagoCobro === 'efectivo' && efectivoRecibido != null) {
          $modalVentaSub.textContent = `Efectivo · Recibido ${formatearPrecio(efectivoRecibido)} · Cambio ${formatearPrecio(efectivoCambio)}${extraTicket}`;
        } else if (metodoPagoCobro === 'tarjeta' && data.pago_point?.ok) {
          $modalVentaSub.textContent = `Tarjeta aprobada en Point${extraTicket}`;
        } else {
          $modalVentaSub.textContent = `Pago con ${etiquetaMetodoPago(metodoPagoCobro)}${extraTicket}`;
        }
      }
      minimizarCarritoSiAbierto();
      $modal.classList.add('visible');
      carrito = [];
      actualizarCarrito();
      await window.ucCargarInventarioProductos?.({ forzar: true });
      window.ucCargarHomeDashboards?.();
    } catch (err) {
      alert(err?.message || 'Error de red al cobrar');
    } finally {
      if ($modalCobroConfirmar) {
        $modalCobroConfirmar.disabled = false;
        $modalCobroConfirmar.textContent = labelConfirmarOriginal;
      }
      if ($btnCobrar) $btnCobrar.disabled = carrito.length === 0;
    }
  }

  $modalCerrar.addEventListener('click', () => $modal.classList.remove('visible'));
  $modal.addEventListener('click', e => { if (e.target === $modal) $modal.classList.remove('visible'); });

  renderProductos();
  aplicarModoRestockPanel(false);
  actualizarCarrito();

  window.agregarAlCarrito = (prod) => {
    if (modoRestockRapido) {
      agregarProductoAlRestock(prod);
      return;
    }
    if ((Number(prod?.stock) || 0) <= 0) return;
    if (productoFundaTieneRangoPrecio(prod)) {
      abrirModalPrecioFundaCarrito(prod);
      return;
    }
    agregarProductoAlCarritoDirecto(prod);
  };

  window.ucModoRestockRapido = () => modoRestockRapido;
  window.ucToggleModoRestockRapido = () => setModoRestockRapido(!modoRestockRapido);
  window.ucDesactivarModoRestockRapido = () => {
    if (!modoRestockRapido) return;
    setModoRestockRapido(false);
  };

  window.ucAgregarConsignadoAlCarrito = (datos) => {
    if (!datos) return false;
    const costoConsignacion = Number(datos.costoConsignacion ?? datos.costo_consignacion);
    const precioVenta = Number(datos.precio ?? datos.precio_venta);
    const consignadoIdRaw = datos.consignadoId ?? datos.consignado_id ?? datos.id ?? null;
    const consignadoId = consignadoIdRaw != null ? Number(consignadoIdRaw) : null;
    if (!Number.isFinite(costoConsignacion) || costoConsignacion <= 0) {
      alert('Ingresa un costo de consignación válido');
      return false;
    }
    if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
      alert('Ingresa un precio de venta válido');
      return false;
    }
    if (Math.round(costoConsignacion * 100) > Math.round(precioVenta * 100)) {
      alert('El costo de consignación no puede ser mayor al precio de venta');
      return false;
    }
    if (Number.isFinite(consignadoId) && carrito.some((i) => i.consignado && Number(i.consignadoId) === consignadoId)) {
      alert('Este producto consignado ya está en el carrito');
      return false;
    }
    const cantidad = Math.max(1, parseInt(datos.cantidad, 10) || 1);
    carrito.push({
      id: Number.isFinite(consignadoId) ? `consignado-${consignadoId}` : `consignado-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      consignadoId: Number.isFinite(consignadoId) ? consignadoId : null,
      nombre: datos.nombre || 'Producto consignado',
      precio: precioVenta,
      costoConsignacion,
      categoria: datos.categoria || 'otros',
      imagen: datos.imagen || null,
      consignado: true,
      cantidad,
    });
    actualizarCarrito();
    return true;
  };
  window.formatearPrecioPOS = formatearPrecio;

  const T = window.UrbanCaseTheme;
  const $themeToggle = document.getElementById('theme-toggle');
  const $themeLabel = $themeToggle?.querySelector('.theme-label');
  function actualizarEtiquetaTema(oscuro) {
    if ($themeLabel) $themeLabel.textContent = oscuro ? 'Claro' : 'Obscuro';
  }
  if (T) {
    actualizarEtiquetaTema(T.aplicarTemaDesdePreferencia());
    T.iniciarTemaAutomatico(actualizarEtiquetaTema);
    const toggleManual = () => actualizarEtiquetaTema(T.alternarTemaManual());
    if ($themeToggle) $themeToggle.addEventListener('click', toggleManual);
    const $logo = document.querySelector('.logo');
    if ($logo) $logo.addEventListener('click', toggleManual);
  }
}

// ===================== MÓDULO: TABS =====================

function escReporteTexto(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textoProductoMovimientoInventarioReporte(m) {
  const productos = productosDetalleMovimientoInventarioDesdeFila(m);
  if (productos.length > 0) {
    return productos.map((p) => p.nombre).filter(Boolean).join(', ') || m.producto_nombre || '—';
  }
  return m?.producto_nombre || '—';
}

function productosDetalleMovimientoInventarioDesdeFila(m) {
  const productos = m?.detalle?.productos;
  if (Array.isArray(productos) && productos.length > 0) return productos;
  if (m?.detalle?.costo_entrada != null || m?.detalle?.motivo === 'restock_rapido') {
    return [{
      nombre: m?.producto_nombre,
      cantidad: m?.cantidad,
      costo_anterior: m?.detalle?.costo_anterior,
      costo_entrada: m?.detalle?.costo_entrada,
      costo_promedio: m?.detalle?.costo_promedio,
    }];
  }
  if (m?.producto_nombre) {
    return [{
      nombre: m.producto_nombre,
      cantidad: m?.cantidad,
      costo_anterior: m?.detalle?.costo_anterior,
      costo_entrada: m?.detalle?.costo_entrada,
      costo_promedio: m?.detalle?.costo_promedio,
    }];
  }
  return [];
}

function formatCostoReporte(valor) {
  if (valor == null || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lineaProductoRestockMovimientoReporte(producto, index) {
  const n = index + 1;
  const nombre = producto?.nombre || 'Producto';
  const cantidad = Number(producto?.cantidad) || 0;
  const cantidadTxt = cantidad > 0 ? `+${cantidad}` : String(cantidad);
  const anterior = formatCostoReporte(producto?.costo_anterior);
  const ingresado = formatCostoReporte(producto?.costo_entrada);
  return `${n}.- ${nombre}: ${cantidadTxt} uds · Costo anterior: ${anterior} · Costo ingresado: ${ingresado}`;
}

const movimientosInventarioProductosCache = new Map();
const movimientosInventarioRegistrosCache = new Map();
let movimientosInventarioListaActual = [];
let reporteMovimientoSeleccionadoId = null;

function htmlCeldaProductoMovimientoInventarioReporte(m) {
  const texto = textoProductoMovimientoInventarioReporte(m);
  if (!texto || texto === '—') return '<span class="reporte-historial-sin-cambio">—</span>';
  return `
    <div class="reporte-mov-productos">
      <span class="reporte-mov-producto-texto" title="${escReporteTexto(texto)}">${escReporteTexto(texto)}</span>
    </div>
  `;
}

function renderDetalleMovimientoInventarioSeleccionado(movimientoId) {
  const $wrap = document.getElementById('reporte-mov-detalle-wrap');
  const $tbody = document.getElementById('tbody-reporte-mov-detalle');
  if (!$wrap || !$tbody) return;
  if (movimientoId == null || !Number.isFinite(Number(movimientoId))) {
    $wrap.hidden = true;
    $tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacio">Selecciona un registro para ver el detalle</td></tr>';
    return;
  }
  const productos = movimientosInventarioProductosCache.get(Number(movimientoId)) || [];
  if (!productos.length) {
    $wrap.hidden = false;
    $tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacio">Este registro no tiene detalle de productos</td></tr>';
    return;
  }
  $wrap.hidden = false;
  $tbody.innerHTML = productos.map((p, i) => {
    const cantidad = Math.abs(Number(p?.cantidad) || 0);
    return `
      <tr>
        <td class="tabla-num">${i + 1}</td>
        <td>${escReporteTexto(p?.nombre || 'Producto')}</td>
        <td class="tabla-num">${escReporteTexto(String(cantidad))}</td>
        <td class="tabla-num">${escReporteTexto(formatCostoReporte(p?.costo_anterior))}</td>
        <td class="tabla-num">${escReporteTexto(formatCostoReporte(p?.costo_entrada))}</td>
      </tr>
    `;
  }).join('');
}

function abrirModalMovimientosInventarioProductos(movimientoId) {
  const productos = movimientosInventarioProductosCache.get(Number(movimientoId)) || [];
  const $modal = document.getElementById('modal-reporte-mov-productos');
  const $sub = document.getElementById('modal-reporte-mov-productos-subtitulo');
  const $lista = document.getElementById('modal-reporte-mov-productos-lista');
  if (!$modal || !$lista) return;
  const fila = document.querySelector(`[data-movimiento-id="${movimientoId}"]`)?.closest('tr');
  const movimiento = fila?.querySelector('td:nth-child(2)')?.textContent?.trim() || 'Restock rápido';
  if ($sub) $sub.textContent = movimiento;
  $lista.innerHTML = productos.map((p, i) =>
    `<li>${escReporteTexto(lineaProductoRestockMovimientoReporte(p, i))}</li>`
  ).join('');
  $modal.classList.add('visible');
  $modal.setAttribute('aria-hidden', 'false');
}

function cerrarModalMovimientosInventarioProductos() {
  const $modal = document.getElementById('modal-reporte-mov-productos');
  if (!$modal) return;
  $modal.classList.remove('visible');
  $modal.setAttribute('aria-hidden', 'true');
}

function initMovimientosInventarioReporteUI() {
  if (initMovimientosInventarioReporteUI._done) return;
  initMovimientosInventarioReporteUI._done = true;

  const $tbody = document.getElementById('tbody-reporte-movimientos');

  $tbody?.addEventListener('click', (e) => {
    const $row = e.target.closest('tr[data-movimiento-id]');
    if (!$row) return;
    const id = Number($row.dataset.movimientoId);
    if (!movimientosInventarioRegistrosCache.has(id)) return;
    reporteMovimientoSeleccionadoId = reporteMovimientoSeleccionadoId === id ? null : id;
    renderTablaMovimientosInventarioReporte(movimientosInventarioListaActual);
  });
}

function etiquetaMovimientoInventarioReporte(tipo, detalle) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'devolucion') return 'Devolución';
  if (t === 'restock_rapido' || detalle?.motivo === 'restock_rapido') return 'Restock rápido';
  const map = {
    venta: 'Venta',
    entrada_mercancia: 'Entrada de mercancía',
    ajuste_manual: 'Ajuste manual',
    transferencia_salida: 'Transferencia salida',
    transferencia_entrada: 'Transferencia entrada',
    otro: 'Otro',
  };
  return map[t] || String(tipo || '—');
}

function claseCantidadMovimientoInventario(cantidad) {
  const n = Number(cantidad) || 0;
  if (n > 0) return ' reporte-mov-cantidad--pos';
  if (n < 0) return ' reporte-mov-cantidad--neg';
  return '';
}

function totalCompraMovimientoInventarioReporte(m) {
  const productos = productosDetalleMovimientoInventarioDesdeFila(m);
  let total = 0;
  let tieneCosto = false;
  productos.forEach((p) => {
    const cantidad = Math.abs(Number(p?.cantidad) || 0);
    const costo = Number(p?.costo_entrada ?? p?.costoEntrada);
    if (!Number.isFinite(costo) || costo <= 0 || cantidad <= 0) return;
    total += cantidad * costo;
    tieneCosto = true;
  });
  return tieneCosto ? total : null;
}

function renderTablaMovimientosInventarioReporte(lista) {
  const $tbody = document.getElementById('tbody-reporte-movimientos');
  if (!$tbody) return;
  movimientosInventarioListaActual = Array.isArray(lista) ? [...lista] : [];
  movimientosInventarioProductosCache.clear();
  movimientosInventarioRegistrosCache.clear();
  if (!movimientosInventarioListaActual.length) {
    reporteMovimientoSeleccionadoId = null;
    renderDetalleMovimientoInventarioSeleccionado(null);
    $tbody.innerHTML = '<tr><td colspan="7" class="tabla-vacio">No hay movimientos registrados</td></tr>';
    return;
  }
  movimientosInventarioListaActual.forEach((m) => {
    const productos = productosDetalleMovimientoInventarioDesdeFila(m);
    if (m?.id != null && productos.length > 0) {
      movimientosInventarioProductosCache.set(Number(m.id), productos);
    }
    if (m?.id != null) movimientosInventarioRegistrosCache.set(Number(m.id), m);
  });
  if (reporteMovimientoSeleccionadoId != null && !movimientosInventarioRegistrosCache.has(Number(reporteMovimientoSeleccionadoId))) {
    reporteMovimientoSeleccionadoId = null;
  }
  const listaVisible = reporteMovimientoSeleccionadoId == null
    ? movimientosInventarioListaActual
    : movimientosInventarioListaActual.filter((m) => Number(m?.id) === Number(reporteMovimientoSeleccionadoId));
  $tbody.innerHTML = listaVisible.map((m) => {
    const productos = productosDetalleMovimientoInventarioDesdeFila(m);
    const fecha = formatFecha(m.created_at);
    const cantidadNum = Number(m.cantidad) || 0;
    const unidadesTxt = String(Math.abs(cantidadNum));
    const totalProductos = productos.length;
    const totalCompra = totalCompraMovimientoInventarioReporte(m);
    const totalCompraTxt = totalCompra != null ? formatCostoReporte(totalCompra) : '—';
    const filaSeleccionada = Number(m?.id) === Number(reporteMovimientoSeleccionadoId);
    return `
      <tr data-movimiento-id="${Number(m.id) || 0}" class="${filaSeleccionada ? 'reporte-mov-row-seleccionada' : ''}">
        <td>${escReporteTexto(fecha)}</td>
        <td class="reporte-mov-productos-cell">${htmlCeldaProductoMovimientoInventarioReporte(m)}</td>
        <td class="tabla-num">${escReporteTexto(unidadesTxt)}</td>
        <td class="tabla-num">${escReporteTexto(String(totalProductos))}</td>
        <td class="tabla-num">${escReporteTexto(totalCompraTxt)}</td>
        <td>${escReporteTexto(m.sucursal_nombre || 'Sin sucursal')}</td>
        <td>${escReporteTexto(m.usuario_nombre || 'Sistema')}</td>
      </tr>
    `;
  }).join('');
  renderDetalleMovimientoInventarioSeleccionado(reporteMovimientoSeleccionadoId);
}

function renderTablaTransferenciasSucursalesReporte(lista) {
  const $tbody = document.getElementById('tbody-reporte-transferencias');
  if (!$tbody) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    $tbody.innerHTML = '<tr><td colspan="6" class="tabla-vacio">No hay transferencias registradas</td></tr>';
    return;
  }
  $tbody.innerHTML = lista.map((t) => {
    const fecha = formatFecha(t.created_at);
    const cantidadNum = Number(t.cantidad) || 0;
    return `
      <tr>
        <td>${escReporteTexto(fecha)}</td>
        <td>${escReporteTexto(t.producto_nombre || '—')}</td>
        <td class="tabla-num">${escReporteTexto(String(cantidadNum))}</td>
        <td>${escReporteTexto(t.sucursal_origen_nombre || 'Sin sucursal')}</td>
        <td>${escReporteTexto(t.sucursal_destino_nombre || 'Sin sucursal')}</td>
        <td>${escReporteTexto(t.usuario_nombre || 'Sistema')}</td>
      </tr>
    `;
  }).join('');
}

function etiquetaMetodoPagoCorteCaja(metodo) {
  const key = String(metodo || '').toLowerCase().trim();
  if (key === 'tarjeta') return 'Tarjeta';
  if (key === 'transferencia') return 'Transferencia';
  return 'Efectivo';
}

const ventasDetalleCache = new Map();
const ventasCorteRegistrosCache = new Map();
let ventasCorteListaActual = [];
let ventaCorteSeleccionadaId = null;

function montoVentaReporte(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizarDetalleVentaDesdeFila(venta) {
  if (!venta) return [];
  const raw = venta.detalle;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function totalProductosVenta(venta) {
  if (venta?.total_productos != null && Number.isFinite(Number(venta.total_productos))) {
    return Math.max(0, Math.trunc(Number(venta.total_productos)));
  }
  return normalizarDetalleVentaDesdeFila(venta).reduce(
    (sum, p) => sum + (Number(p.cantidad) || 0),
    0
  );
}

function esLineaVentaConsignada(linea) {
  if (!linea) return false;
  if (linea.es_consignado === true || linea.es_consignado === 1 || linea.es_consignado === '1') return true;
  const consignadoId = Number(linea.producto_consignado_id);
  if (Number.isFinite(consignadoId) && consignadoId > 0) return true;
  const det = linea.detalle;
  if (det && typeof det === 'object') {
    if (det.es_consignado || det.consignado) return true;
  }
  if (typeof det === 'string') {
    try {
      const parsed = JSON.parse(det);
      if (parsed?.es_consignado || parsed?.consignado) return true;
    } catch (_) { /* ignore */ }
  }
  return false;
}

function leerCostoConsignacionLinea(linea) {
  const directo = Number(linea?.costo_consignacion);
  if (Number.isFinite(directo) && directo > 0) return directo;
  let det = linea?.detalle;
  if (typeof det === 'string') {
    try { det = JSON.parse(det); } catch (_) { det = null; }
  }
  if (det && typeof det === 'object') {
    const c = Number(det.costo_consignacion ?? det.costoConsignacion);
    if (Number.isFinite(c) && c > 0) return c;
  }
  return NaN;
}

function htmlNombreProductoVentaDetalle(linea) {
  const nombre = escReporteTexto(linea?.producto_nombre || 'Producto');
  if (!esLineaVentaConsignada(linea)) return nombre;
  return `<span class="venta-detalle-producto-nombre">${nombre}</span> <span class="venta-detalle-consignado-badge">Consignado</span>`;
}

function htmlPrecioUnitarioVentaDetalle(linea) {
  const precioVenta = Number(linea?.precio_unitario) || 0;
  if (!esLineaVentaConsignada(linea)) return escReporteTexto(montoVentaReporte(precioVenta));
  const costoConsignacion = leerCostoConsignacionLinea(linea);
  if (!Number.isFinite(costoConsignacion) || costoConsignacion <= 0) {
    return escReporteTexto(montoVentaReporte(precioVenta));
  }
  const costoTxt = montoVentaReporte(costoConsignacion);
  const ventaTxt = montoVentaReporte(precioVenta);
  return `<span class="venta-detalle-precio-consignado"><span class="venta-detalle-precio-costo">${escReporteTexto(costoTxt)}</span><span class="venta-detalle-precio-sep">=</span><span class="venta-detalle-precio-venta">${escReporteTexto(ventaTxt)}</span></span>`;
}

function pintarDetalleVentaSeleccionada(productos) {
  const $wrap = document.getElementById('ventas-detalle-wrap');
  const $tbody = document.getElementById('tbody-ventas-detalle');
  if (!$wrap || !$tbody) return;
  const lista = Array.isArray(productos) ? productos : [];
  if (!lista.length) {
    $wrap.hidden = false;
    $tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacio">Esta venta no tiene productos registrados</td></tr>';
    return;
  }
  $wrap.hidden = false;
  $tbody.innerHTML = lista.map((p, i) => {
    const cantidad = Number(p.cantidad) || 0;
    const totalLinea = montoVentaReporte(p.subtotal);
    return `
      <tr>
        <td class="tabla-num">${i + 1}</td>
        <td>${htmlNombreProductoVentaDetalle(p)}</td>
        <td class="tabla-num">${escReporteTexto(String(cantidad))}</td>
        <td class="tabla-num">${htmlPrecioUnitarioVentaDetalle(p)}</td>
        <td class="tabla-num">${escReporteTexto(totalLinea)}</td>
      </tr>
    `;
  }).join('');
}

async function renderDetalleVentaSeleccionada(ventaId) {
  const $wrap = document.getElementById('ventas-detalle-wrap');
  const $tbody = document.getElementById('tbody-ventas-detalle');
  if (!$wrap || !$tbody) return;
  if (ventaId == null || !Number.isFinite(Number(ventaId))) {
    $wrap.hidden = true;
    $tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacio">Selecciona una venta para ver el detalle</td></tr>';
    return;
  }
  const id = Number(ventaId);
  if (ventasDetalleCache.has(id)) {
    pintarDetalleVentaSeleccionada(ventasDetalleCache.get(id));
    return;
  }
  const venta = ventasCorteRegistrosCache.get(id);
  const detalleLocal = normalizarDetalleVentaDesdeFila(venta);
  if (detalleLocal.length) {
    ventasDetalleCache.set(id, detalleLocal);
    pintarDetalleVentaSeleccionada(detalleLocal);
    return;
  }
  $wrap.hidden = false;
  $tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacio">Cargando productos...</td></tr>';
  try {
    const r = await fetch(`${API}/reportes/corte-caja/${id}/detalle`, { headers: authHeaders(false) });
    if (r.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!r.ok) {
      let msg = 'No se pudo cargar el detalle';
      if (r.status === 404) {
        msg = 'Detalle no disponible. Reinicia el servidor (npm start en server/).';
      }
      $tbody.innerHTML = `<tr><td colspan="5" class="tabla-vacio">${escReporteTexto(msg)}</td></tr>`;
      return;
    }
    const data = await r.json();
    const productos = Array.isArray(data) ? data : [];
    ventasDetalleCache.set(id, productos);
    if (Number(ventaCorteSeleccionadaId) === id) pintarDetalleVentaSeleccionada(productos);
  } catch (err) {
    console.error(err);
    if (Number(ventaCorteSeleccionadaId) === id) {
      $tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacio">Error al cargar el detalle</td></tr>';
    }
  }
}

async function cargarResumenInventarioReportes() {
  const $total = document.getElementById('reporte-inventario-total');
  const $sinStock = document.getElementById('reporte-inventario-sin-stock');
  const $stockTotal = document.getElementById('reporte-inventario-stock-total');
  if (!$total || !$sinStock || !$stockTotal) return;
  const params = anexarSucursalIdParamsReporte(new URLSearchParams());
  try {
    const r = await fetch(`${API}/reportes/resumen-inventario?${params.toString()}`, {
      headers: authHeaders(false),
    });
    if (r.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!r.ok) {
      $total.textContent = '—';
      $sinStock.textContent = '—';
      $stockTotal.textContent = '—';
      return;
    }
    const data = await r.json();
    $total.textContent = String(Number(data.total_productos) || 0);
    $sinStock.textContent = String(Number(data.total_sin_stock) || 0);
    $stockTotal.textContent = String(Number(data.stock_total) || 0);
  } catch (err) {
    console.error(err);
    $total.textContent = '—';
    $sinStock.textContent = '—';
    $stockTotal.textContent = '—';
  }
}

function initVentasCorteDetalleUI() {
  if (initVentasCorteDetalleUI._done) return;
  initVentasCorteDetalleUI._done = true;
  const $tbody = document.getElementById('tbody-reporte-corte-caja');
  $tbody?.addEventListener('click', (e) => {
    if (e.target.closest('[data-abrir-ticket]')) return;
    const $row = e.target.closest('tr[data-venta-id]');
    if (!$row) return;
    const id = Number($row.dataset.ventaId);
    if (!ventasCorteRegistrosCache.has(id)) return;
    ventaCorteSeleccionadaId = ventaCorteSeleccionadaId === id ? null : id;
    renderTablaCorteCajaReporte(ventasCorteListaActual);
  });
}

function renderTablaCorteCajaReporte(lista) {
  const $tbody = document.getElementById('tbody-reporte-corte-caja');
  const $ventas = document.getElementById('reporte-corte-ventas');
  const $total = document.getElementById('reporte-corte-total');
  const $efectivo = document.getElementById('reporte-corte-efectivo');
  const $tarjeta = document.getElementById('reporte-corte-tarjeta');
  const $transferencia = document.getElementById('reporte-corte-transferencia');
  if (!$tbody) return;

  const rows = Array.isArray(lista) ? lista : [];
  ventasCorteListaActual = [...rows];
  ventasCorteRegistrosCache.clear();
  ventasDetalleCache.clear();
  rows.forEach((v) => {
    if (v?.id == null) return;
    const id = Number(v.id);
    ventasCorteRegistrosCache.set(id, v);
    ventasDetalleCache.set(id, normalizarDetalleVentaDesdeFila(v));
  });
  if (ventaCorteSeleccionadaId != null && !ventasCorteRegistrosCache.has(Number(ventaCorteSeleccionadaId))) {
    ventaCorteSeleccionadaId = null;
  }
  const monto = montoVentaReporte;
  let sumaTotal = 0;
  let sumaEfectivo = 0;
  let sumaTarjeta = 0;
  let sumaTransferencia = 0;
  rows.forEach((v) => {
    const totalVenta = Number(v.total) || 0;
    sumaTotal += totalVenta;
    const metodo = String(v.metodo_pago || '').toLowerCase();
    if (metodo === 'tarjeta') sumaTarjeta += totalVenta;
    else if (metodo === 'transferencia') sumaTransferencia += totalVenta;
    else sumaEfectivo += totalVenta;
  });
  if ($ventas) $ventas.textContent = String(rows.length);
  if ($total) $total.textContent = monto(sumaTotal);
  if ($efectivo) $efectivo.textContent = monto(sumaEfectivo);
  if ($tarjeta) $tarjeta.textContent = monto(sumaTarjeta);
  if ($transferencia) $transferencia.textContent = monto(sumaTransferencia);

  if (rows.length === 0) {
    ventaCorteSeleccionadaId = null;
    renderDetalleVentaSeleccionada(null);
    $tbody.innerHTML = '<tr><td colspan="8" class="tabla-vacio">No hay ventas registradas</td></tr>';
    return;
  }
  const listaVisible = ventaCorteSeleccionadaId == null
    ? rows
    : rows.filter((v) => Number(v?.id) === Number(ventaCorteSeleccionadaId));
  $tbody.innerHTML = listaVisible.map((v) => {
    const fecha = formatFecha(v.created_at);
    const folio = Number(v.id) || 0;
    const totalTxt = monto(v.total);
    const filaSeleccionada = Number(v.id) === Number(ventaCorteSeleccionadaId);
    const tienePdf = v.ticket_pdf === true || v.ticket_pdf === 't' || v.ticket_pdf === 'true';
    const ticketCelda = tienePdf
      ? `<td class="tabla-ticket"><a class="btn-ticket-pdf" href="/ticket.html?venta=${folio}" target="_blank" rel="noopener noreferrer" data-abrir-ticket="1" title="Ver ticket" aria-label="Ver ticket #${folio}"><i class="fa-solid fa-file-lines" aria-hidden="true"></i></a></td>`
      : '<td class="tabla-ticket"><span class="btn-ticket-pdf esta-vacio" title="Sin ticket digital">—</span></td>';
    return `
      <tr data-venta-id="${folio}" class="${filaSeleccionada ? 'reporte-mov-row-seleccionada' : ''}">
        <td>${escReporteTexto(fecha)}</td>
        <td>#${escReporteTexto(String(folio))}</td>
        <td>${escReporteTexto(etiquetaMetodoPagoCorteCaja(v.metodo_pago))}</td>
        <td class="tabla-num">${escReporteTexto(String(totalProductosVenta(v)))}</td>
        <td class="tabla-num">${escReporteTexto(totalTxt)}</td>
        <td>${escReporteTexto(v.usuario_nombre || 'Sistema')}</td>
        ${ticketCelda}
        <td>${escReporteTexto(v.sucursal_nombre || 'Sin sucursal')}</td>
      </tr>
    `;
  }).join('');
  void renderDetalleVentaSeleccionada(ventaCorteSeleccionadaId);
}

function etiquetaAccionHistorialProductoReporte(accion) {
  const map = {
    alta: 'Alta',
    edicion: 'Edición',
    eliminacion: 'Eliminación',
  };
  return map[String(accion || '').toLowerCase()] || String(accion || '—');
}

function etiquetaCampoHistorialProductoReporte(campo) {
  const map = {
    nombre: 'Nombre',
    precio: 'Precio',
    precio_max: 'Precio máximo',
    rango_precio: 'Rango de precio',
    stock: 'Stock',
    categoria: 'Categoría',
    imagen: 'Imagen',
  };
  return map[String(campo || '').toLowerCase()] || String(campo || '');
}

function cambioEsCostoCompraHistorial(cambio) {
  const campo = String(cambio?.campo || '').toLowerCase();
  const etiqueta = String(cambio?.etiqueta || '').toLowerCase();
  return campo === 'costo_compra' || etiqueta === 'costo compra';
}

function cambioEsPrecioHistorial(cambio) {
  return String(cambio?.campo || '').toLowerCase() === 'precio';
}

function cambioEsPrecioMaxHistorial(cambio) {
  return String(cambio?.campo || '').toLowerCase() === 'precio_max';
}

function normalizarMonedaRangoPrecioHistorial(valor) {
  if (valor == null || valor === '') return null;
  const raw = String(valor).trim();
  if (!raw || raw === '—') return null;
  const limpio = raw.replace(/[^0-9,.\-]/g, '').replace(/,/g, '');
  const n = Number(limpio);
  if (!Number.isFinite(n)) return raw.replace(/\s+/g, '');
  const minDec = Math.abs(n % 1) < 0.0000001 ? 0 : 2;
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: minDec, maximumFractionDigits: 2 })}`;
}

function textoRangoPrecioHistorial(precio, precioMax) {
  if (precio && precioMax) return `${precio}-${precioMax}`;
  return precio || precioMax || '—';
}

let historialProductosContextoPrecioMap = null;
let historialProductosContextoPrecioPromise = null;
let historialProductosContextoPrecioTs = 0;

async function obtenerContextoPrecioHistorialProductos() {
  const ahora = Date.now();
  if (historialProductosContextoPrecioMap && (ahora - historialProductosContextoPrecioTs) < 10_000) {
    return historialProductosContextoPrecioMap;
  }
  if (historialProductosContextoPrecioPromise) return historialProductosContextoPrecioPromise;
  historialProductosContextoPrecioPromise = (async () => {
    const r = await fetch(`${API}/productos/inventario-todas-sucursales`, {
      headers: authHeaders(false),
    });
    if (!r.ok) throw new Error(`No se pudo cargar contexto de precios (${r.status})`);
    const data = await r.json();
    const mapa = new Map();
    (Array.isArray(data) ? data : []).forEach((p) => {
      const id = Number(p?.id);
      if (!Number.isFinite(id)) return;
      mapa.set(id, {
        precio: p?.precio,
        precio_max: p?.precio_max,
      });
    });
    historialProductosContextoPrecioMap = mapa;
    historialProductosContextoPrecioTs = Date.now();
    return mapa;
  })().finally(() => {
    historialProductosContextoPrecioPromise = null;
  });
  return historialProductosContextoPrecioPromise;
}

async function enriquecerFilasHistorialProductosConContextoPrecio(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  if (!lista.length) return lista;
  try {
    const mapa = await obtenerContextoPrecioHistorialProductos();
    return lista.map((row) => {
      const id = Number(row?.producto_id);
      if (!Number.isFinite(id)) return row;
      const ctx = mapa.get(id);
      if (!ctx) return row;
      return {
        ...row,
        producto_precio: row?.producto_precio ?? ctx.precio ?? null,
        producto_precio_max: row?.producto_precio_max === undefined ? (ctx.precio_max ?? null) : row.producto_precio_max,
      };
    });
  } catch (_) {
    return lista;
  }
}

function combinarCambiosPrecioEnRangoHistorial(cambios, row = null) {
  const base = [];
  let idxInsercion = -1;
  let cambioPrecio = null;
  let cambioPrecioMax = null;

  (Array.isArray(cambios) ? cambios : []).forEach((c) => {
    if (cambioEsPrecioHistorial(c) || cambioEsPrecioMaxHistorial(c)) {
      if (idxInsercion < 0) idxInsercion = base.length;
      if (cambioEsPrecioHistorial(c)) cambioPrecio = c;
      if (cambioEsPrecioMaxHistorial(c)) cambioPrecioMax = c;
      return;
    }
    base.push(c);
  });

  if (!cambioPrecio && !cambioPrecioMax) return base;

  let precioAntes = normalizarMonedaRangoPrecioHistorial(cambioPrecio?.valor_anterior);
  let precioDespues = normalizarMonedaRangoPrecioHistorial(cambioPrecio?.valor_nuevo);
  let precioMaxAntes = normalizarMonedaRangoPrecioHistorial(cambioPrecioMax?.valor_anterior);
  let precioMaxDespues = normalizarMonedaRangoPrecioHistorial(cambioPrecioMax?.valor_nuevo);
  const localProducto = datosProductoAltaDesdeInventarioLocal(row) || {};
  const precioContexto = normalizarMonedaRangoPrecioHistorial(
    row?.producto_precio ?? localProducto.precio
  );
  const precioMaxContexto = normalizarMonedaRangoPrecioHistorial(
    row?.producto_precio_max ?? localProducto.precio_max
  );

  if (precioAntes == null && precioDespues != null) precioAntes = precioDespues;
  if (precioDespues == null && precioAntes != null) precioDespues = precioAntes;
  if (precioAntes == null) precioAntes = precioContexto;
  if (precioDespues == null) precioDespues = precioContexto;

  if (precioMaxAntes == null && precioMaxDespues == null && !cambioPrecioMax && precioMaxContexto != null) {
    precioMaxAntes = precioMaxContexto;
    precioMaxDespues = precioMaxContexto;
  }
  if (precioMaxAntes == null && precioMaxDespues != null) precioMaxAntes = null;
  if (precioMaxDespues == null && precioMaxAntes != null) precioMaxDespues = null;
  const tieneMaxAntes = precioMaxAntes != null;
  const tieneMaxDespues = precioMaxDespues != null;
  const campoResultado = tieneMaxDespues ? 'rango_precio' : 'precio';
  const etiquetaResultado = campoResultado === 'rango_precio' ? 'Rango de precio' : 'Precio';
  const valorAnterior = tieneMaxAntes
    ? textoRangoPrecioHistorial(precioAntes, precioMaxAntes)
    : (precioAntes || textoRangoPrecioHistorial(precioAntes, precioMaxAntes));
  const valorNuevo = tieneMaxDespues
    ? textoRangoPrecioHistorial(precioDespues, precioMaxDespues)
    : (precioDespues || textoRangoPrecioHistorial(precioDespues, precioMaxDespues));

  const cambioRango = {
    campo: campoResultado,
    etiqueta: etiquetaResultado,
    valor_anterior: valorAnterior,
    valor_nuevo: valorNuevo,
  };

  const at = Math.max(0, idxInsercion);
  base.splice(at, 0, cambioRango);
  return base;
}

function filtrarCambiosHistorialProducto(cambios, row = null) {
  const sinCosto = (Array.isArray(cambios) ? cambios : []).filter((c) => !cambioEsCostoCompraHistorial(c));
  return combinarCambiosPrecioEnRangoHistorial(sinCosto, row);
}

function cambiosHistorialProductoDesdeFila(row) {
  const detalle = row?.detalle;
  if (detalle && Array.isArray(detalle.cambios) && detalle.cambios.length) {
    const cambios = filtrarCambiosHistorialProducto(detalle.cambios, row);
    if (cambios.length) return cambios;
  }
  const accion = String(row?.accion || '').toLowerCase();
  if (accion === 'alta') {
    return [{ etiqueta: 'Alta', valor_anterior: '—', valor_nuevo: row.valor_nuevo || 'Producto registrado' }];
  }
  if (accion === 'eliminacion') {
    const stockEliminado = Number(
      detalle?.stock_eliminado
      ?? detalle?.cambios?.[0]?.stock_eliminado
    );
    return [{
      etiqueta: 'Eliminación',
      valor_anterior: row.valor_anterior || 'Producto activo',
      valor_nuevo: row.valor_nuevo || 'Producto eliminado',
      stock_eliminado: Number.isFinite(stockEliminado) ? stockEliminado : null,
    }];
  }
  if (row?.campo && String(row.campo).toLowerCase() !== 'costo_compra') {
    return combinarCambiosPrecioEnRangoHistorial([{
      campo: row.campo,
      etiqueta: etiquetaCampoHistorialProductoReporte(row.campo),
      valor_anterior: row.valor_anterior || '—',
      valor_nuevo: row.valor_nuevo || '—',
    }], row);
  }
  return [];
}

function stockEliminadoHistorialProducto(cambio, row) {
  const n = Number(
    cambio?.stock_eliminado
    ?? row?.detalle?.stock_eliminado
    ?? row?.detalle?.cambios?.[0]?.stock_eliminado
  );
  return Number.isFinite(n) ? n : null;
}

function lineaCambioHistorialProductoReporte(cambio, indice, row) {
  const n = Number(indice) + 1;
  if (cambio?.campo === 'imagen' || cambio?.etiqueta === 'Imagen cambiada') {
    return `${n}.- Imagen cambiada`;
  }
  const etiqueta = cambio?.etiqueta || etiquetaCampoHistorialProductoReporte(cambio?.campo) || 'Cambio';
  const antes = cambio?.valor_anterior || '—';
  const despues = cambio?.valor_nuevo || '—';
  const stock = stockEliminadoHistorialProducto(cambio, row);
  if (cambio?.etiqueta === 'Eliminación' && stock != null) {
    return `${n}.- ${etiqueta}: ${antes} → ${despues} · Stock: ${stock}`;
  }
  return `${n}.- ${etiqueta}: ${antes} → ${despues}`;
}

function htmlLineaCambioHistorialProductoReporte(cambio, indice, row) {
  const n = Number(indice) + 1;
  if (cambio?.campo === 'imagen' || cambio?.etiqueta === 'Imagen cambiada') {
    return `${n}.- Imagen cambiada`;
  }
  const etiqueta = escReporteTexto(cambio?.etiqueta || etiquetaCampoHistorialProductoReporte(cambio?.campo) || 'Cambio');
  const antes = escReporteTexto(cambio?.valor_anterior || '—');
  const despues = escReporteTexto(cambio?.valor_nuevo || '—');
  const stock = stockEliminadoHistorialProducto(cambio, row);
  if (cambio?.etiqueta === 'Eliminación' && stock != null) {
    return `${n}.- ${etiqueta}: ${antes} → ${despues} · Stock: <span class="reporte-historial-stock-eliminado">${escReporteTexto(String(stock))}</span>`;
  }
  return `${n}.- ${etiqueta}: ${antes} → ${despues}`;
}

function htmlCeldaCambiosHistorialProductoReporte(h) {
  const cambios = cambiosHistorialProductoDesdeFila(h);
  if (!cambios.length) {
    return '<span class="reporte-historial-sin-cambio">—</span>';
  }
  const textoHtmlBase = htmlLineaCambioHistorialProductoReporte(cambios[0], 0, h);
  return `
    <div class="reporte-historial-cambios">
      <span class="reporte-historial-cambio-texto">${textoHtmlBase}</span>
    </div>
  `;
}

const historialProductosCambiosCache = new Map();
let historialProductosEdicionListaActual = [];
let reporteHistorialAccionFiltro = '';
let reporteHistorialEdicionSeleccionadoId = null;
let reporteVentasPeriodoFiltro = 'diario';
let reporteVentasFechaFiltro = '';
let reporteVentasFechasActivas = new Set();
let reporteVentasDatepickerApi = null;
let reporteVentasSincronizandoFecha = false;

function fechaHoyLocalInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function deseleccionarChipsPeriodoVentas() {
  document.querySelectorAll('#reporte-ventas-periodo-chips .reporte-accion-chip[data-reporte-ventas-periodo]')
    .forEach((c) => c.classList.remove('activo'));
}

function onFechaVentasElegidaManualmente(val, recargarFn) {
  reporteVentasFechaFiltro = val || '';
  reporteVentasPeriodoFiltro = 'diario';
  deseleccionarChipsPeriodoVentas();
  if (typeof recargarFn === 'function') void recargarFn();
}

function sincronizarFechaVentasUI(val, recargarFn) {
  const $fecha = document.getElementById('reporte-ventas-fecha');
  const fecha = val || fechaHoyLocalInput();
  reporteVentasFechaFiltro = fecha;
  if ($fecha) $fecha.value = fecha;
  reporteVentasSincronizandoFecha = true;
  try {
    reporteVentasDatepickerApi?.setValue?.(fecha);
  } finally {
    reporteVentasSincronizandoFecha = false;
  }
  if (typeof recargarFn === 'function') void recargarFn();
}

function ajustarFechaVentasActiva(recargarFn) {
  if (!esUsuarioAdmin()) {
    forzarVentasSoloHoyVendedor();
    return false;
  }
  const $fecha = document.getElementById('reporte-ventas-fecha');
  if (!$fecha) return false;

  // Diario = el día elegido (por defecto hoy). No saltar al último día con ventas.
  if (reporteVentasPeriodoFiltro === 'diario') {
    const hoy = fechaHoyLocalInput();
    if (!$fecha.value) {
      sincronizarFechaVentasUI(hoy, recargarFn);
      return true;
    }
    reporteVentasFechaFiltro = $fecha.value;
    return false;
  }

  if (!reporteVentasFechasActivas.size) return false;
  const hoy = fechaHoyLocalInput();
  let val = $fecha.value || hoy;
  if (!reporteVentasFechasActivas.has(val)) {
    const candidatas = [...reporteVentasFechasActivas].filter((f) => f <= hoy).sort();
    val = candidatas.pop() || [...reporteVentasFechasActivas].sort().pop();
  }
  if (val && val !== $fecha.value) {
    sincronizarFechaVentasUI(val, recargarFn);
    return true;
  }
  reporteVentasFechaFiltro = $fecha.value || '';
  return false;
}

async function cargarFechasActivasVentas(recargarFn) {
  try {
    const params = anexarSucursalIdParamsReporte(new URLSearchParams());
    const r = await fetch(`${API}/reportes/corte-caja/fechas?${params.toString()}`, { headers: authHeaders(false) });
    if (r.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'No se pudieron cargar las fechas');
    reporteVentasFechasActivas = new Set(
      Array.isArray(data.fechas) ? data.fechas.map((f) => String(f).slice(0, 10)) : []
    );
    reporteVentasSincronizandoFecha = true;
    try {
      reporteVentasDatepickerApi?.setFechasActivas?.(reporteVentasFechasActivas);
      ajustarFechaVentasActiva(recargarFn);
    } finally {
      reporteVentasSincronizandoFecha = false;
    }
  } catch (err) {
    console.error('fechas ventas:', err);
    reporteVentasFechasActivas = new Set();
    reporteVentasDatepickerApi?.setFechasActivas?.(reporteVentasFechasActivas);
  }
}

function initReporteVentasFiltros(recargarFn) {
  const $chips = document.getElementById('reporte-ventas-periodo-chips');
  const $fecha = document.getElementById('reporte-ventas-fecha');
  if (!$chips || !$fecha || initReporteVentasFiltros._done) return;
  initReporteVentasFiltros._done = true;
  if (!$fecha.value) $fecha.value = fechaHoyLocalInput();
  reporteVentasFechaFiltro = $fecha.value || '';
  reporteVentasDatepickerApi = window.initUcDatepicker?.($fecha, {
    soloFechasConRegistros: true,
    fechasActivas: reporteVentasFechasActivas,
    maxHoy: true,
    onChange: (val) => {
      if (!esUsuarioAdmin() || reporteVentasSincronizandoFecha) return;
      onFechaVentasElegidaManualmente(val, recargarFn);
    },
  }) || null;
  void cargarFechasActivasVentas(recargarFn);

  $chips.querySelectorAll('.reporte-accion-chip[data-reporte-ventas-periodo]').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (!esUsuarioAdmin()) return;
      const periodo = String(chip.getAttribute('data-reporte-ventas-periodo') || '').trim().toLowerCase();
      if (!periodo) return;
      reporteVentasPeriodoFiltro = periodo;
      $chips.querySelectorAll('.reporte-accion-chip[data-reporte-ventas-periodo]').forEach((c) => {
        c.classList.toggle(
          'activo',
          String(c.getAttribute('data-reporte-ventas-periodo') || '').trim().toLowerCase() === periodo
        );
      });
      if (periodo === 'diario') {
        sincronizarFechaVentasUI(fechaHoyLocalInput(), recargarFn);
        return;
      }
      if (typeof recargarFn === 'function') void recargarFn();
    });
  });
}

function initReporteHistorialAccionFiltros(recargarFn) {
  const $chips = document.getElementById('reporte-historial-accion-chips');
  if (!$chips || initReporteHistorialAccionFiltros._done) return;
  initReporteHistorialAccionFiltros._done = true;

  $chips.querySelectorAll('.reporte-accion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const accion = String(chip.getAttribute('data-accion') ?? '').trim().toLowerCase();
      reporteHistorialAccionFiltro = accion;
      $chips.querySelectorAll('.reporte-accion-chip').forEach((c) => {
        const val = String(c.getAttribute('data-accion') ?? '').trim().toLowerCase();
        c.classList.toggle('activo', val === accion);
      });
      if (typeof recargarFn === 'function') void recargarFn();
    });
  });
}

function resetReporteHistorialAccionFiltro() {
  reporteHistorialAccionFiltro = '';
  historialProductosEdicionListaActual = [];
  reporteHistorialEdicionSeleccionadoId = null;
  renderEncabezadoTablaHistorialProductosReporte();
  renderDetalleHistorialEdicionSeleccionada(null);
  const $chips = document.getElementById('reporte-historial-accion-chips');
  $chips?.querySelectorAll('.reporte-accion-chip').forEach((c) => {
    const val = String(c.getAttribute('data-accion') ?? '').trim().toLowerCase();
    c.classList.toggle('activo', val === '');
  });
}

function filaHistorialVisibleEnReporte(h) {
  const accion = String(h?.accion || '').toLowerCase().trim();
  if (reporteHistorialAccionFiltro && accion !== reporteHistorialAccionFiltro) return false;
  if (accion !== 'edicion') return true;
  return cambiosHistorialProductoDesdeFila(h).length > 0;
}

function esReporteHistorialChipAltaActivo() {
  return String(reporteHistorialAccionFiltro || '').toLowerCase() === 'alta';
}

function esReporteHistorialChipEliminacionActivo() {
  return String(reporteHistorialAccionFiltro || '').toLowerCase() === 'eliminacion';
}

function esReporteHistorialChipEdicionActivo() {
  return String(reporteHistorialAccionFiltro || '').toLowerCase() === 'edicion';
}

function columnasTablaHistorialProductosReporte() {
  if (esReporteHistorialChipAltaActivo()) return 7;
  if (esReporteHistorialChipEliminacionActivo()) return 5;
  if (esReporteHistorialChipEdicionActivo()) return 5;
  return 6;
}

function renderEncabezadoTablaHistorialProductosReporte() {
  const $tabla = document.getElementById('tabla-reporte-historial-productos');
  const $fila = $tabla?.querySelector('thead tr');
  if (!$fila) return;
  if (esReporteHistorialChipAltaActivo()) {
    $fila.innerHTML = `
      <th>Fecha</th>
      <th>Producto</th>
      <th class="tabla-num">Costo de compra</th>
      <th class="tabla-num">Precio</th>
      <th class="tabla-num">Stock</th>
      <th>Usuario</th>
      <th>Sucursal</th>
    `;
    return;
  }
  if (esReporteHistorialChipEliminacionActivo()) {
    $fila.innerHTML = `
      <th>Fecha</th>
      <th>Producto</th>
      <th class="tabla-num">Stock al eliminar</th>
      <th>Usuario</th>
      <th>Sucursal</th>
    `;
    return;
  }
  if (esReporteHistorialChipEdicionActivo()) {
    $fila.innerHTML = `
      <th>Fecha</th>
      <th>Producto</th>
      <th class="tabla-num">Total de cambios</th>
      <th>Usuario</th>
      <th>Sucursal</th>
    `;
    return;
  }
  $fila.innerHTML = `
    <th>Fecha</th>
    <th>Producto</th>
    <th>Acción</th>
    <th>Cambio</th>
    <th>Usuario</th>
    <th>Sucursal</th>
  `;
}

function datosProductoAltaDesdeInventarioLocal(row) {
  const lista = Array.isArray(productosInventario) ? productosInventario : [];
  if (!lista.length) return null;
  const productoId = Number(row?.producto_id);
  const sucursalId = Number(row?.sucursal_id);
  const nombre = String(row?.producto_nombre || '').trim().toLowerCase();
  let producto = null;
  if (Number.isFinite(productoId)) {
    producto = lista.find((p) => Number(p?.id) === productoId) || null;
  }
  if (!producto && nombre) {
    producto = lista.find((p) => String(p?.nombre || '').trim().toLowerCase() === nombre) || null;
  }
  if (!producto) return null;

  if (Array.isArray(producto?.sucursales_detalle) && producto.sucursales_detalle.length > 0) {
    const detalleSucursal = Number.isFinite(sucursalId)
      ? (producto.sucursales_detalle.find((s) => Number(s?.sucursal_id ?? s?.id_sucursal) === sucursalId) || null)
      : null;
    const origen = detalleSucursal || producto.sucursales_detalle[0];
    return {
      costo_compra: origen?.costo_compra ?? origen?.costoCompra ?? producto?.costo_compra ?? null,
      precio: origen?.precio_venta ?? origen?.precio ?? producto?.precio ?? null,
      precio_max: origen?.precio_max ?? producto?.precio_max ?? null,
      stock: origen?.stock ?? producto?.stock ?? producto?.stock_total ?? null,
    };
  }

  return {
    costo_compra: producto?.costo_compra ?? producto?.costoCompra ?? null,
    precio: producto?.precio_venta ?? producto?.precio ?? null,
    precio_max: producto?.precio_max ?? null,
    stock: producto?.stock ?? producto?.stock_total ?? null,
  };
}

function valorDetalleAltaHistorialProducto(row, campo) {
  const detalle = row?.detalle;
  const campoLower = String(campo || '').toLowerCase();
  const local = datosProductoAltaDesdeInventarioLocal(row) || {};
  const fallbackCampo = {
    costo_compra: row?.producto_costo_compra ?? local.costo_compra,
    precio: row?.producto_precio ?? local.precio,
    stock: row?.producto_stock ?? local.stock,
  };
  if (!detalle || typeof detalle !== 'object') return fallbackCampo[campoLower] ?? null;
  const valorAlta = detalle?.alta?.[campoLower];
  if (valorAlta != null && valorAlta !== '') return valorAlta;
  const valorDirecto = detalle?.[campoLower];
  if (valorDirecto != null && valorDirecto !== '') return valorDirecto;
  const cambios = Array.isArray(detalle?.cambios) ? detalle.cambios : [];
  const cambio = cambios.find((c) => String(c?.campo || '').toLowerCase() === campoLower);
  if (cambio?.valor_nuevo != null && cambio.valor_nuevo !== '') return cambio.valor_nuevo;
  return fallbackCampo[campoLower] ?? null;
}

function formatearStockHistorialAltaReporte(valor) {
  if (valor == null || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return String(Math.max(0, Math.trunc(n)));
}

function stockEliminadoDesdeFilaHistorialProducto(row) {
  const n = Number(
    row?.detalle?.stock_eliminado
    ?? row?.detalle?.cambios?.[0]?.stock_eliminado
  );
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

function renderTablaHistorialProductosAltaReporte(lista) {
  const $tbody = document.getElementById('tbody-reporte-historial-productos');
  if (!$tbody) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    $tbody.innerHTML = '<tr><td colspan="7" class="tabla-vacio">No hay altas registradas</td></tr>';
    return;
  }
  $tbody.innerHTML = lista.map((h) => {
    const fecha = formatFecha(h.created_at);
    const costoCompra = valorDetalleAltaHistorialProducto(h, 'costo_compra');
    const precio = valorDetalleAltaHistorialProducto(h, 'precio');
    const stock = valorDetalleAltaHistorialProducto(h, 'stock');
    return `
      <tr>
        <td>${escReporteTexto(fecha)}</td>
        <td>${escReporteTexto(h.producto_nombre || '—')}</td>
        <td class="tabla-num">${escReporteTexto(formatCostoReporte(costoCompra))}</td>
        <td class="tabla-num">${escReporteTexto(formatCostoReporte(precio))}</td>
        <td class="tabla-num">${escReporteTexto(formatearStockHistorialAltaReporte(stock))}</td>
        <td>${escReporteTexto(h.usuario_nombre || 'Sistema')}</td>
        <td>${escReporteTexto(h.sucursal_nombre || 'Sin sucursal')}</td>
      </tr>
    `;
  }).join('');
}

function renderTablaHistorialProductosEliminacionReporte(lista) {
  const $tbody = document.getElementById('tbody-reporte-historial-productos');
  if (!$tbody) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    $tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacio">No hay eliminaciones registradas</td></tr>';
    return;
  }
  $tbody.innerHTML = lista.map((h) => {
    const fecha = formatFecha(h.created_at);
    const stockEliminado = stockEliminadoDesdeFilaHistorialProducto(h);
    return `
      <tr>
        <td>${escReporteTexto(fecha)}</td>
        <td>${escReporteTexto(h.producto_nombre || '—')}</td>
        <td class="tabla-num">${escReporteTexto(stockEliminado != null ? String(stockEliminado) : '—')}</td>
        <td>${escReporteTexto(h.usuario_nombre || 'Sistema')}</td>
        <td>${escReporteTexto(h.sucursal_nombre || 'Sin sucursal')}</td>
      </tr>
    `;
  }).join('');
}

function etiquetaCampoDetalleEdicionHistorial(cambio) {
  const etiqueta = String(cambio?.etiqueta || '').trim();
  if (etiqueta && etiqueta.toLowerCase() !== 'imagen cambiada') return etiqueta;
  return etiquetaCampoHistorialProductoReporte(cambio?.campo) || 'Campo';
}

function textoSiTeniaImagenHistorial(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'boolean') return valor ? 'Con imagen' : 'Sin imagen';
  const raw = String(valor).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'con imagen') return 'Con imagen';
  if (lower === 'sin imagen') return 'Sin imagen';
  if (lower === 'true' || lower === '1') return 'Con imagen';
  if (lower === 'false' || lower === '0') return 'Sin imagen';
  if (raw.startsWith('data:image') || raw.length > 50) return 'Con imagen';
  return null;
}

function valorDetalleEdicionHistorial(cambio, tipo = 'anterior') {
  const key = tipo === 'nuevo' ? 'valor_nuevo' : 'valor_anterior';
  const esImagen = String(cambio?.campo || '').toLowerCase() === 'imagen'
    || String(cambio?.etiqueta || '').toLowerCase().includes('imagen');
  const valor = cambio?.[key];
  if (esImagen) {
    const textoAnteriorImagen = textoSiTeniaImagenHistorial(cambio?.valor_anterior)
      || textoSiTeniaImagenHistorial(cambio?.tenia_imagen)
      || 'Sin imagen';
    if (tipo === 'nuevo') {
      return textoAnteriorImagen === 'Sin imagen' ? 'Imagen agregada' : 'Imagen cambiada';
    }
    const textoImagen = textoSiTeniaImagenHistorial(valor);
    if (textoImagen) return textoImagen;
    const flagImagen = tipo === 'nuevo' ? cambio?.tiene_imagen : cambio?.tenia_imagen;
    const textoFlag = textoSiTeniaImagenHistorial(flagImagen);
    if (textoFlag) return textoFlag;
    return 'Sin imagen';
  }
  if (valor == null || valor === '') {
    return '—';
  }
  return String(valor);
}

function renderDetalleHistorialEdicionSeleccionada(historialId) {
  const $wrap = document.getElementById('reporte-historial-edicion-detalle-wrap');
  const $tbody = document.getElementById('tbody-reporte-historial-edicion-detalle');
  if (!$wrap || !$tbody) return;
  if (historialId == null || !Number.isFinite(Number(historialId))) {
    $wrap.hidden = true;
    $tbody.innerHTML = '<tr><td colspan="4" class="tabla-vacio">Selecciona un registro para ver el detalle</td></tr>';
    return;
  }
  const cambios = historialProductosCambiosCache.get(Number(historialId)) || [];
  if (!cambios.length) {
    $wrap.hidden = false;
    $tbody.innerHTML = '<tr><td colspan="4" class="tabla-vacio">Este registro no tiene cambios para mostrar</td></tr>';
    return;
  }
  $wrap.hidden = false;
  $tbody.innerHTML = cambios.map((c, i) => {
    const campo = etiquetaCampoDetalleEdicionHistorial(c);
    const anterior = valorDetalleEdicionHistorial(c, 'anterior');
    const nuevo = valorDetalleEdicionHistorial(c, 'nuevo');
    return `
      <tr>
        <td class="tabla-num">${i + 1}</td>
        <td>${escReporteTexto(campo)}</td>
        <td>${escReporteTexto(anterior)}</td>
        <td>${escReporteTexto(nuevo)}</td>
      </tr>
    `;
  }).join('');
}

function renderTablaHistorialProductosEdicionReporte(lista) {
  const $tbody = document.getElementById('tbody-reporte-historial-productos');
  if (!$tbody) return;
  historialProductosEdicionListaActual = Array.isArray(lista) ? [...lista] : [];
  historialProductosCambiosCache.clear();
  historialProductosEdicionListaActual.forEach((h) => {
    if (h?.id == null) return;
    const cambios = cambiosHistorialProductoDesdeFila(h);
    if (cambios.length) historialProductosCambiosCache.set(Number(h.id), cambios);
  });
  if (
    reporteHistorialEdicionSeleccionadoId != null
    && !historialProductosCambiosCache.has(Number(reporteHistorialEdicionSeleccionadoId))
  ) {
    reporteHistorialEdicionSeleccionadoId = null;
  }
  const visible = reporteHistorialEdicionSeleccionadoId == null
    ? historialProductosEdicionListaActual
    : historialProductosEdicionListaActual.filter((h) => Number(h?.id) === Number(reporteHistorialEdicionSeleccionadoId));
  if (!visible.length) {
    $tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacio">No hay ediciones registradas</td></tr>';
    renderDetalleHistorialEdicionSeleccionada(null);
    return;
  }
  $tbody.innerHTML = visible.map((h) => {
    const fecha = formatFecha(h.created_at);
    const filaSeleccionada = Number(h?.id) === Number(reporteHistorialEdicionSeleccionadoId);
    const totalCambios = (historialProductosCambiosCache.get(Number(h?.id)) || []).length;
    return `
      <tr data-historial-edicion-id="${Number(h.id) || 0}" class="${filaSeleccionada ? 'reporte-hist-row-seleccionada' : ''}">
        <td>${escReporteTexto(fecha)}</td>
        <td>${escReporteTexto(h.producto_nombre || '—')}</td>
        <td class="tabla-num">${escReporteTexto(String(totalCambios))}</td>
        <td>${escReporteTexto(h.usuario_nombre || 'Sistema')}</td>
        <td>${escReporteTexto(h.sucursal_nombre || 'Sin sucursal')}</td>
      </tr>
    `;
  }).join('');
  renderDetalleHistorialEdicionSeleccionada(reporteHistorialEdicionSeleccionadoId);
}

function renderTablaHistorialProductosReporte(lista) {
  const $tbody = document.getElementById('tbody-reporte-historial-productos');
  if (!$tbody) return;
  renderEncabezadoTablaHistorialProductosReporte();
  const visible = (Array.isArray(lista) ? lista : []).filter(filaHistorialVisibleEnReporte);
  const esAlta = esReporteHistorialChipAltaActivo();
  const esEliminacion = esReporteHistorialChipEliminacionActivo();
  const esEdicion = esReporteHistorialChipEdicionActivo();
  if (visible.length === 0) {
    const cols = columnasTablaHistorialProductosReporte();
    const vacio = esAlta
      ? 'No hay altas registradas'
      : (esEliminacion
        ? 'No hay eliminaciones registradas'
        : (esEdicion ? 'No hay ediciones registradas' : 'No hay cambios registrados'));
    $tbody.innerHTML = `<tr><td colspan="${cols}" class="tabla-vacio">${escReporteTexto(vacio)}</td></tr>`;
    renderDetalleHistorialEdicionSeleccionada(null);
    return;
  }
  if (esAlta) {
    historialProductosEdicionListaActual = [];
    reporteHistorialEdicionSeleccionadoId = null;
    renderTablaHistorialProductosAltaReporte(visible);
    renderDetalleHistorialEdicionSeleccionada(null);
    return;
  }
  if (esEliminacion) {
    historialProductosEdicionListaActual = [];
    reporteHistorialEdicionSeleccionadoId = null;
    renderTablaHistorialProductosEliminacionReporte(visible);
    renderDetalleHistorialEdicionSeleccionada(null);
    return;
  }
  if (esEdicion) {
    renderTablaHistorialProductosEdicionReporte(visible);
    return;
  }
  historialProductosEdicionListaActual = [];
  reporteHistorialEdicionSeleccionadoId = null;
  historialProductosCambiosCache.clear();
  renderDetalleHistorialEdicionSeleccionada(null);
  visible.forEach((h) => {
    if (h?.id != null) historialProductosCambiosCache.set(Number(h.id), cambiosHistorialProductoDesdeFila(h));
  });
  $tbody.innerHTML = visible.map((h) => {
    const fecha = formatFecha(h.created_at);
    return `
      <tr>
        <td>${escReporteTexto(fecha)}</td>
        <td>${escReporteTexto(h.producto_nombre || '—')}</td>
        <td>${escReporteTexto(etiquetaAccionHistorialProductoReporte(h.accion))}</td>
        <td class="reporte-historial-cambios-cell">${htmlCeldaCambiosHistorialProductoReporte(h)}</td>
        <td>${escReporteTexto(h.usuario_nombre || 'Sistema')}</td>
        <td>${escReporteTexto(h.sucursal_nombre || 'Sin sucursal')}</td>
      </tr>
    `;
  }).join('');
}

function abrirModalHistorialProductosCambios(historialId) {
  const cambios = historialProductosCambiosCache.get(Number(historialId)) || [];
  const $modal = document.getElementById('modal-reporte-historial-cambios');
  const $sub = document.getElementById('modal-reporte-historial-subtitulo');
  const $lista = document.getElementById('modal-reporte-historial-lista');
  if (!$modal || !$lista) return;
  const fila = document.querySelector(`[data-historial-id="${historialId}"]`)?.closest('tr');
  const producto = fila?.querySelector('td:nth-child(2)')?.textContent?.trim() || 'Producto';
  if ($sub) $sub.textContent = producto;
  $lista.innerHTML = cambios.map((c, i) =>
    `<li>${escReporteTexto(lineaCambioHistorialProductoReporte(c, i))}</li>`
  ).join('');
  $modal.classList.add('visible');
  $modal.setAttribute('aria-hidden', 'false');
}

function cerrarModalHistorialProductosCambios() {
  const $modal = document.getElementById('modal-reporte-historial-cambios');
  if (!$modal) return;
  $modal.classList.remove('visible');
  $modal.setAttribute('aria-hidden', 'true');
}

function initHistorialProductosReporteUI() {
  if (initHistorialProductosReporteUI._done) return;
  initHistorialProductosReporteUI._done = true;

  const $tbody = document.getElementById('tbody-reporte-historial-productos');
  const $modal = document.getElementById('modal-reporte-historial-cambios');

  $tbody?.addEventListener('click', (e) => {
    if (!esReporteHistorialChipEdicionActivo()) return;
    const $row = e.target.closest('tr[data-historial-edicion-id]');
    if (!$row) return;
    const id = Number($row.dataset.historialEdicionId);
    if (!historialProductosCambiosCache.has(id)) return;
    reporteHistorialEdicionSeleccionadoId = reporteHistorialEdicionSeleccionadoId === id ? null : id;
    renderTablaHistorialProductosEdicionReporte(historialProductosEdicionListaActual);
  });

  document.getElementById('modal-reporte-historial-cerrar')?.addEventListener('click', cerrarModalHistorialProductosCambios);
  $modal?.addEventListener('click', (e) => {
    if (e.target === $modal) cerrarModalHistorialProductosCambios();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $modal?.classList.contains('visible')) cerrarModalHistorialProductosCambios();
  });
}

const REPORTE_TIPO_DEFAULT = 'movimientos-inventario';
const REPORTE_CHIP_DEFAULT = 'restock';
const REPORTES_CHIPS_CONFIG = {
  restock: {
    tipo: 'movimientos-inventario',
    placeholder: 'Buscar restock...',
    accion: '',
  },
  transferencia: {
    tipo: 'transferencias-sucursales',
    placeholder: 'Buscar transferencia...',
    accion: '',
  },
  alta: {
    tipo: 'historial-productos',
    placeholder: 'Buscar altas...',
    accion: 'alta',
  },
  eliminacion: {
    tipo: 'historial-productos',
    placeholder: 'Buscar eliminaciones...',
    accion: 'eliminacion',
  },
  edicion: {
    tipo: 'historial-productos',
    placeholder: 'Buscar ediciones...',
    accion: 'edicion',
  },
};

const REPORTES_CONFIG = {
  'movimientos-inventario': {
    placeholder: 'Buscar movimiento...',
    endpoint: '/reportes/movimientos-inventario',
    tbodyId: 'tbody-reporte-movimientos',
    cols: 7,
    vacio: 'No hay movimientos registrados',
    cargando: 'Cargando movimientos...',
    error: 'Error al cargar movimientos',
    render: renderTablaMovimientosInventarioReporte,
  },
  'transferencias-sucursales': {
    placeholder: 'Buscar transferencia...',
    endpoint: '/reportes/transferencias-sucursales',
    tbodyId: 'tbody-reporte-transferencias',
    cols: 6,
    vacio: 'No hay transferencias registradas',
    cargando: 'Cargando transferencias...',
    error: 'Error al cargar transferencias',
    render: renderTablaTransferenciasSucursalesReporte,
  },
  'historial-productos': {
    placeholder: 'Buscar historial...',
    endpoint: '/reportes/historial-productos',
    tbodyId: 'tbody-reporte-historial-productos',
    cols: 6,
    vacio: 'No hay cambios registrados',
    cargando: 'Cargando historial...',
    error: 'Error al cargar historial',
    render: renderTablaHistorialProductosReporte,
  },
};

const VENTAS_MODULO_CONFIG = {
  endpoint: '/reportes/corte-caja',
  tbodyId: 'tbody-reporte-corte-caja',
  cols: 7,
  vacio: 'No hay ventas en el periodo',
  cargando: 'Cargando ventas...',
  error: 'Error al cargar ventas',
  render: renderTablaCorteCajaReporte,
};

function initModuloVentas() {
  const $tabVentas = document.getElementById('tab-ventas-modulo');
  const $tabReportes = document.getElementById('tab-reportes-modulo');
  const $svVentas = document.getElementById('subvista-ventas-modulo');
  const $svReportes = document.getElementById('subvista-reportes-modulo');
  const $toolbarReportes = document.getElementById('modulo-toolbar-reportes');
  const $tipoReporte = document.getElementById('reporte-tipo-select');
  const $filtrosMovimientos = document.getElementById('reporte-movimientos-filtros');
  const $chipsMovimientos = document.getElementById('reporte-movimientos-chips');
  const $buscar = document.getElementById('buscar-reporte');
  const $btnRecargar = document.getElementById('btn-recargar-reporte');
  const $btnRecargarVentas = document.getElementById('btn-recargar-ventas');
  const $btnRecargarVentasIcono = document.getElementById('btn-recargar-ventas-icono');
  const $panelesReporte = document.querySelectorAll('#subvista-reportes-modulo .reporte-panel');
  if (!$tabVentas || !$svVentas) return;

  initCustomSelectBasico($tipoReporte);
  initHistorialProductosReporteUI();
  initMovimientosInventarioReporteUI();
  initVentasCorteDetalleUI();
  initReporteVentasFiltros(() => cargarVentasModulo());

  let reporteReqId = 0;
  let ventasReqId = 0;
  let debounceBuscar = null;
  let reporteActivo = REPORTES_CHIPS_CONFIG[REPORTE_CHIP_DEFAULT]?.tipo || REPORTE_TIPO_DEFAULT;
  let reporteChipActivo = REPORTE_CHIP_DEFAULT;

  function configChipActivo() {
    return REPORTES_CHIPS_CONFIG[reporteChipActivo] || REPORTES_CHIPS_CONFIG[REPORTE_CHIP_DEFAULT];
  }

  function configReporteActivo() {
    return REPORTES_CONFIG[reporteActivo] || null;
  }

  function actualizarControlesReporteToolbar() {
    const cfg = configReporteActivo();
    const cfgChip = configChipActivo();
    const tieneBusqueda = Boolean(cfg);
    if ($buscar) {
      $buscar.hidden = !tieneBusqueda;
      $buscar.disabled = !tieneBusqueda;
      $buscar.placeholder = cfgChip?.placeholder || cfg?.placeholder || 'Buscar...';
    }
    if ($btnRecargar) {
      $btnRecargar.hidden = !tieneBusqueda;
      $btnRecargar.disabled = !tieneBusqueda;
    }
  }

  function mostrarPanelReporte(tipo, { recargar = true } = {}) {
    reporteActivo = tipo;
    $panelesReporte.forEach(($panel) => {
      const activo = $panel.dataset.reporte === tipo;
      $panel.hidden = !activo;
    });
    actualizarControlesReporteToolbar();
    if (recargar && REPORTES_CONFIG[tipo]) void cargarReporteActivo();
  }

  function activarChipReporte(chip, { limpiarBusqueda = true, recargar = true } = {}) {
    const cfgChip = REPORTES_CHIPS_CONFIG[chip];
    if (!cfgChip) return;
    reporteChipActivo = chip;
    reporteHistorialAccionFiltro = cfgChip.accion || '';
    historialProductosEdicionListaActual = [];
    reporteHistorialEdicionSeleccionadoId = null;
    renderDetalleHistorialEdicionSeleccionada(null);
    if (cfgChip.tipo === 'historial-productos') renderEncabezadoTablaHistorialProductosReporte();
    reporteMovimientoSeleccionadoId = null;
    renderDetalleMovimientoInventarioSeleccionado(null);
    $chipsMovimientos?.querySelectorAll('.reporte-accion-chip[data-reporte-chip]').forEach((btn) => {
      const activo = btn.dataset.reporteChip === chip;
      btn.classList.toggle('activo', activo);
    });
    if (limpiarBusqueda && $buscar) $buscar.value = '';
    mostrarPanelReporte(cfgChip.tipo, { recargar });
  }

  async function cargarVentasModulo() {
    const cfg = VENTAS_MODULO_CONFIG;
    const $tbody = document.getElementById(cfg.tbodyId);
    ventaCorteSeleccionadaId = null;
    forzarVentasSoloHoyVendedor();
    const reqId = ++ventasReqId;
    if ($tbody) {
      $tbody.innerHTML = `<tr><td colspan="${cfg.cols}" class="tabla-vacio">${escReporteTexto(cfg.cargando)}</td></tr>`;
    }
    const params = anexarSucursalIdParamsReporte(new URLSearchParams({ limit: '300' }));
    params.set('periodo', reporteVentasPeriodoFiltro || 'diario');
    if (reporteVentasFechaFiltro) params.set('fecha', reporteVentasFechaFiltro);
    try {
      const r = await fetch(`${API}${cfg.endpoint}?${params.toString()}`, {
        headers: authHeaders(false),
      });
      if (reqId !== ventasReqId) return;
      if (r.status === 401) {
        window.location.href = '/login.html';
        return;
      }
      if (!r.ok) {
        let msg = cfg.error;
        if (r.status === 404) {
          msg = 'Ruta de ventas no encontrada. Reinicia el servidor (npm start en server/).';
        } else {
          try {
            const err = await r.json();
            if (err?.error) msg = `Error: ${err.error}`;
          } catch (_) {}
        }
        if ($tbody) {
          $tbody.innerHTML = `<tr><td colspan="${cfg.cols}" class="tabla-vacio">${escReporteTexto(msg)}</td></tr>`;
        }
        return;
      }
      const data = await r.json();
      cfg.render(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      if (reqId !== ventasReqId) return;
      if ($tbody) {
        $tbody.innerHTML = `<tr><td colspan="${cfg.cols}" class="tabla-vacio">${escReporteTexto(cfg.error)}</td></tr>`;
      }
    }
  }

  async function cargarReporteActivo() {
    const cfg = configReporteActivo();
    if (!cfg) return;
    const $tbody = document.getElementById(cfg.tbodyId);
    const cols = (reporteActivo === 'historial-productos')
      ? columnasTablaHistorialProductosReporte()
      : cfg.cols;
    const reqId = ++reporteReqId;
    if ($tbody) {
      $tbody.innerHTML = `<tr><td colspan="${cols}" class="tabla-vacio">${escReporteTexto(cfg.cargando)}</td></tr>`;
    }
    const params = anexarSucursalIdParamsReporte(new URLSearchParams({ limit: '300' }));
    const q = ($buscar?.value || '').trim();
    if (q) params.set('q', q);
    if (reporteActivo === 'historial-productos' && reporteHistorialAccionFiltro) {
      params.set('accion', reporteHistorialAccionFiltro);
    }
    try {
      const r = await fetch(`${API}${cfg.endpoint}?${params.toString()}`, {
        headers: authHeaders(false),
      });
      if (reqId !== reporteReqId) return;
      if (r.status === 401) {
        window.location.href = '/login.html';
        return;
      }
      if (!r.ok) {
        let msg = cfg.error;
        if (r.status === 404) {
          msg = 'Ruta de reportes no encontrada. Reinicia el servidor (npm start en server/).';
        } else {
          try {
            const err = await r.json();
            if (err?.error) msg = `Error: ${err.error}`;
          } catch (_) {}
        }
        if ($tbody) {
          $tbody.innerHTML = `<tr><td colspan="${cols}" class="tabla-vacio">${escReporteTexto(msg)}</td></tr>`;
        }
        return;
      }
      const data = await r.json();
      let filas = Array.isArray(data) ? data : [];
      if (reporteActivo === 'historial-productos') {
        filas = await enriquecerFilasHistorialProductosConContextoPrecio(filas);
      }
      cfg.render(filas);
    } catch (err) {
      console.error(err);
      if (reqId !== reporteReqId) return;
      if ($tbody) {
        $tbody.innerHTML = `<tr><td colspan="${cols}" class="tabla-vacio">${escReporteTexto(cfg.error)}</td></tr>`;
      }
    }
  }

  function irASubvista(sub = 'ventas') {
    const modo = (!esUsuarioAdmin() || sub !== 'reportes') ? 'ventas' : 'reportes';
    $tabVentas.classList.toggle('activo', modo === 'ventas');
    $tabReportes?.classList.toggle('activo', modo === 'reportes');
    $svVentas.style.display = modo === 'ventas' ? '' : 'none';
    if ($svReportes) $svReportes.style.display = modo === 'reportes' ? '' : 'none';
    if ($toolbarReportes) $toolbarReportes.hidden = modo !== 'reportes';
    try { localStorage.setItem(VENTAS_SUBMODULO_KEY, modo); } catch (_) {}
    if (modo === 'reportes') {
      void cargarResumenInventarioReportes();
      activarChipReporte(reporteChipActivo, { limpiarBusqueda: false, recargar: true });
    } else {
      void cargarFechasActivasVentas(() => cargarVentasModulo());
      void cargarVentasModulo();
    }
  }

  $tabVentas.addEventListener('click', () => irASubvista('ventas'));
  $tabReportes?.addEventListener('click', () => irASubvista('reportes'));
  $chipsMovimientos?.querySelectorAll('.reporte-accion-chip[data-reporte-chip]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = String(chip.dataset.reporteChip || '').trim().toLowerCase();
      if (!REPORTES_CHIPS_CONFIG[id]) return;
      activarChipReporte(id, { limpiarBusqueda: true, recargar: true });
    });
  });
  $btnRecargar?.addEventListener('click', () => {
    void cargarResumenInventarioReportes();
    void cargarReporteActivo();
  });
  $buscar?.addEventListener('input', () => {
    if (!REPORTES_CONFIG[reporteActivo]) return;
    clearTimeout(debounceBuscar);
    debounceBuscar = setTimeout(() => { void cargarReporteActivo(); }, 250);
  });
  function recargarVentasModuloUI() {
    if (esUsuarioAdmin()) {
      void cargarFechasActivasVentas(() => cargarVentasModulo());
    } else {
      forzarVentasSoloHoyVendedor();
      void cargarVentasModulo();
    }
  }
  $btnRecargarVentas?.addEventListener('click', recargarVentasModuloUI);
  $btnRecargarVentasIcono?.addEventListener('click', recargarVentasModuloUI);

  window.ucVentasIrASubvista = irASubvista;
  window.ucRecargarReporteActivo = () => { void cargarReporteActivo(); };
  window.ucRecargarVentasModulo = () => { recargarVentasModuloUI(); };
  window.ucRecargarResumenInventarioReportes = () => { void cargarResumenInventarioReportes(); };
  activarChipReporte(REPORTE_CHIP_DEFAULT, { limpiarBusqueda: false, recargar: false });
  actualizarControlesReporteToolbar();
  aplicarUiPermisosModuloVentas();
  const subGuardado = localStorage.getItem(VENTAS_SUBMODULO_KEY);
  const subInicial = esUsuarioAdmin() && subGuardado === 'reportes' ? 'reportes' : 'ventas';
  irASubvista(subInicial);
}

function initModulo() {
  const $tabUsuarios = document.getElementById('tab-usuarios');
  const $tabSucursales = document.getElementById('tab-sucursales');
  const $svUsuarios = document.getElementById('subvista-usuarios');
  const $svSucursales = document.getElementById('subvista-sucursales');

  $tabUsuarios.addEventListener('click', () => {
    $tabUsuarios.classList.add('activo'); $tabSucursales.classList.remove('activo');
    $svUsuarios.style.display = ''; $svSucursales.style.display = 'none';
  });
  $tabSucursales.addEventListener('click', () => {
    $tabSucursales.classList.add('activo'); $tabUsuarios.classList.remove('activo');
    $svSucursales.style.display = ''; $svUsuarios.style.display = 'none';
    cargarSucursales();
  });

  initUsuarios();
  initSucursales();
  initConfirmar();
}

// ===================== USUARIOS =====================

let todosUsuarios = [];
let todasSucursales = [];

async function cargarUsuarios() {
  try {
    const r = await fetch(`${API}/usuarios`, { headers: authHeaders(false) });
    if (r.status === 401) return window.location.href = '/login.html';
    todosUsuarios = await r.json();
    renderTablaUsuarios(todosUsuarios);
  } catch (err) { console.error(err); }
}

function renderTablaUsuarios(lista) {
  const $tbody = document.getElementById('tbody-usuarios');
  if (lista.length === 0) {
    $tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;opacity:.5;padding:2rem">No se encontraron usuarios</td></tr>';
    return;
  }
  $tbody.innerHTML = lista.map(u => `
    <tr>
      <td class="tabla-num">${u.id}</td>
      <td>${u.usuario}</td>
      <td>${u.nombre}</td>
      <td><span class="badge ${claseBadgeRol(u.rol)}">${escHtmlInventario(etiquetaRolUsuario(u.rol))}</span></td>
      <td>${u.sucursal_nombre || '<span style="opacity:.4">—</span>'}</td>
      <td><span class="badge ${u.activo ? 'badge-activo' : 'badge-inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn-tabla" onclick="editarUsuario(${u.id})">Editar</button>
        <button class="btn-tabla btn-tabla-danger" onclick="eliminarUsuario(${u.id}, '${u.usuario}')">Eliminar</button>
      </td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--text-muted)">${formatFecha(u.created_at)}</td>
    </tr>
  `).join('');
}

function initUsuarios() {
  document.getElementById('buscar-usuario').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    renderTablaUsuarios(todosUsuarios.filter(u =>
      u.usuario.toLowerCase().includes(q) || u.nombre.toLowerCase().includes(q) || u.rol.includes(q)
    ));
  });

  document.getElementById('btn-nuevo-usuario').addEventListener('click', () => abrirModalUsuario());
  document.getElementById('mu-rol')?.addEventListener('change', actualizarRequeridoSucursalModalUsuario);
  document.getElementById('modal-usuario-cancelar').addEventListener('click', cerrarModalUsuario);
  document.getElementById('modal-usuario').addEventListener('click', e => { if (e.target.id === 'modal-usuario') cerrarModalUsuario(); });

  document.getElementById('form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target.dataset.editId;
    const datos = {
      usuario: document.getElementById('mu-usuario').value.trim(),
      nombre: document.getElementById('mu-nombre').value.trim(),
      rol: document.getElementById('mu-rol').value,
      activo: document.getElementById('mu-activo').value === 'true',
      sucursal_id: document.getElementById('mu-sucursal').value || null,
    };
    const pass = document.getElementById('mu-password').value;
    if (pass) datos.password = pass;
    if (!id && !pass) return alert('La contraseña es requerida para usuarios nuevos');
    if (rolRequiereSucursalAsignada(datos.rol) && !datos.sucursal_id) {
      return alert('Admin y vendedor deben tener una sucursal asignada');
    }

    try {
      let r;
      const url = id ? `${API}/usuarios/${id}` : `${API}/usuarios`;
      const opts = id
        ? { method: 'PUT', headers: authHeaders(), body: JSON.stringify(datos) }
        : { method: 'POST', headers: authHeaders(), body: JSON.stringify(datos) };
      r = await fetch(url, opts);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return alert(data.error || 'Error al guardar (' + r.status + ')');
      cerrarModalUsuario();
      cargarUsuarios();
    } catch (err) {
      console.error(err);
      alert('Error de conexión. Asegúrate de: 1) Tener el servidor corriendo (npm start en carpeta server), 2) Acceder por http://localhost:3000');
    }
  });
}

function poblarSelectSucursales(opcional = true) {
  const $sel = document.getElementById('mu-sucursal');
  const val = $sel.value;
  const placeholder = opcional
    ? '<option value="">Sin asignar</option>'
    : '<option value="" disabled selected hidden>Seleccionar sucursal</option>';
  $sel.innerHTML = placeholder
    + todasSucursales.filter(esSucursalActiva).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  $sel.required = !opcional;
  if (val) $sel.value = val;
}

function actualizarRequeridoSucursalModalUsuario() {
  const requiere = rolRequiereSucursalAsignada(document.getElementById('mu-rol')?.value);
  poblarSelectSucursales(!requiere);
}

function abrirModalUsuario(usuario = null) {
  const $modal = document.getElementById('modal-usuario');
  const $form = document.getElementById('form-usuario');
  const $pass = document.getElementById('mu-password');
  $form.reset();
  if (usuario) {
    document.getElementById('modal-usuario-titulo').textContent = 'Editar usuario';
    $form.dataset.editId = usuario.id;
    document.getElementById('mu-usuario').value = usuario.usuario;
    document.getElementById('mu-nombre').value = usuario.nombre;
    document.getElementById('mu-rol').value = normalizarRolUsuario(usuario.rol);
    actualizarRequeridoSucursalModalUsuario();
    document.getElementById('mu-sucursal').value = usuario.sucursal_id || '';
    document.getElementById('mu-activo').value = String(usuario.activo);
    $pass.placeholder = 'Dejar vacío para no cambiar'; $pass.required = false;
  } else {
    document.getElementById('modal-usuario-titulo').textContent = 'Nuevo usuario';
    delete $form.dataset.editId;
    actualizarRequeridoSucursalModalUsuario();
    $pass.placeholder = 'Contraseña'; $pass.required = true;
  }
  $modal.classList.add('visible');
}

function cerrarModalUsuario() { document.getElementById('modal-usuario').classList.remove('visible'); }
function editarUsuario(id) { const u = todosUsuarios.find(x => x.id === id); if (u) abrirModalUsuario(u); }

function eliminarUsuario(id, nombre) {
  abrirConfirmar(`¿Eliminar al usuario "${nombre}"?`, async () => {
    const r = await fetch(`${API}/usuarios/${id}`, { method: 'DELETE', headers: authHeaders(false) });
    if (!r.ok) { const d = await r.json(); alert(d.error); }
    cargarUsuarios();
  });
}

// ===================== SUCURSALES =====================

async function cargarSucursales() {
  try {
    const r = await fetch(`${API}/sucursales`, { headers: authHeaders(false) });
    todasSucursales = await r.json();
    renderTablaSucursales(todasSucursales);
  } catch (err) { console.error(err); }
}

function renderTablaSucursales(lista) {
  const $tbody = document.getElementById('tbody-sucursales');
  if (lista.length === 0) {
    $tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:.5;padding:2rem">No se encontraron sucursales</td></tr>';
    return;
  }
  $tbody.innerHTML = lista.map(s => `
    <tr>
      <td class="tabla-num">${s.id}</td>
      <td>${s.nombre}</td>
      <td class="tabla-num">${s.empleados || '<span style="opacity:.4">Sin empleados</span>'}</td>
      <td><span class="badge ${s.activo ? 'badge-activo' : 'badge-inactivo'}">${s.activo ? 'Activa' : 'Inactiva'}</span></td>
      <td>
        <button class="btn-tabla" onclick="editarSucursal(${s.id})">Editar</button>
        <button class="btn-tabla btn-tabla-danger" onclick="eliminarSucursal(${s.id}, '${s.nombre}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function initSucursales() {
  document.getElementById('buscar-sucursal').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    renderTablaSucursales(todasSucursales.filter(s =>
      s.nombre.toLowerCase().includes(q) || (s.direccion || '').toLowerCase().includes(q)
    ));
  });

  document.getElementById('btn-nueva-sucursal').addEventListener('click', () => abrirModalSucursal());
  document.getElementById('modal-sucursal-cancelar').addEventListener('click', cerrarModalSucursal);
  document.getElementById('modal-sucursal').addEventListener('click', e => { if (e.target.id === 'modal-sucursal') cerrarModalSucursal(); });

  document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target.dataset.editId;
    const datos = {
      nombre: document.getElementById('ms-nombre').value.trim(),
      activo: document.getElementById('ms-activo').value === 'true',
    };
    try {
      let r;
      if (id) {
        r = await fetch(`${API}/sucursales/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(datos) });
      } else {
        r = await fetch(`${API}/sucursales`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(datos) });
      }
      const data = await r.json();
      if (!r.ok) return alert(data.error || 'Error al guardar');
      cerrarModalSucursal();
      cargarSucursales();
      if (id && !datos.activo && String(leerDatasetSucursalInventario().raw) === String(id)) {
        aplicarSeleccionSucursal('all', 'Todas las sucursales');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión. Asegúrate de: 1) Tener el servidor corriendo (npm start en carpeta server), 2) Acceder por http://localhost:3000');
    }
  });
}

function abrirModalSucursal(sucursal = null) {
  const $modal = document.getElementById('modal-sucursal');
  const $form = document.getElementById('form-sucursal');
  $form.reset();
  if (sucursal) {
    document.getElementById('modal-sucursal-titulo').textContent = 'Editar sucursal';
    $form.dataset.editId = sucursal.id;
    document.getElementById('ms-nombre').value = sucursal.nombre;
    document.getElementById('ms-activo').value = String(sucursal.activo);
  } else {
    document.getElementById('modal-sucursal-titulo').textContent = 'Nueva sucursal';
    delete $form.dataset.editId;
  }
  $modal.classList.add('visible');
}

function cerrarModalSucursal() { document.getElementById('modal-sucursal').classList.remove('visible'); }
function editarSucursal(id) { const s = todasSucursales.find(x => x.id === id); if (s) abrirModalSucursal(s); }

function eliminarSucursal(id, nombre) {
  abrirConfirmar(`¿Eliminar la sucursal "${nombre}"?`, async () => {
    const r = await fetch(`${API}/sucursales/${id}`, { method: 'DELETE', headers: authHeaders(false) });
    if (!r.ok) { const d = await r.json(); alert(d.error); }
    cargarSucursales();
  });
}

// ===================== MÓDULO CLIENTES Y PROVEEDORES =====================

let todosClientes = [];
let todosProveedores = [];

function initModuloClientes() {
  const $tabClientes = document.getElementById('tab-clientes');
  const $tabProveedores = document.getElementById('tab-proveedores');
  const $svClientes = document.getElementById('subvista-clientes');
  const $svProveedores = document.getElementById('subvista-proveedores');

  $tabClientes.addEventListener('click', () => {
    $tabClientes.classList.add('activo'); $tabProveedores.classList.remove('activo');
    $svClientes.style.display = ''; $svProveedores.style.display = 'none';
  });
  $tabProveedores.addEventListener('click', () => {
    $tabProveedores.classList.add('activo'); $tabClientes.classList.remove('activo');
    $svProveedores.style.display = ''; $svClientes.style.display = 'none';
    cargarProveedores();
  });

  initClientes();
  initProveedores();
  // Restringir input: teléfono y cuenta bancaria solo dígitos
  ['mc-telefono', 'mp-telefono'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, 10); });
  });
  }

// ===================== CLIENTES =====================

async function cargarClientes() {
  try {
    const r = await fetch(`${API}/clientes`, { headers: authHeaders(false) });
    if (r.status === 401) return window.location.href = '/login.html';
    todosClientes = await r.json();
    renderTablaClientes(todosClientes);
  } catch (err) { console.error(err); }
}

function renderTablaClientes(lista) {
  const $tbody = document.getElementById('tbody-clientes');
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  if (lista.length === 0) {
    $tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;opacity:.5;padding:2rem">No se encontraron clientes</td></tr>';
    return;
  }
  $tbody.innerHTML = lista.map(c => `
    <tr>
      <td class="tabla-num">${c.id}</td>
      <td>${esc(c.nombre)}</td>
      <td class="tabla-num">${esc(c.telefono) || '<span style="opacity:.4">—</span>'}</td>
      <td>${esc(c.correo) || '<span style="opacity:.4">—</span>'}</td>
      <td>${esc(c.direccion) || '<span style="opacity:.4">—</span>'}</td>
      <td>
        <button class="btn-tabla" onclick="editarCliente(${c.id})">Editar</button>
        <button class="btn-tabla btn-tabla-danger" onclick="eliminarCliente(${c.id}, '${esc(c.nombre).replace(/'/g, "\\'")}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function initClientes() {
  document.getElementById('buscar-cliente').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    renderTablaClientes(todosClientes.filter(c =>
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.telefono || '').toLowerCase().includes(q) ||
      (c.correo || '').toLowerCase().includes(q) ||
      (c.direccion || '').toLowerCase().includes(q)
    ));
  });

  document.getElementById('btn-nuevo-cliente').addEventListener('click', () => abrirModalCliente());
  document.getElementById('modal-cliente-cancelar').addEventListener('click', cerrarModalCliente);
  document.getElementById('modal-cliente').addEventListener('click', e => { if (e.target.id === 'modal-cliente') cerrarModalCliente(); });

  document.getElementById('form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tel = document.getElementById('mc-telefono').value.trim();
    const cor = document.getElementById('mc-correo').value.trim();
    const errTel = validaciones.telefono(tel);
    const errCor = validaciones.correo(cor);
    if (errTel !== true) return alert(errTel);
    if (errCor !== true) return alert(errCor);
    const id = e.target.dataset.editId;
    const datos = {
      nombre: document.getElementById('mc-nombre').value.trim(),
      telefono: tel || null,
      correo: cor || null,
      direccion: document.getElementById('mc-direccion').value.trim() || null,
    };
    try {
      let r;
      if (id) {
        r = await fetch(`${API}/clientes/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(datos) });
      } else {
        r = await fetch(`${API}/clientes`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(datos) });
      }
      const data = await r.json();
      if (!r.ok) return alert(data.error || 'Error al guardar');
      cerrarModalCliente();
      cargarClientes();
    } catch (err) {
      console.error(err);
      alert('Error de conexión. Asegúrate de: 1) Tener el servidor corriendo (npm start en carpeta server), 2) Acceder por http://localhost:3000');
    }
  });
}

function abrirModalCliente(cliente = null) {
  const $form = document.getElementById('form-cliente');
  $form.reset();
  if (cliente) {
    document.getElementById('modal-cliente-titulo').textContent = 'Editar cliente';
    $form.dataset.editId = cliente.id;
    document.getElementById('mc-nombre').value = cliente.nombre || '';
    document.getElementById('mc-telefono').value = cliente.telefono || '';
    document.getElementById('mc-correo').value = cliente.correo || '';
    document.getElementById('mc-direccion').value = cliente.direccion || '';
  } else {
    document.getElementById('modal-cliente-titulo').textContent = 'Nuevo cliente';
    delete $form.dataset.editId;
  }
  document.getElementById('modal-cliente').classList.add('visible');
}

function cerrarModalCliente() { document.getElementById('modal-cliente').classList.remove('visible'); }
function editarCliente(id) { const c = todosClientes.find(x => x.id === id); if (c) abrirModalCliente(c); }

function eliminarCliente(id, nombre) {
  abrirConfirmar(`¿Eliminar al cliente "${nombre}"?`, async () => {
    const r = await fetch(`${API}/clientes/${id}`, { method: 'DELETE', headers: authHeaders(false) });
    if (!r.ok) { const d = await r.json(); alert(d.error); }
    cargarClientes();
  });
}

// ===================== PROVEEDORES =====================

async function cargarProveedores() {
  try {
    const r = await fetch(`${API}/proveedores`, { headers: authHeaders(false) });
    if (r.status === 401) return window.location.href = '/login.html';
    todosProveedores = await r.json();
    renderTablaProveedores(todosProveedores);
  } catch (err) { console.error(err); }
}

function renderTablaProveedores(lista) {
  const $tbody = document.getElementById('tbody-proveedores');
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  if (lista.length === 0) {
    $tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;opacity:.5;padding:2rem">No se encontraron proveedores</td></tr>';
    return;
  }
  $tbody.innerHTML = lista.map(p => `
    <tr>
      <td class="tabla-num">${p.id}</td>
      <td>${esc(p.nombre)}</td>
      <td>${esc(p.rfc) || '<span style="opacity:.4">—</span>'}</td>
      <td class="tabla-num">${esc(p.telefono) || '<span style="opacity:.4">—</span>'}</td>
      <td>${esc(p.correo) || '<span style="opacity:.4">—</span>'}</td>
      <td>${esc(p.direccion) || '<span style="opacity:.4">—</span>'}</td>
      <td>
        <button class="btn-tabla" onclick="editarProveedor(${p.id})">Editar</button>
        <button class="btn-tabla btn-tabla-danger" onclick="eliminarProveedor(${p.id}, '${esc(p.nombre).replace(/'/g, "\\'")}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function initProveedores() {
  document.getElementById('buscar-proveedor').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    renderTablaProveedores(todosProveedores.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.rfc || '').toLowerCase().includes(q) ||
      (p.telefono || '').toLowerCase().includes(q) ||
      (p.correo || '').toLowerCase().includes(q)
    ));
  });

  document.getElementById('btn-nuevo-proveedor').addEventListener('click', () => abrirModalProveedor());
  document.getElementById('modal-proveedor-cancelar').addEventListener('click', cerrarModalProveedor);
  document.getElementById('modal-proveedor').addEventListener('click', e => { if (e.target.id === 'modal-proveedor') cerrarModalProveedor(); });

  document.getElementById('form-proveedor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tel = document.getElementById('mp-telefono').value.trim();
    const cor = document.getElementById('mp-correo').value.trim();
    const rfc = document.getElementById('mp-rfc').value.trim().replace(/\s/g, '');
    const errTel = validaciones.telefono(tel);
    const errCor = validaciones.correo(cor);
    const errRfc = validaciones.rfc(rfc);
    if (errTel !== true) return alert(errTel);
    if (errCor !== true) return alert(errCor);
    if (errRfc !== true) return alert(errRfc);
    const id = e.target.dataset.editId;
    const datos = {
      nombre: document.getElementById('mp-nombre').value.trim(),
      rfc: rfc || null,
      telefono: tel || null,
      correo: cor || null,
      direccion: document.getElementById('mp-direccion').value.trim() || null,
    };
    try {
      let r;
      if (id) {
        r = await fetch(`${API}/proveedores/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(datos) });
      } else {
        r = await fetch(`${API}/proveedores`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(datos) });
      }
      const data = await r.json();
      if (!r.ok) return alert(data.error || 'Error al guardar');
      cerrarModalProveedor();
      cargarProveedores();
    } catch (err) {
      console.error(err);
      alert('Error de conexión. Asegúrate de: 1) Tener el servidor corriendo (npm start en carpeta server), 2) Acceder por http://localhost:3000');
    }
  });
}

function abrirModalProveedor(proveedor = null) {
  const $form = document.getElementById('form-proveedor');
  $form.reset();
  if (proveedor) {
    document.getElementById('modal-proveedor-titulo').textContent = 'Editar proveedor';
    $form.dataset.editId = proveedor.id;
    document.getElementById('mp-nombre').value = proveedor.nombre || '';
    document.getElementById('mp-rfc').value = proveedor.rfc || '';
    document.getElementById('mp-telefono').value = proveedor.telefono || '';
    document.getElementById('mp-correo').value = proveedor.correo || '';
    document.getElementById('mp-direccion').value = proveedor.direccion || '';
  } else {
    document.getElementById('modal-proveedor-titulo').textContent = 'Nuevo proveedor';
    delete $form.dataset.editId;
  }
  document.getElementById('modal-proveedor').classList.add('visible');
}

function cerrarModalProveedor() { document.getElementById('modal-proveedor').classList.remove('visible'); }
function editarProveedor(id) { const p = todosProveedores.find(x => x.id === id); if (p) abrirModalProveedor(p); }

function eliminarProveedor(id, nombre) {
  abrirConfirmar(`¿Eliminar al proveedor "${nombre}"?`, async () => {
    const r = await fetch(`${API}/proveedores/${id}`, { method: 'DELETE', headers: authHeaders(false) });
    if (!r.ok) { const d = await r.json(); alert(d.error); }
    cargarProveedores();
  });
}

// ===================== MODAL CONFIRMAR =====================

let confirmarCallback = null;
function initConfirmar() {
  document.getElementById('confirmar-cancelar').addEventListener('click', cerrarConfirmar);
  document.getElementById('modal-confirmar').addEventListener('click', e => { if (e.target.id === 'modal-confirmar') cerrarConfirmar(); });
  document.getElementById('confirmar-ok').addEventListener('click', async () => {
    if (confirmarCallback) await confirmarCallback();
    cerrarConfirmar();
  });
}

function eliminarProductoDesdeInventario(id, nombre, esConsignado = false) {
  if (!puedeGestionarInventario()) return;
  const tipo = esConsignado ? 'producto consignado' : 'producto';
  abrirConfirmar(`¿Eliminar el ${tipo} "${nombre}"?`, async () => {
    const url = esConsignado
      ? `${API}/productos-consignados/${id}`
      : `${API}/productos/${id}`;
    const r = await fetch(url, { method: 'DELETE', headers: authHeaders(false) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || `No se pudo eliminar el ${tipo}`);
      return;
    }
    await window.ucCargarInventarioProductos?.({ forzar: true });
  });
}

function abrirConfirmar(texto, cb) {
  confirmarCallback = cb;
  document.getElementById('confirmar-texto').textContent = texto;
  document.getElementById('modal-confirmar').classList.add('visible');
}

function cerrarConfirmar() {
  document.getElementById('modal-confirmar').classList.remove('visible');
  confirmarCallback = null;
}
