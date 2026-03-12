// Si abres el HTML directo (file://), redirigir al servidor
if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
  window.location.href = 'http://localhost:3000/';
}
const API = '/api';
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
    window.location.href = '/login.html';
  });

  initPOS();
  initModulo();
  initModuloClientes();
  initNav();
  initDropdownSucursales();
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

function initNav() {
  const $vistaPos = document.getElementById('vista-pos');
  const $vistaModulo = document.getElementById('vista-modulo');
  const $vistaModuloClientes = document.getElementById('vista-modulo-clientes');

  document.querySelectorAll('.categoria-btn:not(.dropdown-sucursales-trigger)').forEach(btn => {
    btn.addEventListener('click', () => {
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
        $vistaPos.style.display = 'grid';
        document.getElementById('productos').style.display = 'none';
        document.getElementById('contenido-inventario').style.display = 'flex';
        document.querySelectorAll('.inventario-chip').forEach(c => c.classList.remove('activo'));
        const $chipTodos = document.querySelector('.inventario-chip[data-cat="todos"]');
        if ($chipTodos) $chipTodos.classList.add('activo');
        categoriaInventarioActiva = 'todos';
        initInventarioVista();
        if (window.actualizarCarritoVacioParaVista) window.actualizarCarritoVacioParaVista();
      } else {
        $vistaPos.style.display = 'grid';
        document.getElementById('productos').style.display = 'grid';
        document.getElementById('contenido-inventario').style.display = 'none';
        if (window.actualizarCarritoVacioParaVista) window.actualizarCarritoVacioParaVista();
      }
    });
  });
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
      $loading.style.display = 'block';
      $list.innerHTML = '';
      try {
        const r = await fetch(`${API}/sucursales`, { headers: authHeaders(false) });
        const sucursales = await r.json();
        $loading.style.display = 'none';
        if (sucursales.length === 0) {
          $list.innerHTML = '<div class="dropdown-sucursales-vacio">No hay sucursales</div>';
        } else {
          $list.innerHTML = sucursales.map(s => {
            const esc = (s.nombre || '').replace(/</g, '&lt;');
            return `<div class="dropdown-sucursales-item">${esc}</div>`;
          }).join('');
          $list.querySelectorAll('.dropdown-sucursales-item').forEach(item => {
            item.addEventListener('click', () => {
              $label.textContent = item.textContent;
              $menu.classList.remove('abierto');
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
}

// ===================== INVENTARIO =====================

const CATEGORIAS_INVENTARIO = ['todos', 'micas', 'fundas', 'cargadores', 'pilas', 'bocinas', 'accesorios', 'otros'];
let productosInventario = [];
let categoriaInventarioActiva = 'todos';

function initInventarioVista() {
  const $buscador = document.getElementById('inventario-buscador');
  const $grid = document.getElementById('inventario-productos');
  const $chips = document.querySelectorAll('.inventario-chip');
  const $btnAgregar = document.getElementById('btn-agregar-producto');

  if (typeof initInventarioVista._inited !== 'undefined' && initInventarioVista._inited) {
    renderInventarioProductos();
    return;
  }
  initInventarioVista._inited = true;

  productosInventario = [
    { id: 1, nombre: 'Mica templada iPhone 15', precio: 89, imagen: '', categoria: 'micas' },
    { id: 2, nombre: 'Funda silicona Samsung', precio: 149, imagen: '', categoria: 'fundas' },
    { id: 3, nombre: 'Cargador rápido 20W', precio: 199, imagen: '', categoria: 'cargadores' },
    { id: 4, nombre: 'Power bank 10000mAh', precio: 349, imagen: '', categoria: 'pilas' },
    { id: 5, nombre: 'Bocina Bluetooth', precio: 299, imagen: '', categoria: 'bocinas' },
    { id: 6, nombre: 'Soporte celular', precio: 79, imagen: '', categoria: 'accesorios' },
    { id: 7, nombre: 'Cable USB-C', precio: 59, imagen: '', categoria: 'cargadores' },
    { id: 8, nombre: 'Mica hidrogel', precio: 69, imagen: '', categoria: 'micas' },
  ];

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
    alert('Agregar producto (próximamente)');
  });

  renderInventarioProductos();
}

function renderInventarioProductos() {
  const $grid = document.getElementById('inventario-productos');
  const $buscador = document.getElementById('inventario-buscador');
  const q = ($buscador?.value || '').toLowerCase().trim();
  const cat = categoriaInventarioActiva;

  let lista = productosInventario.filter(p => {
    const matchCat = cat === 'todos' || (p.categoria || '').toLowerCase() === cat;
    const matchQ = !q || (p.nombre || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const formatearPrecio = window.formatearPrecioPOS || (n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }));
  const imgPlaceholder = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23999"><rect width="100" height="100"/><text x="50" y="55" font-size="12" fill="%23666" text-anchor="middle">Sin imagen</text></svg>');

  if (lista.length === 0) {
    $grid.innerHTML = '<div class="inventario-vacio">No hay productos que coincidan con la búsqueda</div>';
    return;
  }
  $grid.innerHTML = lista.map(p => `
    <article class="inventario-producto-card" data-id="${p.id}">
      <img class="inventario-producto-img" src="${p.imagen || imgPlaceholder}" alt="${(p.nombre || '').replace(/"/g, '&quot;')}">
      <div class="inventario-producto-nombre">${(p.nombre || '').replace(/</g, '&lt;')}</div>
      <div class="inventario-producto-precio">${formatearPrecio(p.precio)}</div>
      <button type="button" class="inventario-producto-btn" data-id="${p.id}">Agregar al carrito</button>
    </article>
  `).join('');

  $grid.querySelectorAll('.inventario-producto-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const prod = productosInventario.find(p => p.id === id);
      if (prod && window.agregarAlCarrito) window.agregarAlCarrito(prod);
    });
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

    try {
      let r;
      if (id) {
        r = await fetch(`${API}/usuarios/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(datos) });
      } else {
        if (!pass) return alert('La contraseña es requerida para usuarios nuevos');
        datos.password = pass;
        r = await fetch(`${API}/usuarios`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(datos) });
      }
      const data = await r.json();
      if (!r.ok) return alert(data.error || 'Error al guardar');
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
