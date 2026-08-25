/**
 * Datepicker UrbanCase — reemplaza el popup nativo de input[type=date].
 */
(function (global) {
  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const DIAS = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'];

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toIso(y, m, d) {
    return `${y}-${pad2(m + 1)}-${pad2(d)}`;
  }

  function parseIso(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return { y, m: mo, d };
  }

  function hoyIso() {
    const t = new Date();
    return toIso(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function compararFecha(a, b) {
    if (a.y !== b.y) return a.y - b.y;
    if (a.m !== b.m) return a.m - b.m;
    return a.d - b.d;
  }

  /** true si la fecha es posterior a hoy (futura). */
  function esFechaFutura(y, m, d, ref) {
    if (!ref) return false;
    return compararFecha({ y, m, d }, ref) > 0;
  }

  function mesPosteriorAHoy(y, m, ref) {
    if (!ref) return false;
    if (y > ref.y) return true;
    return y === ref.y && m > ref.m;
  }

  function formatearEtiqueta(iso) {
    const p = parseIso(iso);
    if (!p) return 'Seleccionar fecha';
    const dt = new Date(p.y, p.m, p.d);
    const txt = dt.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function cerrarDatepicker($wrap) {
    if (!$wrap) return;
    if (typeof $wrap._ucDatepickerCerrar === 'function') {
      $wrap._ucDatepickerCerrar();
      return;
    }
    $wrap.classList.remove('abierto');
    const $pop = getPopover($wrap);
    if ($pop) {
      $pop.hidden = true;
      devolverPopoverAlWrap($wrap, $pop);
    }
    const $trigger = $wrap.querySelector('.uc-datepicker-trigger');
    $trigger?.setAttribute('aria-expanded', 'false');
  }

  function cerrarOtros(excepto) {
    document.querySelectorAll('.uc-datepicker.abierto').forEach((el) => {
      if (el !== excepto) cerrarDatepicker(el);
    });
  }

  function getPopover($wrap) {
    return $wrap._ucDatepickerPop || $wrap.querySelector('.uc-datepicker-popover');
  }

  function perteneceAlDatepicker($wrap, target) {
    if (!$wrap || !target) return false;
    if ($wrap.contains(target)) return true;
    const $pop = getPopover($wrap);
    return $pop?.contains(target) ?? false;
  }

  function cerrarSiClickFuera(e) {
    document.querySelectorAll('.uc-datepicker.abierto').forEach(($wrap) => {
      if (perteneceAlDatepicker($wrap, e.target)) return;
      cerrarDatepicker($wrap);
    });
  }

  /** Evita que backdrop-filter/transform del panel desalineen position:fixed. */
  function anclarPopoverAlBody($wrap, $pop) {
    if ($pop.parentNode !== document.body) document.body.appendChild($pop);
    $wrap._ucDatepickerPop = $pop;
  }

  function devolverPopoverAlWrap($wrap, $pop) {
    if ($wrap.isConnected && $pop.parentNode === document.body) {
      $wrap.appendChild($pop);
    }
  }

  function posicionarPopover($wrap, $pop) {
    const tr = $wrap.querySelector('.uc-datepicker-trigger');
    if (!tr || !$pop) return;
    const r = tr.getBoundingClientRect();
    const popW = Math.min(320, Math.max(288, $pop.offsetWidth || $pop.scrollWidth || 288));
    let left = r.left;
    let top = r.bottom + 6;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (left < 8) left = 8;
    const popH = $pop.offsetHeight || 320;
    if (top + popH > window.innerHeight - 8) top = Math.max(8, r.top - popH - 6);
    $pop.style.position = 'fixed';
    $pop.style.left = `${Math.round(left)}px`;
    $pop.style.top = `${Math.round(top)}px`;
    $pop.style.width = `${popW}px`;
    $pop.style.minWidth = '288px';
    $pop.style.maxWidth = `min(320px, calc(100vw - 16px))`;
    $pop.style.right = 'auto';
    $pop.style.bottom = 'auto';
    $pop.style.margin = '0';
    $pop.style.boxSizing = 'border-box';
    $pop.style.zIndex = '1200';
  }

  function initUcDatepicker($input, opts = {}) {
    if (!$input || $input.dataset.ucDatepickerInit) return null;
    $input.dataset.ucDatepickerInit = '1';
    $input.type = 'hidden';

    const $wrap = document.createElement('div');
    $wrap.className = 'uc-datepicker';
    if ($input.className) {
      $input.className.split(/\s+/).filter(Boolean).forEach((c) => {
        if (c !== 'modulo-buscar') $wrap.classList.add(c);
      });
    }
    $input.parentNode.insertBefore($wrap, $input);
    $wrap.appendChild($input);

    const ariaLabel = $input.getAttribute('aria-label') || 'Seleccionar fecha';
    const $trigger = document.createElement('button');
    $trigger.type = 'button';
    $trigger.className = 'uc-datepicker-trigger';
    $trigger.setAttribute('aria-label', ariaLabel);
    $trigger.setAttribute('aria-haspopup', 'dialog');
    $trigger.setAttribute('aria-expanded', 'false');

    const $label = document.createElement('span');
    $label.className = 'uc-datepicker-trigger-text';
    const $icon = document.createElement('span');
    $icon.className = 'uc-datepicker-trigger-icon';
    $icon.setAttribute('aria-hidden', 'true');
    $icon.innerHTML = '<i class="fa-regular fa-calendar"></i>';
    $trigger.appendChild($label);
    $trigger.appendChild($icon);

    const $pop = document.createElement('div');
    $pop.className = 'uc-datepicker-popover';
    $pop.setAttribute('role', 'dialog');
    $pop.setAttribute('aria-modal', 'false');
    $pop.hidden = true;

    $pop.innerHTML = `
      <div class="uc-datepicker-header">
        <button type="button" class="uc-datepicker-nav" data-nav="prev" aria-label="Mes anterior">&lsaquo;</button>
        <div class="uc-datepicker-mes" data-mes-titulo></div>
        <button type="button" class="uc-datepicker-nav" data-nav="next" aria-label="Mes siguiente">&rsaquo;</button>
      </div>
      <div class="uc-datepicker-dias-semana" data-dias-semana></div>
      <div class="uc-datepicker-grid" data-grid></div>
      <div class="uc-datepicker-footer">
        <button type="button" class="uc-datepicker-footer-btn" data-accion="borrar">Borrar</button>
        <button type="button" class="uc-datepicker-footer-btn uc-datepicker-footer-btn--primario" data-accion="hoy">Hoy</button>
      </div>
    `;

    $wrap.appendChild($trigger);
    $wrap.appendChild($pop);
    $wrap._ucDatepickerPop = $pop;

    const $mesTitulo = $pop.querySelector('[data-mes-titulo]');
    const $diasSemana = $pop.querySelector('[data-dias-semana]');
    const $grid = $pop.querySelector('[data-grid]');
    const hoy = parseIso(hoyIso());
    let fechasActivas = opts.fechasActivas instanceof Set
      ? opts.fechasActivas
      : (Array.isArray(opts.fechasActivas) ? new Set(opts.fechasActivas) : null);
    const soloFechasConRegistros = opts.soloFechasConRegistros === true && fechasActivas;

    $diasSemana.innerHTML = DIAS.map((d) => `<span>${d}</span>`).join('');

    let vistaY = hoy?.y ?? new Date().getFullYear();
    let vistaM = hoy?.m ?? new Date().getMonth();
    const bloquearFuturo = opts.maxHoy !== false;

    function esFechaActiva(iso) {
      if (!soloFechasConRegistros) return true;
      return fechasActivas.has(iso);
    }

    function mejorFechaActivaHasta(refIso) {
      if (!soloFechasConRegistros || !fechasActivas.size) return refIso || hoyIso();
      if (refIso && fechasActivas.has(refIso)) return refIso;
      const ref = refIso || hoyIso();
      const candidatas = [...fechasActivas].filter((f) => f <= ref).sort();
      if (candidatas.length) return candidatas[candidatas.length - 1];
      return [...fechasActivas].sort().pop() || ref;
    }

    function diaDeshabilitado(y, m, d) {
      if (bloquearFuturo && esFechaFutura(y, m, d, hoy)) return true;
      if (soloFechasConRegistros && fechasActivas.size > 0) {
        return !esFechaActiva(toIso(y, m, d));
      }
      return false;
    }

    function notificar() {
      $label.textContent = formatearEtiqueta($input.value);
      $input.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof opts.onChange === 'function') opts.onChange($input.value);
    }

    function setValor(iso) {
      let val = iso || '';
      if (bloquearFuturo && val) {
        const p = parseIso(val);
        if (p && esFechaFutura(p.y, p.m, p.d, hoy)) val = hoyIso();
      }
      $input.value = val;
      notificar();
    }

    function actualizarNavMes() {
      const $next = $pop.querySelector('[data-nav="next"]');
      if (!$next) return;
      const deshab = bloquearFuturo && hoy
        && (vistaY > hoy.y || (vistaY === hoy.y && vistaM >= hoy.m));
      $next.disabled = deshab;
      $next.classList.toggle('uc-datepicker-nav--disabled', deshab);
    }

    function renderGrid() {
      $mesTitulo.textContent = `${MESES[vistaM]} ${vistaY}`;
      actualizarNavMes();
      const primero = new Date(vistaY, vistaM, 1);
      const inicio = primero.getDay();
      const diasMes = new Date(vistaY, vistaM + 1, 0).getDate();
      const diasPrev = new Date(vistaY, vistaM, 0).getDate();
      const sel = parseIso($input.value);
      const celdas = [];

      for (let i = inicio - 1; i >= 0; i--) {
        const d = diasPrev - i;
        const m = vistaM === 0 ? 11 : vistaM - 1;
        const y = vistaM === 0 ? vistaY - 1 : vistaY;
        celdas.push({ y, m, d, otro: true });
      }
      for (let d = 1; d <= diasMes; d++) {
        celdas.push({ y: vistaY, m: vistaM, d, otro: false });
      }
      let nextD = 1;
      const resto = celdas.length % 7;
      const fill = resto === 0 ? 0 : 7 - resto;
      const mNext = vistaM === 11 ? 0 : vistaM + 1;
      const yNext = vistaM === 11 ? vistaY + 1 : vistaY;
      for (let i = 0; i < fill; i++) {
        celdas.push({ y: yNext, m: mNext, d: nextD++, otro: true });
      }

      $grid.innerHTML = celdas.map((c) => {
        const iso = toIso(c.y, c.m, c.d);
        const esSel = sel && sel.y === c.y && sel.m === c.m && sel.d === c.d;
        const esHoy = hoy && hoy.y === c.y && hoy.m === c.m && hoy.d === c.d;
        const deshab = diaDeshabilitado(c.y, c.m, c.d);
        const conReg = fechasActivas instanceof Set && fechasActivas.has(iso);
        const cls = [
          'uc-datepicker-day',
          c.otro ? 'uc-datepicker-day--otro' : '',
          esSel ? 'uc-datepicker-day--sel' : '',
          esHoy ? 'uc-datepicker-day--hoy' : '',
          conReg ? 'uc-datepicker-day--con-registro' : '',
          deshab ? 'uc-datepicker-day--disabled' : '',
        ].filter(Boolean).join(' ');
        const dis = deshab ? ' disabled aria-disabled="true"' : '';
        return `<button type="button" class="${cls}" data-iso="${iso}"${dis}>${c.d}</button>`;
      }).join('');
    }

    function abrir() {
      cerrarOtros($wrap);
      const p = parseIso($input.value) || hoy;
      if (p) {
        vistaY = p.y;
        vistaM = p.m;
      }
      renderGrid();
      anclarPopoverAlBody($wrap, $pop);
      $pop.hidden = false;
      $wrap.classList.add('abierto');
      $trigger.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => {
        posicionarPopover($wrap, $pop);
        requestAnimationFrame(() => posicionarPopover($wrap, $pop));
      });
    }

    function cerrar() {
      $pop.hidden = true;
      $wrap.classList.remove('abierto');
      $trigger.setAttribute('aria-expanded', 'false');
      devolverPopoverAlWrap($wrap, $pop);
    }

    if (!$input.value) $input.value = hoyIso();
    $label.textContent = formatearEtiqueta($input.value);

    $pop.addEventListener('click', (e) => e.stopPropagation());

    $trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if ($wrap.classList.contains('abierto')) cerrar();
      else abrir();
    });

    $pop.querySelector('[data-nav="prev"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (vistaM === 0) { vistaM = 11; vistaY -= 1; } else vistaM -= 1;
      renderGrid();
      requestAnimationFrame(() => posicionarPopover($wrap, $pop));
    });

    $pop.querySelector('[data-nav="next"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const $next = e.currentTarget;
      if ($next.disabled) return;
      let ny = vistaY;
      let nm = vistaM + 1;
      if (nm > 11) { nm = 0; ny += 1; }
      if (bloquearFuturo && hoy && mesPosteriorAHoy(ny, nm, hoy)) return;
      vistaY = ny;
      vistaM = nm;
      renderGrid();
      requestAnimationFrame(() => posicionarPopover($wrap, $pop));
    });

    $grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-iso]');
      if (!btn || btn.disabled) return;
      e.stopPropagation();
      setValor(btn.getAttribute('data-iso'));
      cerrar();
    });

    $pop.querySelector('[data-accion="hoy"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const iso = mejorFechaActivaHasta(hoyIso());
      setValor(iso);
      const p = parseIso(iso);
      if (p) { vistaY = p.y; vistaM = p.m; }
      cerrar();
    });

    $pop.querySelector('[data-accion="borrar"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setValor(mejorFechaActivaHasta(hoyIso()));
      cerrar();
    });

    function setFechasActivas(lista) {
      fechasActivas = Array.isArray(lista)
        ? new Set(lista)
        : (lista instanceof Set ? lista : new Set());
      if ($input.value && soloFechasConRegistros && !fechasActivas.has($input.value)) {
        setValor(mejorFechaActivaHasta($input.value));
      } else {
        notificar();
      }
      if ($wrap.classList.contains('abierto')) renderGrid();
    }

    $wrap._ucDatepickerCerrar = cerrar;
    return { setValue: setValor, abrir, cerrar, setFechasActivas, render: renderGrid };
  }

  if (!global._ucDatepickerDocListener) {
    global._ucDatepickerDocListener = true;
    document.addEventListener('mousedown', cerrarSiClickFuera, true);
    document.addEventListener('touchstart', cerrarSiClickFuera, { capture: true, passive: true });
    window.addEventListener('resize', () => {
      document.querySelectorAll('.uc-datepicker.abierto').forEach(($w) => {
        const $p = getPopover($w);
        if ($p && !$p.hidden) posicionarPopover($w, $p);
      });
    });
    window.addEventListener('scroll', () => {
      document.querySelectorAll('.uc-datepicker.abierto').forEach(($w) => {
        const $p = getPopover($w);
        if ($p && !$p.hidden) posicionarPopover($w, $p);
      });
    }, true);
  }

  global.initUcDatepicker = initUcDatepicker;
})(window);
