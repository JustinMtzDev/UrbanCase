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
let token = '';

(async () => {
  token = localStorage.getItem('uc_token');
  if (!token) return window.location.href = '/login.html';
  try {
    const r = await fetch(`${API}/auth/me`, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) throw 0;
    const u = await r.json();
    const $info = document.getElementById('usuario-info');
    const $nombre = document.getElementById('usuario-nombre');
    if ($info && $nombre) { $nombre.textContent = u.nombre; $info.style.display = 'flex'; }
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
  initModuloClientes();
  initDropdownSucursales();
  try { await restaurarSucursalGuardada(); } catch (err) { console.error('restaurarSucursalGuardada:', err); }
  initNav();
  try { initInventarioProductoZoom(); } catch (err) { console.error('initInventarioProductoZoom:', err); }
  try { initInventarioVista(); } catch (err) { console.error('initInventarioVista:', err); }
  try { initProductoModal(); } catch (err) { console.error('initProductoModal:', err); }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('app-loading');
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

function guardarSucursalSeleccionada(sidRaw, nombre) {
  try {
    if (sidRaw == null || sidRaw === '') {
      localStorage.removeItem(SUCURSAL_KEY);
      return;
    }
    localStorage.setItem(SUCURSAL_KEY, JSON.stringify({ id: String(sidRaw), nombre: nombre || '' }));
  } catch (_) {}
}

/** Aplica la sucursal en el dropdown, persiste y recarga inventario si aplica. */
function aplicarSeleccionSucursal(sidRaw, nombre, opts = {}) {
  const { cerrarMenu = false, cerrarModal = false } = opts;
  const $label = document.getElementById('dropdown-sucursales-label');
  const $menu = document.getElementById('dropdown-sucursales-menu');
  if (!$label) return false;

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

  if (cerrarMenu) $menu?.classList.remove('abierto');
  actualizarEstadoBtnAgregarProducto();
  if (cerrarModal && sidRaw === 'all') window.ucCerrarModalProducto?.();
  window.ucCargarInventarioProductos?.();
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
    if (found) {
      aplicarSeleccionSucursal(String(sidNum), found.nombre || saved.nombre);
    } else {
      localStorage.removeItem(SUCURSAL_KEY);
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

/** Habilita “+ Agregar producto” solo con una sucursal concreta (no en “Todas las sucursales”). */
function actualizarEstadoBtnAgregarProducto() {
  const $btn = document.getElementById('btn-agregar-producto');
  if (!$btn) return;
  const { $label, raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
  const sel = $label?.dataset?.sucursalSeleccionada === '1';
  const sidNum = raw && !esTodasLasSucursales ? Number(raw) : NaN;
  const ok = sel && !esTodasLasSucursales && Number.isFinite(sidNum);
  $btn.disabled = !ok;
  if (ok) {
    $btn.title = '';
  } else if (esTodasLasSucursales) {
    $btn.title = '«Todas las sucursales» solo muestra el inventario; elige una sucursal para agregar productos';
  } else {
    $btn.title = 'Selecciona una sucursal en la barra superior para agregar productos';
  }
}

function initNav() {
  const $vistaPos = document.getElementById('vista-pos');
  const $vistaModulo = document.getElementById('vista-modulo');
  const $vistaModuloClientes = document.getElementById('vista-modulo-clientes');

  function irAModulo(btn) {
    if (btn.dataset.categoria === 'todos') document.documentElement.classList.remove('uc-restore-modulo');
    document.querySelectorAll('.categoria-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    $vistaModulo.style.display = 'none';
    $vistaModuloClientes.style.display = 'none';
    $vistaPos.style.display = 'none';
    if (btn.dataset.categoria === 'usuarios') {
      $vistaModulo.style.display = 'flex';
      cargarUsuarios();
      cargarSucursales();
    } else if (btn.dataset.categoria === 'clientes') {
      $vistaModuloClientes.style.display = 'flex';
      cargarClientes();
      cargarProveedores();
    } else if (btn.dataset.categoria === 'inventario') {
      document.body.classList.remove('modulo-ventas');
      $vistaPos.style.display = 'grid';
      const $productos = document.getElementById('productos');
      const $contenidoInv = document.getElementById('contenido-inventario');
      if ($productos) $productos.style.display = 'none';
      if ($contenidoInv) $contenidoInv.style.display = 'flex';
      document.querySelectorAll('.inventario-chip').forEach(c => c.classList.remove('activo'));
      const $chipTodos = document.querySelector('.inventario-chip[data-cat="todos"]');
      if ($chipTodos) $chipTodos.classList.add('activo');
      categoriaInventarioActiva = 'todos';
      try { initInventarioVista(); } catch (err) { console.error('initInventarioVista:', err); }
      if (window.actualizarCarritoVacioParaVista) window.actualizarCarritoVacioParaVista();
    } else if (btn.dataset.categoria === 'ventas') {
      document.body.classList.add('modulo-ventas');
      $vistaPos.style.display = 'grid';
      document.getElementById('productos').style.display = 'grid';
      document.getElementById('contenido-inventario').style.display = 'none';
      if (window.actualizarCarritoVacioParaVista) window.actualizarCarritoVacioParaVista();
    } else {
      document.body.classList.remove('modulo-ventas');
      $vistaPos.style.display = 'grid';
      document.getElementById('productos').style.display = 'grid';
      document.getElementById('contenido-inventario').style.display = 'none';
      if (window.actualizarCarritoVacioParaVista) window.actualizarCarritoVacioParaVista();
    }
  }

  document.querySelectorAll('.categoria-btn:not(.dropdown-sucursales-trigger)').forEach(btn => {
    btn.addEventListener('click', () => {
      try { localStorage.setItem(MODULO_KEY, btn.dataset.categoria); } catch (_) {}
      irAModulo(btn);
    });
  });

  const saved = localStorage.getItem(MODULO_KEY);
  if (saved) {
    const mod = saved === 'reportes' ? 'ventas' : saved;
    const $btn = document.querySelector(`.categoria-btn[data-categoria="${mod}"]`);
    if ($btn) irAModulo($btn);
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
    $menu.classList.toggle('abierto');
    if ($menu.classList.contains('abierto')) {
      $menu.scrollTop = 0;
      $loading.style.display = 'block';
      $list.innerHTML = '';
      try {
        const r = await fetch(`${API}/sucursales`, { headers: authHeaders(false) });
        const sucursales = await r.json();
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
const UC_ICONO_EDITAR = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
let productosInventario = [];
/** Último error al cargar inventario (solo para mensaje en pantalla). */
let ultimoErrorCargaInventario = '';
let categoriaInventarioActiva = 'todos';

function initInventarioVista() {
  const $buscador = document.getElementById('inventario-buscador');
  const $grid = document.getElementById('inventario-productos');
  const $chips = document.querySelectorAll('.inventario-chip');
  const $btnAgregar = document.getElementById('btn-agregar-producto');

  async function cargarProductosInventario() {
    const { raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
    productosInventario = [];
    ultimoErrorCargaInventario = '';
    if (!raw) {
      renderInventarioProductos();
      return;
    }
    try {
      const url = esTodasLasSucursales
        ? `${API}/productos/inventario-todas-sucursales`
        : `${API}/productos?${new URLSearchParams({ sucursal_id: raw }).toString()}`;
      const r = await fetch(url, { headers: authHeaders(false) });
      if (!r.ok) {
        const raw = await r.text().catch(() => r.statusText);
        try {
          const j = JSON.parse(raw);
          ultimoErrorCargaInventario = (j && j.error) ? String(j.error) : raw || r.statusText;
        } catch {
          ultimoErrorCargaInventario = raw || r.statusText || 'Error de red';
        }
        console.error('productos inventario:', r.status, ultimoErrorCargaInventario);
        productosInventario = [];
      } else {
        const data = await r.json();
        productosInventario = Array.isArray(data) ? data : [];
      }
    } catch (err) {
      console.error(err);
      productosInventario = [];
      ultimoErrorCargaInventario = err?.message ? String(err.message) : 'Error de red';
    }
    renderInventarioProductos();
  }

  window.ucCargarInventarioProductos = cargarProductosInventario;

  if (typeof initInventarioVista._inited !== 'undefined' && initInventarioVista._inited) {
    actualizarEstadoBtnAgregarProducto();
    void cargarProductosInventario();
    return;
  }
  initInventarioVista._inited = true;

  productosInventario = [];

  $chips.forEach(chip => {
    chip.addEventListener('click', () => {
      $chips.forEach(c => c.classList.remove('activo'));
      chip.classList.add('activo');
      categoriaInventarioActiva = chip.dataset.cat;
      renderInventarioProductos();
    });
  });

  $buscador?.addEventListener('input', () => renderInventarioProductos());

  $btnAgregar?.addEventListener('click', () => {
    if ($btnAgregar.disabled) return;
    window.ucAbrirModalAgregarProducto?.();
  });

  void cargarProductosInventario();
  actualizarEstadoBtnAgregarProducto();
}

function renderInventarioProductos() {
  const $grid = document.getElementById('inventario-productos');
  if (!$grid) return;
  const { raw, esTodasLasSucursales } = leerDatasetSucursalInventario();
  if (!raw) {
    $grid.innerHTML = '<div class="inventario-vacio">Selecciona una sucursal o «Todas las sucursales» arriba para ver productos</div>';
    return;
  }

  const verTodasSucursales = esTodasLasSucursales;

  const $buscador = document.getElementById('inventario-buscador');
  const q = ($buscador?.value || '').toLowerCase().trim();
  const cat = categoriaInventarioActiva;

  let lista = productosInventario.filter((p) => {
    const matchCat = cat === 'todos' || (String(p.categoria || '').toLowerCase() === cat);
    const matchQ = !q || (p.nombre || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const formatearPrecio = window.formatearPrecioPOS || (n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }));
  const imgPlaceholder = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23999"><rect width="100" height="100"/><text x="50" y="55" font-size="12" fill="%23666" text-anchor="middle">Sin imagen</text></svg>');

  if (lista.length === 0) {
    if (ultimoErrorCargaInventario) {
      const safe = ultimoErrorCargaInventario.replace(/</g, '&lt;');
      $grid.innerHTML = `<div class="inventario-vacio inventario-vacio-error">No se pudo cargar el inventario: ${safe}</div>`;
    } else if (productosInventario.length === 0) {
      $grid.innerHTML = '<div class="inventario-vacio">No hay productos en esta vista.</div>';
    } else {
      $grid.innerHTML = '<div class="inventario-vacio">No hay productos que coincidan con la búsqueda</div>';
    }
    return;
  }
  $grid.innerHTML = lista.map((p) => {
    const nomSuc = (p.sucursal_nombre || '').replace(/</g, '&lt;');
    const lineaSucursal =
      verTodasSucursales && nomSuc
        ? `<div class="inventario-producto-sucursal">${nomSuc}</div>`
        : '';
    return `
    <article class="inventario-producto-card" data-id="${p.id}">
      <img class="inventario-producto-img" tabindex="0" role="button" aria-label="Ver imagen ampliada" src="${p.imagen || imgPlaceholder}" alt="${(p.nombre || '').replace(/"/g, '&quot;')}">
      <div class="inventario-producto-nombre">${(p.nombre || '').replace(/</g, '&lt;')}</div>
      <div class="inventario-producto-meta">
        <div class="inventario-producto-meta-principal">
          <div class="inventario-producto-info">
            <div class="inventario-producto-precio">${formatearPrecio(Number(p.precio))}</div>
            <div class="inventario-producto-stock">Stock: ${p.stock ?? 0}</div>
          </div>
          <button type="button" class="inventario-producto-editar" data-id="${p.id}" title="Editar producto" aria-label="Editar producto">${UC_ICONO_EDITAR}</button>
        </div>
        ${lineaSucursal}
      </div>
      <div class="inventario-producto-acciones">
        <button type="button" class="inventario-producto-btn" data-id="${p.id}">Agregar al carrito</button>
      </div>
    </article>
  `;
  }).join('');

  $grid.querySelectorAll('.inventario-producto-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const prod = productosInventario.find((p) => Number(p.id) === id);
      if (prod && window.agregarAlCarrito) window.agregarAlCarrito(prod);
    });
  });

  $grid.querySelectorAll('.inventario-producto-editar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const prod = productosInventario.find((p) => Number(p.id) === id);
      if (prod) window.ucAbrirModalEditarProducto?.(prod);
    });
  });

  function abrirZoomDesdeImg(img) {
    const card = img.closest('.inventario-producto-card');
    const id = Number(card?.dataset.id);
    const prod = productosInventario.find((p) => Number(p.id) === id);
    if (prod) abrirInventarioProductoZoom(prod);
  }
  $grid.querySelectorAll('.inventario-producto-img').forEach((img) => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirZoomDesdeImg(img);
    });
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirZoomDesdeImg(img);
      }
    });
  });
}

let inventarioZoomAbierto = false;

function cerrarInventarioProductoZoom() {
  const $bd = document.getElementById('inventario-producto-zoom-backdrop');
  const $panel = document.getElementById('inventario-producto-zoom-panel');
  if (!$bd || !$panel) return;
  $bd.classList.remove('visible');
  $panel.classList.remove('visible');
  $bd.setAttribute('aria-hidden', 'true');
  $panel.setAttribute('aria-hidden', 'true');
  inventarioZoomAbierto = false;
  document.body.classList.remove('inventario-zoom-abierto');
}

function abrirInventarioProductoZoom(p) {
  const $bd = document.getElementById('inventario-producto-zoom-backdrop');
  const $panel = document.getElementById('inventario-producto-zoom-panel');
  const $img = document.getElementById('inventario-zoom-img');
  const $nom = document.getElementById('inventario-zoom-nombre');
  const $pre = document.getElementById('inventario-zoom-precio');
  const $stock = document.getElementById('inventario-zoom-stock');
  const $cat = document.getElementById('inventario-zoom-cat');
  const $suc = document.getElementById('inventario-zoom-sucursal');
  if (!$bd || !$panel || !$img || !$nom || !p) return;
  const formatearPrecio = window.formatearPrecioPOS || (n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }));
  const imgPh = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23999"><rect width="100" height="100"/><text x="50" y="55" font-size="12" fill="%23666" text-anchor="middle">Sin imagen</text></svg>');
  $img.src = p.imagen || imgPh;
  $img.alt = p.nombre || 'Producto';
  $nom.textContent = p.nombre || 'Producto';
  if ($pre) $pre.textContent = formatearPrecio(Number(p.precio));
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
  if (!$bd || !$panel || initInventarioProductoZoom._done) return;
  initInventarioProductoZoom._done = true;
  $cerrar?.addEventListener('click', (e) => {
    e.stopPropagation();
    cerrarInventarioProductoZoom();
  });
  $bd.addEventListener('click', cerrarInventarioProductoZoom);
  $panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inventarioZoomAbierto) cerrarInventarioProductoZoom();
  });
}

// ===================== MODAL AGREGAR PRODUCTO =====================

const MARCAS_MODELOS = {
  Apple: ['iPhone 15', 'iPhone 15 Pro', 'iPhone 14', 'iPhone 14 Pro', 'iPhone 13', 'iPhone 12', 'iPhone SE'],
  Samsung: ['Galaxy S24', 'Galaxy S23', 'Galaxy A54', 'Galaxy A34', 'Galaxy Z Flip', 'Galaxy Z Fold'],
  Xiaomi: ['Redmi Note 13', 'Redmi 12', 'POCO X6', 'Mi 14'],
  Motorola: ['Edge 40', 'Edge 30', 'Moto G84', 'Razr'],
  Huawei: ['P60', 'P50', 'Mate 60', 'Nova 12'],
  Google: ['Pixel 8', 'Pixel 7', 'Pixel 6a'],
  OnePlus: ['OnePlus 12', 'OnePlus 11', 'Nord 3'],
  OPPO: ['Find X6', 'Reno 10', 'A78'],
  Realme: ['Realme 11', 'Realme 10', 'Realme C55'],
  Honor: ['Honor 90', 'Honor Magic 5', 'Honor X9b'],
};

function initProductoModal() {
  const $modal = document.getElementById('modal-producto');
  const $form = document.getElementById('form-producto');
  const $modalTitulo = document.getElementById('modal-producto-titulo');
  const $modalSubmit = document.getElementById('modal-producto-submit');
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
  const $modelo = document.getElementById('prod-mica-modelo');
  const $precio = document.getElementById('prod-precio');
  const $precioMenos = document.getElementById('prod-precio-menos');
  const $precioMas = document.getElementById('prod-precio-mas');
  const $stockValor = document.getElementById('prod-stock-valor');
  const $stockMenos = document.getElementById('prod-stock-menos');
  const $stockMas = document.getElementById('prod-stock-mas');
  const $imagen = document.getElementById('prod-imagen');
  const $imagenNombre = document.getElementById('prod-imagen-nombre');
  const $cancelar = document.getElementById('modal-producto-cancelar');
  const $eliminarWrap = document.getElementById('modal-producto-eliminar-wrap');
  const $eliminar = document.getElementById('modal-producto-eliminar');

  const $fundaMarca = document.getElementById('prod-funda-marca');
  const $fundaMarcaCel = document.getElementById('prod-funda-marca-cel');
  const $fundaModeloCel = document.getElementById('prod-funda-modelo-cel');
  const $fundaTipo = document.getElementById('prod-funda-tipo');
  const $fundaDescripcion = document.getElementById('prod-funda-descripcion');
  const $fundaRangos = document.getElementById('prod-funda-rangos');

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
  let rangoFundaSinAuto = false;

  function mostrarBtnEliminarProducto(visible) {
    if ($eliminarWrap) $eliminarWrap.hidden = !visible;
  }

  const iconPencil = UC_ICONO_EDITAR;

  const NO_PENCIL_IDS = ['prod-categoria', 'prod-mica-tipo-cristal', 'prod-mica-tipo-hidrogel', 'prod-cargador-tipo', 'prod-audifonos-tipo', 'prod-audifonos-conexion'];

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
      customInput.style.display = 'none';
      customInput.placeholder = $select.options[0]?.value === '' ? $select.options[0].textContent : '';
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
      if (valorInicial !== undefined) {
        customInput.value = String(valorInicial);
      } else {
        const opt = $select.options[$select.selectedIndex];
        customInput.value = (opt && opt.value) ? opt.textContent : '';
      }
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

    function syncDisplay() {
      const opt = $select.options[$select.selectedIndex];
      const text = opt ? opt.textContent : '';
      const placeholder = $select.options[0]?.value === '' ? $select.options[0].textContent : '';
      trigger.textContent = text || placeholder;
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
        if (wrap.classList.contains('input-mode')) {
          switchToDropdown();
        } else {
          switchToInput();
        }
      });
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
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
    customDropdowns[$select.id] = { refresh, syncDisplay, switchToDropdown, switchToInputWithValue, wrap };
    return customDropdowns[$select.id];
  }

  document.querySelectorAll('#modal-producto select').forEach($s => createCustomDropdown($s));

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
    $marca.innerHTML = '<option value="">Seleccionar marca...</option>';
    $modelo.innerHTML = '<option value="">Seleccionar modelo...</option>';
    if ($fundaMarca) $fundaMarca.value = '';
    if ($fundaMarcaCel) $fundaMarcaCel.value = '';
    if ($fundaModeloCel) $fundaModeloCel.innerHTML = '<option value="">Seleccionar modelo...</option>';
    if ($fundaTipo) $fundaTipo.value = '';
    if ($fundaDescripcion) $fundaDescripcion.value = '';
    customDropdowns['prod-funda-modelo-cel']?.refresh();
    $fundaRangos?.querySelectorAll('.form-chip.activo').forEach(c => c.classList.remove('activo'));
    rangoFundaSinAuto = false;
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
    if ($stockValor) $stockValor.value = '0';
    if ($imagen) $imagen.value = '';
    if ($imagenNombre) $imagenNombre.textContent = '';
    delete $form?.dataset.editId;
    delete $form?.dataset.editSucursalId;
    delete $form?.dataset.imagenActual;
    if ($modalTitulo) $modalTitulo.textContent = 'Agregar producto';
    if ($modalSubmit) $modalSubmit.textContent = 'Agregar producto';
    productoEditNombre = '';
    mostrarBtnEliminarProducto(false);
    actualizarCamposCargadorTipo();
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

  function poblarSelectMarcasCel($marcaSel, $modeloSel) {
    if (!$marcaSel) return;
    $marcaSel.innerHTML = '<option value="">Seleccionar marca...</option>' +
      Object.keys(MARCAS_MODELOS).map((m) => `<option value="${m}">${m}</option>`).join('');
    customDropdowns[$marcaSel.id]?.refresh?.();
    if ($modeloSel) {
      $modeloSel.innerHTML = '<option value="">Seleccionar modelo...</option>';
      customDropdowns[$modeloSel.id]?.refresh?.();
    }
  }

  function poblarModelosParaMarca($marcaSel, $modeloSel, marca) {
    if (!$modeloSel) return;
    const modelos = MARCAS_MODELOS[marca] || [];
    $modeloSel.innerHTML = '<option value="">Seleccionar modelo...</option>' +
      modelos.map((m) => `<option value="${m}">${m}</option>`).join('');
    customDropdowns[$modeloSel.id]?.refresh?.();
  }

  function asignarMarcaYModeloEnSelects($marcaSel, $modeloSel, marcaTexto, modeloTexto) {
    const marca = String(marcaTexto || '').trim();
    const modelo = String(modeloTexto || '').trim();
    if (!marca) {
      if (modelo) asignarValorSelect($modeloSel, modelo);
      return;
    }
    if (MARCAS_MODELOS[marca]) {
      if ($marcaSel.options.length <= 1) poblarSelectMarcasCel($marcaSel, $modeloSel);
      asignarValorSelect($marcaSel, marca);
      poblarModelosParaMarca($marcaSel, $modeloSel, marca);
      if (modelo) asignarValorSelect($modeloSel, modelo);
      return;
    }
    if ($marcaSel.options.length <= 1) poblarSelectMarcasCel($marcaSel, $modeloSel);
    asignarValorSelect($marcaSel, marca);
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

  function extraerMarcaModeloCel(texto) {
    const s = (texto || '').trim();
    if (!s) return null;
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

    const marcas = Object.keys(MARCAS_MODELOS).sort((a, b) => b.length - a.length);
    for (const marca of marcas) {
      const marcaEsc = marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\s+${marcaEsc}\\s+(.+)$`, 'i');
      const m = s.match(re);
      if (m) {
        return {
          marca,
          modelo: m[1].trim(),
          resto: s.slice(0, m.index).trim(),
        };
      }
      if (s.toLowerCase() === marca.toLowerCase()) {
        return { marca, modelo: '', resto: '' };
      }
    }
    return null;
  }

  function opcionesTextoSelect($select) {
    if (!$select) return [];
    return Array.from($select.options)
      .filter((o) => o.value)
      .map((o) => ({ value: o.value, text: o.textContent.trim() }))
      .sort((a, b) => b.text.length - a.text.length);
  }

  function matchPrefijoTipoFunda(texto) {
    const opts = opcionesTextoSelect($fundaTipo);
    for (const o of opts) {
      if (texto === o.text) return { value: o.value, resto: '' };
      if (texto.startsWith(o.text + ' ')) return { value: o.value, resto: texto.slice(o.text.length).trim() };
    }
    return { value: '', resto: texto };
  }

  function aplicarRangoFunda(rango) {
    if (!$fundaRangos || !rango) return;
    rangoFundaSinAuto = false;
    $fundaRangos.querySelectorAll('.form-chip').forEach((c) => c.classList.remove('activo'));
    const chip = $fundaRangos.querySelector(`.form-chip[data-rango="${rango}"]`);
    if (chip) chip.classList.add('activo');
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
      let rango = '';
      const rangoM = s.match(/\s+—\s+Rango\s+([\d-]+)\s*$/i);
      if (rangoM) {
        rango = rangoM[1];
        s = s.slice(0, -rangoM[0].length).trim();
      }
      let desc = '';
      const dashIdx = s.indexOf(' — ');
      if (dashIdx >= 0) {
        desc = s.slice(dashIdx + 3).trim();
        s = s.slice(0, dashIdx).trim();
      }
      const tipoMatch = matchPrefijoTipoFunda(s);
      if (tipoMatch.value) {
        const optTipo = Array.from($fundaTipo?.options || []).find((o) => o.value === tipoMatch.value);
        asignarValorSelect($fundaTipo, optTipo?.textContent?.trim() || tipoMatch.value);
        s = tipoMatch.resto;
      } else if (s.trim()) {
        asignarValorSelect($fundaTipo, s.trim());
        s = '';
      }
      const mm = extraerMarcaModeloCel(s);
      if (mm) {
        asignarMarcaYModeloEnSelects($fundaMarcaCel, $fundaModeloCel, mm.marca, mm.modelo);
        s = mm.resto;
      }
      if (s.trim() && $fundaMarca) $fundaMarca.value = s.trim();
      if (desc && $fundaDescripcion) $fundaDescripcion.value = desc;
      if (rango) {
        aplicarRangoFunda(rango);
      } else {
        rangoFundaSinAuto = true;
        $fundaRangos?.querySelectorAll('.form-chip.activo').forEach((c) => c.classList.remove('activo'));
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
          poblarSelectMarcasCel($marca, $modelo);
          asignarMarcaYModeloEnSelects($marca, $modelo, mm.marca, mm.modelo);
        } else if (mmPart) {
          $marcaModeloWrap.style.display = 'block';
          poblarSelectMarcasCel($marca, $modelo);
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
    if ($stockValor) $stockValor.value = String(prod.stock ?? 0);
    if ($categoria) {
      $categoria.value = prod.categoria || '';
      $categoria.dispatchEvent(new Event('change'));
    }
    parsearNombreEnFormulario(prod);
    refrescarDropdownsModalProducto();
    actualizarChipRango();
    requestAnimationFrame(() => {
      refrescarDropdownsModalProducto();
      cargandoEdicionProducto = false;
    });
  }

  const $modalPanel = $modal?.querySelector('.modal-content');

  function scrollModalProductoAlInicio() {
    if ($modalPanel) $modalPanel.scrollTop = 0;
  }

  function abrirModalAgregarProducto() {
    resetModal();
    if ($modalTitulo) $modalTitulo.textContent = 'Agregar producto';
    if ($modalSubmit) $modalSubmit.textContent = 'Agregar producto';
    $modal?.classList.add('visible');
    document.body.classList.add('modal-producto-abierto');
  }

  function abrirModalEditarProducto(prod) {
    if (!prod || prod.id == null || prod.id === '') return;
    resetModal();
    if ($modalTitulo) $modalTitulo.textContent = 'Actualizar producto';
    if ($modalSubmit) $modalSubmit.textContent = 'Actualizar producto';
    if ($form) {
      $form.dataset.editId = String(prod.id);
      const sid = prod.sucursal_id ?? prod.id_sucursal;
      if (sid != null) $form.dataset.editSucursalId = String(sid);
      if (prod.imagen) $form.dataset.imagenActual = prod.imagen;
    }
    if ($imagenNombre && prod.imagen) {
      $imagenNombre.textContent = 'Imagen actual (elige otra para reemplazar)';
    }
    cargarProductoEnFormulario(prod);
    productoEditNombre = prod.nombre || 'este producto';
    mostrarBtnEliminarProducto(true);
    $modal?.classList.add('visible');
    document.body.classList.add('modal-producto-abierto');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollModalProductoAlInicio());
    });
  }

  window.ucAbrirModalAgregarProducto = abrirModalAgregarProducto;
  window.ucAbrirModalEditarProducto = abrirModalEditarProducto;

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
    $marca.innerHTML = '<option value="">Seleccionar marca...</option>';
    $modelo.innerHTML = '<option value="">Seleccionar modelo...</option>';
    customDropdowns['prod-mica-marca']?.refresh();
    customDropdowns['prod-mica-modelo']?.refresh();
    if ($fundaMarca) $fundaMarca.value = '';
    if ($fundaMarcaCel) $fundaMarcaCel.value = '';
    if ($fundaModeloCel) $fundaModeloCel.innerHTML = '<option value="">Seleccionar modelo...</option>';
    if ($fundaTipo) $fundaTipo.value = '';
    if ($fundaDescripcion) $fundaDescripcion.value = '';
    customDropdowns['prod-funda-modelo-cel']?.refresh();
    $fundaRangos?.querySelectorAll('.form-chip.activo').forEach(c => c.classList.remove('activo'));
    rangoFundaSinAuto = false;
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
    if ($stockValor) $stockValor.value = '0';
    if ($imagen) $imagen.value = '';
    if ($imagenNombre) $imagenNombre.textContent = '';
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
      poblarSelectMarcasCel($fundaMarcaCel, $fundaModeloCel);
    }
    if (cat !== 'micas') {
      $chipCristal?.classList.remove('activo');
      $chipHidrogel?.classList.remove('activo');
      $tipoCristalWrap.style.display = 'none';
      $tipoHidrogelWrap.style.display = 'none';
      $marcaModeloWrap.style.display = 'none';
    }
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
      poblarSelectMarcasCel($marca, $modelo);
    } else {
      $marcaModeloWrap.style.display = 'none';
    }
  });

  $marca?.addEventListener('change', () => {
    const marca = $marca.value;
    if (marca) poblarModelosParaMarca($marca, $modelo, marca);
    else if ($modelo) {
      $modelo.innerHTML = '<option value="">Seleccionar modelo...</option>';
      customDropdowns['prod-mica-modelo']?.refresh();
    }
  });

  $fundaMarcaCel?.addEventListener('change', () => {
    const marca = $fundaMarcaCel.value;
    if (marca) poblarModelosParaMarca($fundaMarcaCel, $fundaModeloCel, marca);
    else if ($fundaModeloCel) {
      $fundaModeloCel.innerHTML = '<option value="">Seleccionar modelo...</option>';
      customDropdowns['prod-funda-modelo-cel']?.refresh();
    }
  });

  $fundaRangos?.querySelectorAll('.form-chip[data-rango]').forEach(chip => {
    chip.addEventListener('click', () => {
      const yaActivo = chip.classList.contains('activo');
      $fundaRangos.querySelectorAll('.form-chip').forEach(c => c.classList.remove('activo'));
      if (yaActivo) {
        rangoFundaSinAuto = true;
        return;
      }
      rangoFundaSinAuto = false;
      chip.classList.add('activo');
      const rango = chip.dataset.rango;
      const [min] = rango.split('-').map(Number);
      if ($precio) $precio.value = min;
    });
  });

  function actualizarChipRango() {
    if (!$fundaRangos || $categoria?.value !== 'fundas') return;
    if (rangoFundaSinAuto) {
      $fundaRangos.querySelectorAll('.form-chip').forEach(c => c.classList.remove('activo'));
      return;
    }
    const precio = parseInt($precio?.value || 0, 10);
    $fundaRangos.querySelectorAll('.form-chip').forEach(c => c.classList.remove('activo'));
    const chips = Array.from($fundaRangos.querySelectorAll('.form-chip[data-rango]'));
    const chipMatch = chips.find(chip => {
      const [min, max] = chip.dataset.rango.split('-').map(Number);
      return precio >= min && precio <= max;
    });
    if (chipMatch) chipMatch.classList.add('activo');
  }

  $precio?.addEventListener('input', actualizarChipRango);
  $precio?.addEventListener('change', actualizarChipRango);

  $imagen?.addEventListener('change', () => {
    const file = $imagen.files?.[0];
    if ($imagenNombre) $imagenNombre.textContent = file ? file.name : '';
  });

  function formatearMetrosCargador(val) {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n < 0) return 'de 0m';
    return `de ${Number(n.toFixed(1))}m`;
  }

  const OPCIONES_CONEXION_CARGADOR = {
    cableCompleto: [
      { value: '', text: 'Seleccionar...' },
      { value: 'usb-c', text: 'USB-C' },
      { value: 'c-c', text: 'C-C' },
    ],
    cubo: [
      { value: '', text: 'Seleccionar...' },
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

  function setupHoldRepeat($btn, $input, delta, opts = {}) {
    let timer = null;
    let interval = null;
    const delay = opts.delay ?? 400;
    const intervalMs = opts.interval ?? 150;
    const onUpdate = opts.onUpdate;
    const decimal = opts.decimal ?? false;
    const precision = opts.precision ?? 1;

    function update() {
      const current = decimal
        ? parseFloat($input?.value || 0)
        : parseInt($input?.value || 0, 10);
      const v = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
      if ($input) {
        $input.value = decimal ? String(Number(v.toFixed(precision))) : String(v);
      }
      onUpdate?.();
    }

    $btn?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      update();
      timer = setTimeout(() => {
        interval = setInterval(update, intervalMs);
      }, delay);
    });

    $btn?.addEventListener('mouseup', stop);
    $btn?.addEventListener('mouseleave', stop);

    function stop() {
      clearTimeout(timer);
      clearInterval(interval);
      timer = null;
      interval = null;
    }
  }

  setupHoldRepeat($precioMenos, $precio, -1, { delay: 250, interval: 80, onUpdate: actualizarChipRango });
  setupHoldRepeat($precioMas, $precio, 1, { delay: 250, interval: 80, onUpdate: actualizarChipRango });
  setupHoldRepeat($stockMenos, $stockValor, -1);
  setupHoldRepeat($stockMas, $stockValor, 1);
  setupHoldRepeat($powerbankMahMenos, $powerbankMah, -500, { delay: 250, interval: 100 });
  setupHoldRepeat($powerbankMahMas, $powerbankMah, 500, { delay: 250, interval: 100 });
  setupHoldRepeat($powerbankWattsMenos, $powerbankWatts, -1);
  setupHoldRepeat($powerbankWattsMas, $powerbankWatts, 1);
  setupHoldRepeat($cargadorWattsMenos, $cargadorWatts, -1);
  setupHoldRepeat($cargadorWattsMas, $cargadorWatts, 1);
  setupHoldRepeat($cargadorMetrosMenos, $cargadorMetros, -0.5, { delay: 250, interval: 100, decimal: true });
  setupHoldRepeat($cargadorMetrosMas, $cargadorMetros, 0.5, { delay: 250, interval: 100, decimal: true });
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
    return new Promise((resolve) => {
      const f = input?.files?.[0];
      if (!f || f.size > 700000) resolve(null);
      else {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
        r.onerror = () => resolve(null);
        r.readAsDataURL(f);
      }
    });
  }

  $cancelar?.addEventListener('click', cerrarModal);
  $eliminar?.addEventListener('click', () => {
    const editId = $form?.dataset.editId;
    if (!editId) return;
    const nombre = productoEditNombre || 'este producto';
    abrirConfirmar(`¿Eliminar el producto "${nombre}"?`, async () => {
      const r = await fetch(`${API}/productos/${editId}`, { method: 'DELETE', headers: authHeaders(false) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || 'No se pudo eliminar el producto');
        return;
      }
      cerrarModal();
      window.ucCargarInventarioProductos?.();
    });
  });
  $modal?.addEventListener('click', e => { if (e.target.id === 'modal-producto') cerrarModal(); });

  $form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cat = $categoria.value;
    if (!cat) { alert('Selecciona una categoría'); return; }

    let tipoMica = null;
    if (cat === 'micas') {
      tipoMica = $chipCristal?.classList.contains('activo') ? 'cristal' : ($chipHidrogel?.classList.contains('activo') ? 'hidrogel' : null);
      if (!tipoMica) { alert('Selecciona tipo de mica (Cristal o Hidrogel)'); return; }
      if (tipoMica === 'cristal') {
        const tipoCristal = $tipoCristal.value;
        if (!tipoCristal) { alert('Selecciona tipo de cristal'); return; }
        const marca = textoOpcionSeleccionada($marca);
        const modelo = textoOpcionSeleccionada($modelo);
        if (!marca || !modelo) { alert('Selecciona marca y modelo'); return; }
      } else if (tipoMica === 'hidrogel') {
        const tipoHidrogel = $tipoHidrogel.value;
        if (!tipoHidrogel) { alert('Selecciona tipo de hidrogel'); return; }
      }
    }
    if (cat === 'fundas') {
      const marcaCel = textoOpcionSeleccionada($fundaMarcaCel);
      const modeloCel = textoOpcionSeleccionada($fundaModeloCel);
      if (!marcaCel || !modeloCel) { alert('Selecciona marca y modelo del celular'); return; }
    }
    if (cat === 'cargadores') {
      const tipo = $cargadorTipo?.value;
      if (!tipo) { alert('Selecciona tipo de cargador'); return; }
    }
    if (cat === 'audifonos') {
      const tipo = $audifonosTipo?.value;
      const conexion = $audifonosConexion?.value;
      if (!tipo) { alert('Selecciona tipo de audífonos'); return; }
      if (!conexion) { alert('Selecciona tipo de conexión'); return; }
    }
    if (cat === 'powerbanks') {
      const mah = parseInt($powerbankMah?.value || 0, 10);
      if (mah < 1) { alert('Ingresa una capacidad válida en mAh'); return; }
    }
    if (cat === 'bocinas') {
      const marca = ($bocinaMarca?.value || '').trim();
      const modelo = ($bocinaModelo?.value || '').trim();
      if (!marca) { alert('Ingresa la marca de la bocina'); return; }
      if (!modelo) { alert('Ingresa el modelo de la bocina'); return; }
      const color = textoOpcionSeleccionada($bocinaColor);
      if (!color) { alert('Selecciona un color'); return; }
    }
    const precio = parseFloat($precio?.value || 0);
    if (precio <= 0) { alert('Ingresa un precio válido'); return; }
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

    let nombreProducto = '';
    if (cat === 'micas') {
      if (tipoMica === 'cristal') {
        nombreProducto = `Mica cristal ${$tipoCristal.value} — ${textoOpcionSeleccionada($marca)} ${textoOpcionSeleccionada($modelo)}`;
      } else {
        nombreProducto = `Mica hidrogel ${$tipoHidrogel.value}`;
      }
    } else if (cat === 'fundas') {
      const partes = ['Funda'];
      const tipoFunda = textoOpcionSeleccionada($fundaTipo);
      if (tipoFunda) partes.push(tipoFunda);
      const marcaFunda = ($fundaMarca?.value || '').trim();
      if (marcaFunda) partes.push(marcaFunda);
      const marcaCel = textoOpcionSeleccionada($fundaMarcaCel);
      const modeloCel = textoOpcionSeleccionada($fundaModeloCel);
      if (marcaCel) partes.push(marcaCel);
      if (modeloCel) partes.push(modeloCel);
      nombreProducto = partes.join(' ');
      const desc = ($fundaDescripcion?.value || '').trim();
      if (desc) nombreProducto += ` — ${desc}`;
      const rangoChip = $fundaRangos?.querySelector('.form-chip.activo[data-rango]');
      if (rangoChip?.dataset?.rango) {
        nombreProducto += ` — Rango ${rangoChip.dataset.rango}`;
      }
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

    try {
      let imagenData = await leerImagenComoDataUrl($imagen);
      if (!imagenData && $form?.dataset?.imagenActual) {
        imagenData = $form.dataset.imagenActual;
      }
      const url = esEdicion ? `${API}/productos/${editId}` : `${API}/productos`;
      const payload = {
        nombre: nombreProducto,
        precio,
        stock,
        categoria: cat,
        imagen: imagenData,
      };
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
      await window.ucCargarInventarioProductos?.();
      cerrarModal();
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar el producto');
    }
  });
}

// ===================== POS =====================

function initPOS() {
  const PRODUCTOS = [];
  let carrito = [];

  const $productos = document.getElementById('productos');
  const $carritoLista = document.getElementById('carrito-lista');
  const $carritoVacio = document.getElementById('carrito-vacio');
  const $carritoCount = document.getElementById('carrito-count');
  const $subtotal = document.getElementById('subtotal');
  const $total = document.getElementById('total');
  const $btnVaciar = document.getElementById('btn-vaciar');
  const $btnCobrar = document.getElementById('btn-cobrar');
  const $modal = document.getElementById('modal-venta');
  const $modalTotal = document.getElementById('modal-total');
  const $modalCerrar = document.getElementById('modal-cerrar');
  const $modalNueva = document.getElementById('modal-nueva');

  function formatearPrecio(n) {
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  }

  function renderProductos() {
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

  function actualizarCarrito() {
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
      $carritoLista.innerHTML = carrito.map(i => `
        <div class="carrito-item" data-id="${i.id}">
          <span class="carrito-item-nombre">${i.nombre}</span>
          <div class="carrito-item-cantidad">
            <button type="button" aria-label="Menos">−</button>
            <span>${i.cantidad}</span>
            <button type="button" aria-label="Más">+</button>
          </div>
          <span class="carrito-item-precio">${formatearPrecio(i.precio * i.cantidad)}</span>
          <button type="button" class="carrito-item-quitar" aria-label="Quitar">×</button>
        </div>
      `).join('');
      $carritoLista.querySelectorAll('.carrito-item').forEach(row => {
        const id = Number(row.dataset.id);
        row.querySelector('.carrito-item-cantidad button:first-child').onclick = () => {
          const it = carrito.find(i => i.id === id);
          if (it) { it.cantidad--; if (it.cantidad <= 0) carrito = carrito.filter(i => i.id !== id); }
          actualizarCarrito();
        };
        row.querySelector('.carrito-item-cantidad button:last-child').onclick = () => {
          const it = carrito.find(i => i.id === id);
          if (it) it.cantidad++;
          actualizarCarrito();
        };
        row.querySelector('.carrito-item-quitar').onclick = () => {
          carrito = carrito.filter(i => i.id !== id);
          actualizarCarrito();
        };
      });
    }
  }

  $btnVaciar.addEventListener('click', () => { carrito = []; actualizarCarrito(); });

  document.getElementById('btn-consignada')?.addEventListener('click', function() {
    this.classList.toggle('activo');
  });

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
  $btnExpand?.addEventListener('click', toggleCarritoMaximizado);
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
    const enInventario = document.getElementById('contenido-inventario')?.style.display === 'flex';
    $carritoVacio.textContent = enInventario ? 'Agrega productos' : 'Agrega productos tocando aquí';
    $carritoVacio.classList.toggle('carrito-vacio-link', !enInventario);
  };
  $btnCobrar.addEventListener('click', () => {
    if (carrito.length === 0) return;
    $modalTotal.textContent = formatearPrecio(carrito.reduce((s, i) => s + i.precio * i.cantidad, 0));
    $modal.classList.add('visible');
  });
  $modalCerrar.addEventListener('click', () => $modal.classList.remove('visible'));
  $modalNueva.addEventListener('click', () => { $modal.classList.remove('visible'); carrito = []; actualizarCarrito(); });
  $modal.addEventListener('click', e => { if (e.target === $modal) $modal.classList.remove('visible'); });

  renderProductos();
  actualizarCarrito();

  window.agregarAlCarrito = (prod) => {
    const item = carrito.find(i => i.id === prod.id);
    if (item) item.cantidad++;
    else carrito.push({ ...prod, cantidad: 1 });
    actualizarCarrito();
  };
  window.formatearPrecioPOS = formatearPrecio;

  const THEME_KEY = 'urbancase-theme';
  const $themeToggle = document.getElementById('theme-toggle');
  const $themeLabel = $themeToggle?.querySelector('.theme-label');
  function aplicarTema(oscuro) {
    document.body.classList.toggle('theme-dark', oscuro);
    document.documentElement.classList.toggle('theme-dark', oscuro);
    if ($themeLabel) $themeLabel.textContent = oscuro ? 'Claro' : 'Obscuro';
    try { localStorage.setItem(THEME_KEY, oscuro ? 'dark' : 'light'); } catch (_) {}
  }
  aplicarTema(localStorage.getItem(THEME_KEY) === 'dark');
  if ($themeToggle) {
    $themeToggle.addEventListener('click', () => aplicarTema(!document.body.classList.contains('theme-dark')));
  }
  const $logo = document.querySelector('.logo');
  if ($logo) $logo.addEventListener('click', () => aplicarTema(!document.body.classList.contains('theme-dark')));
}

// ===================== MÓDULO: TABS =====================

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
      <td>${u.id}</td>
      <td>${u.usuario}</td>
      <td>${u.nombre}</td>
      <td><span class="badge ${u.rol === 'admin' ? 'badge-admin' : 'badge-vendedor'}">${u.rol}</span></td>
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

function poblarSelectSucursales() {
  const $sel = document.getElementById('mu-sucursal');
  const val = $sel.value;
  $sel.innerHTML = '<option value="">Sin asignar</option>' +
    todasSucursales.filter(s => s.activo).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  $sel.value = val;
}

function abrirModalUsuario(usuario = null) {
  const $modal = document.getElementById('modal-usuario');
  const $form = document.getElementById('form-usuario');
  const $pass = document.getElementById('mu-password');
  poblarSelectSucursales();
  $form.reset();
  if (usuario) {
    document.getElementById('modal-usuario-titulo').textContent = 'Editar usuario';
    $form.dataset.editId = usuario.id;
    document.getElementById('mu-usuario').value = usuario.usuario;
    document.getElementById('mu-nombre').value = usuario.nombre;
    document.getElementById('mu-rol').value = usuario.rol;
    document.getElementById('mu-sucursal').value = usuario.sucursal_id || '';
    document.getElementById('mu-activo').value = String(usuario.activo);
    $pass.placeholder = 'Dejar vacío para no cambiar'; $pass.required = false;
  } else {
    document.getElementById('modal-usuario-titulo').textContent = 'Nuevo usuario';
    delete $form.dataset.editId;
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
      <td>${s.id}</td>
      <td>${s.nombre}</td>
      <td>${s.empleados || '<span style="opacity:.4">Sin empleados</span>'}</td>
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
      <td>${c.id}</td>
      <td>${esc(c.nombre)}</td>
      <td>${esc(c.telefono) || '<span style="opacity:.4">—</span>'}</td>
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
      <td>${p.id}</td>
      <td>${esc(p.nombre)}</td>
      <td>${esc(p.rfc) || '<span style="opacity:.4">—</span>'}</td>
      <td>${esc(p.telefono) || '<span style="opacity:.4">—</span>'}</td>
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

function abrirConfirmar(texto, cb) {
  confirmarCallback = cb;
  document.getElementById('confirmar-texto').textContent = texto;
  document.getElementById('modal-confirmar').classList.add('visible');
}

function cerrarConfirmar() {
  document.getElementById('modal-confirmar').classList.remove('visible');
  confirmarCallback = null;
}
