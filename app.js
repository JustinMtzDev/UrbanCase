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
  initUsuarios();
  initNav();
})();

function authHeaders(json = true) {
  const h = { 'Authorization': 'Bearer ' + token };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// ===================== NAVEGACIÓN =====================

function initNav() {
  const $vistaPos = document.getElementById('vista-pos');
  const $vistaUsuarios = document.getElementById('vista-usuarios');
  const $modalVenta = document.getElementById('modal-venta');

  document.querySelectorAll('.categoria-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.categoria-btn').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');

      const cat = btn.dataset.categoria;

      if (cat === 'usuarios') {
        $vistaPos.style.display = 'none';
        $vistaUsuarios.style.display = 'flex';
        cargarUsuarios();
      } else {
        $vistaUsuarios.style.display = 'none';
        $vistaPos.style.display = 'grid';
      }
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

  // Tema
  const THEME_KEY = 'urbancase-theme';
  const $themeToggle = document.getElementById('theme-toggle');
  const $themeLabel = $themeToggle?.querySelector('.theme-label');
  function aplicarTema(oscuro) {
    if (oscuro) {
      document.body.classList.add('theme-dark');
      if ($themeLabel) $themeLabel.textContent = 'Claro';
    } else {
      document.body.classList.remove('theme-dark');
      if ($themeLabel) $themeLabel.textContent = 'Obscuro';
    }
    try { localStorage.setItem(THEME_KEY, oscuro ? 'dark' : 'light'); } catch (_) {}
  }
  if ($themeToggle) {
    $themeToggle.addEventListener('click', () => aplicarTema(!document.body.classList.contains('theme-dark')));
    aplicarTema(localStorage.getItem(THEME_KEY) === 'dark');
  }
  const $logo = document.querySelector('.logo');
  if ($logo) $logo.addEventListener('click', () => aplicarTema(!document.body.classList.contains('theme-dark')));
}

// ===================== USUARIOS =====================

let todosUsuarios = [];

async function cargarUsuarios() {
  try {
    const r = await fetch(`${API}/usuarios`, { headers: authHeaders(false) });
    if (r.status === 401) return window.location.href = '/login.html';
    todosUsuarios = await r.json();
    renderTablaUsuarios(todosUsuarios);
  } catch (err) {
    console.error('Error cargando usuarios:', err);
  }
}

function renderTablaUsuarios(lista) {
  const $tbody = document.getElementById('tbody-usuarios');
  if (lista.length === 0) {
    $tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;opacity:.5;padding:2rem">No se encontraron usuarios</td></tr>';
    return;
  }
  $tbody.innerHTML = lista.map(u => {
    const fecha = new Date(u.created_at);
    const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return `
    <tr>
      <td>${u.id}</td>
      <td>${u.usuario}</td>
      <td>${u.nombre}</td>
      <td><span class="badge ${u.rol === 'admin' ? 'badge-admin' : 'badge-vendedor'}">${u.rol}</span></td>
      <td><span class="badge ${u.activo ? 'badge-activo' : 'badge-inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn-tabla" onclick="editarUsuario(${u.id})">Editar</button>
        <button class="btn-tabla btn-tabla-danger" onclick="eliminarUsuario(${u.id}, '${u.usuario}')">Eliminar</button>
      </td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--text-muted)">${fechaStr}</td>
    </tr>
  `;}).join('');
}

function initUsuarios() {
  const $buscar = document.getElementById('buscar-usuario');
  $buscar.addEventListener('input', () => {
    const q = $buscar.value.toLowerCase().trim();
    const filtrados = todosUsuarios.filter(u =>
      u.usuario.toLowerCase().includes(q) ||
      u.nombre.toLowerCase().includes(q) ||
      u.rol.toLowerCase().includes(q)
    );
    renderTablaUsuarios(filtrados);
  });

  document.getElementById('btn-nuevo-usuario').addEventListener('click', () => abrirModalUsuario());
  document.getElementById('modal-usuario-cancelar').addEventListener('click', cerrarModalUsuario);
  document.getElementById('modal-usuario').addEventListener('click', e => { if (e.target.id === 'modal-usuario') cerrarModalUsuario(); });

  document.getElementById('form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('form-usuario').dataset.editId;
    const datos = {
      usuario: document.getElementById('mu-usuario').value.trim(),
      nombre: document.getElementById('mu-nombre').value.trim(),
      rol: document.getElementById('mu-rol').value,
      activo: document.getElementById('mu-activo').value === 'true',
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
      alert('Error de conexión');
    }
  });

  document.getElementById('confirmar-cancelar').addEventListener('click', cerrarModalConfirmar);
  document.getElementById('modal-confirmar').addEventListener('click', e => { if (e.target.id === 'modal-confirmar') cerrarModalConfirmar(); });
}

function abrirModalUsuario(usuario = null) {
  const $modal = document.getElementById('modal-usuario');
  const $titulo = document.getElementById('modal-usuario-titulo');
  const $form = document.getElementById('form-usuario');
  const $pass = document.getElementById('mu-password');

  $form.reset();
  if (usuario) {
    $titulo.textContent = 'Editar usuario';
    $form.dataset.editId = usuario.id;
    document.getElementById('mu-usuario').value = usuario.usuario;
    document.getElementById('mu-nombre').value = usuario.nombre;
    document.getElementById('mu-rol').value = usuario.rol;
    document.getElementById('mu-activo').value = String(usuario.activo);
    $pass.placeholder = 'Dejar vacío para no cambiar';
    $pass.required = false;
  } else {
    $titulo.textContent = 'Nuevo usuario';
    delete $form.dataset.editId;
    $pass.placeholder = 'Contraseña';
    $pass.required = true;
  }
  $modal.classList.add('visible');
}

function cerrarModalUsuario() {
  document.getElementById('modal-usuario').classList.remove('visible');
}

function editarUsuario(id) {
  const u = todosUsuarios.find(x => x.id === id);
  if (u) abrirModalUsuario(u);
}

let pendingDeleteId = null;
function eliminarUsuario(id, nombre) {
  pendingDeleteId = id;
  document.getElementById('confirmar-texto').textContent = `¿Eliminar al usuario "${nombre}"?`;
  document.getElementById('modal-confirmar').classList.add('visible');
  document.getElementById('confirmar-ok').onclick = async () => {
    try {
      const r = await fetch(`${API}/usuarios/${pendingDeleteId}`, { method: 'DELETE', headers: authHeaders(false) });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Error'); }
      cerrarModalConfirmar();
      cargarUsuarios();
    } catch { alert('Error de conexión'); }
  };
}

function cerrarModalConfirmar() {
  document.getElementById('modal-confirmar').classList.remove('visible');
  pendingDeleteId = null;
}
