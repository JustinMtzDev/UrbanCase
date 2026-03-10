const PRODUCTOS = [];

let carrito = [];
let categoriaActual = 'todos';

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

function productosFiltrados() {
  if (categoriaActual === 'todos') return PRODUCTOS;
  return PRODUCTOS.filter(p => p.categoria === categoriaActual);
}

function renderProductos() {
  const lista = productosFiltrados();
  $productos.innerHTML = lista.map(p => `
    <article class="producto-card" data-id="${p.id}">
      <div class="producto-icono">${p.icono}</div>
      <div class="producto-nombre">${p.nombre}</div>
      <div class="producto-precio">${formatearPrecio(p.precio)}</div>
    </article>
  `).join('');

  $productos.querySelectorAll('.producto-card').forEach(card => {
    card.addEventListener('click', () => agregarAlCarrito(Number(card.dataset.id)));
  });
}

function agregarAlCarrito(id) {
  const prod = PRODUCTOS.find(p => p.id === id);
  if (!prod) return;
  const item = carrito.find(i => i.id === id);
  if (item) item.cantidad++;
  else carrito.push({ ...prod, cantidad: 1 });
  actualizarCarrito();
}

function quitarDelCarrito(id) {
  carrito = carrito.filter(i => i.id !== id);
  actualizarCarrito();
}

function cambiarCantidad(id, delta) {
  const item = carrito.find(i => i.id === id);
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) quitarDelCarrito(id);
  else actualizarCarrito();
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
    const itemsHtml = carrito.map(i => `
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
    $carritoLista.innerHTML = itemsHtml;

    $carritoLista.querySelectorAll('.carrito-item').forEach(row => {
      const id = Number(row.dataset.id);
      row.querySelector('.carrito-item-cantidad button:first-child').onclick = () => cambiarCantidad(id, -1);
      row.querySelector('.carrito-item-cantidad button:last-child').onclick = () => cambiarCantidad(id, 1);
      row.querySelector('.carrito-item-quitar').onclick = () => quitarDelCarrito(id);
    });
  }
}

function vaciarCarrito() {
  carrito = [];
  actualizarCarrito();
}

function cobrar() {
  if (carrito.length === 0) return;
  const totalNum = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  $modalTotal.textContent = formatearPrecio(totalNum);
  $modal.classList.add('visible');
}

function cerrarModal() {
  $modal.classList.remove('visible');
}

function nuevaVenta() {
  cerrarModal();
  vaciarCarrito();
}

document.querySelectorAll('.categoria-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.categoria-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    categoriaActual = btn.dataset.categoria;
    renderProductos();
  });
});

$btnVaciar.addEventListener('click', vaciarCarrito);
$btnCobrar.addEventListener('click', cobrar);
$modalCerrar.addEventListener('click', cerrarModal);
$modalNueva.addEventListener('click', nuevaVenta);
$modal.addEventListener('click', e => { if (e.target === $modal) cerrarModal(); });

const THEME_KEY = 'urbancase-theme';
const $themeToggle = document.getElementById('theme-toggle');
const $themeLabel = $themeToggle && $themeToggle.querySelector('.theme-label');

function aplicarTema(oscuro) {
  if (oscuro) {
    document.body.classList.add('theme-dark');
    if ($themeLabel) $themeLabel.textContent = 'Claro';
    if ($themeToggle) $themeToggle.setAttribute('title', 'Cambiar a tema claro (liquid glass)');
  } else {
    document.body.classList.remove('theme-dark');
    if ($themeLabel) $themeLabel.textContent = 'Obscuro';
    if ($themeToggle) $themeToggle.setAttribute('title', 'Tema obscuro');
  }
  try { localStorage.setItem(THEME_KEY, oscuro ? 'dark' : 'light'); } catch (_) {}
}

if ($themeToggle) {
  $themeToggle.addEventListener('click', () => aplicarTema(!document.body.classList.contains('theme-dark')));
  const guardado = localStorage.getItem(THEME_KEY);
  aplicarTema(guardado === 'dark');
}

renderProductos();
actualizarCarrito();
