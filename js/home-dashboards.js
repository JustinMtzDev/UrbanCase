/**
 * Home — KPIs, gráfica de ventas y top productos.
 */
(function (global) {
  let periodoActivo = 'diario';
  let cargando = false;
  let chart7d = null;

  function apiBase() {
    if (typeof global.ucResolveApiBase === 'function') return global.ucResolveApiBase();
    const { protocol, hostname, origin } = window.location;
    const p = String(window.location.port || '');
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (protocol === 'file:') return 'http://localhost:3000/api';
    if (isLocal && p === '3000') return `${origin}/api`;
    if (isLocal) return 'http://localhost:3000/api';
    return `${origin}/api`;
  }

  function authHeaders() {
    return { Authorization: `Bearer ${localStorage.getItem('uc_token') || ''}` };
  }

  function formatearPrecio(n) {
    return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function leerSucursalParam() {
    const raw = String(document.getElementById('dropdown-sucursales-label')?.dataset?.sucursalId ?? '').trim();
    const lower = raw.toLowerCase();
    if (!raw || lower === 'all' || lower === 'todas') return null;
    const sid = Number(raw);
    return Number.isFinite(sid) && sid > 0 ? sid : null;
  }

  function esTemaOscuro() {
    return document.body.classList.contains('theme-dark') || document.documentElement.classList.contains('theme-dark');
  }

  function colorAccent() {
    return esTemaOscuro() ? '#00d4aa' : '#fa3030';
  }

  function textoVariacion(pct, etiqueta) {
    if (pct == null || !Number.isFinite(pct)) return '';
    const signo = pct > 0 ? '+' : '';
    const redondeo = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
    return `${signo}${redondeo}% que ${etiqueta || 'el periodo anterior'}`;
  }

  function aplicarClaseVariacion($el, pct) {
    if (!$el) return;
    $el.classList.remove('dashboard-kpi-meta--up', 'dashboard-kpi-meta--down', 'dashboard-kpi-meta--neutral');
    if (pct == null || !Number.isFinite(pct) || pct === 0) {
      $el.classList.add('dashboard-kpi-meta--neutral');
      return;
    }
    $el.classList.add(pct > 0 ? 'dashboard-kpi-meta--up' : 'dashboard-kpi-meta--down');
  }

  function pintarTopProductos(data) {
    const $track = document.getElementById('home-top-productos-track');
    const $sub = document.getElementById('home-top-productos-sub');
    const $nav = document.querySelector('#home-top-productos .dashboard-top-productos-nav');
    if (!$track) return;
    const lista = Array.isArray(data?.productos) ? data.productos : [];
    const etiquetaSuc = document.getElementById('dropdown-sucursales-label')?.textContent?.trim()
      || (data?.todas_sucursales ? 'Todas las sucursales' : 'Sucursal');
    if ($sub) $sub.textContent = etiquetaSuc;
    if (!lista.length) {
      $track.innerHTML = '<p class="dashboard-top-vacio">Aún no hay ventas en este periodo</p>';
      if ($nav) $nav.hidden = true;
      return;
    }
    if ($nav) $nav.hidden = lista.length < 2;
    $track.innerHTML = lista.map((p) => {
      const rank = Number(p.ranking) || 0;
      const img = String(p.imagen || '').trim();
      const imgHtml = img
        ? `<div class="inventario-producto-img-wrap"><img class="inventario-producto-img" src="${escHtml(img)}" alt=""></div>`
        : '<div class="inventario-producto-img-wrap inventario-producto-img-wrap--vacia"></div>';
      const consignado = p.es_consignado
        ? '<span class="inventario-consignado-etiqueta dashboard-top-consignado">Consignado</span>'
        : '';
      return `
        <article class="dashboard-top-card" role="listitem">
          <span class="dashboard-top-rank">#${rank}</span>
          ${consignado}
          ${imgHtml}
          <div class="dashboard-top-card-nombre">${escHtml(p.nombre)}</div>
          <div class="dashboard-top-card-meta">Vendidos: ${Number(p.unidades) || 0}</div>
          <div class="dashboard-top-card-ingreso">${formatearPrecio(p.ingresos)}</div>
        </article>
      `;
    }).join('');
    $track.scrollLeft = 0;
  }

  function moverTopCarrusel(dir) {
    const track = document.getElementById('home-top-productos-track');
    const card = track?.querySelector('.dashboard-top-card');
    if (!track || !card) return;
    const paso = card.getBoundingClientRect().width + 12;
    track.scrollBy({ left: dir === 'next' ? paso : -paso, behavior: 'smooth' });
  }

  const COLORES_SUC = ['#00d4aa', '#5b8def', '#f0b429', '#f07178', '#c084fc'];

  function formatoPct(n) {
    const v = Number(n) || 0;
    if (v > 0 && v < 1) return '<1%';
    return `${Math.round(v)}%`;
  }

  function pintarComparativaSucursales(data, visible) {
    const $sec = document.getElementById('home-comparativa-sucursales');
    const $grid = document.getElementById('home-comparativa-grid');
    const $bar = document.getElementById('home-comparativa-bar');
    if (!$sec || !$grid || !$bar) return;
    if (!visible) {
      $sec.hidden = true;
      return;
    }
    $sec.hidden = false;
    const lista = Array.isArray(data?.sucursales) ? data.sucursales : [];
    if (!lista.length) {
      $bar.innerHTML = '';
      $grid.innerHTML = '<p class="dashboard-top-vacio">No hay sucursales para comparar</p>';
      return;
    }

    const liderId = lista.reduce((best, cur) => {
      const ingB = Number(best?.ingresos) || 0;
      const ingC = Number(cur.ingresos) || 0;
      return ingC > ingB ? cur : best;
    }, lista[0])?.id;
    const total = Number(data?.total_ingresos) || 0;

    $bar.innerHTML = total <= 0
      ? '<div class="dashboard-comparativa-bar-vacia">Sin ingresos en este periodo</div>'
      : lista.map((s, i) => {
        const pct = Number(s.participacion_pct) || 0;
        if (pct <= 0) return '';
        const color = COLORES_SUC[i % COLORES_SUC.length];
        return `<span class="dashboard-comparativa-seg" style="width:${pct}%;background:${color}" title="${escHtml(s.nombre)} ${formatoPct(pct)}"></span>`;
      }).join('');

    $grid.innerHTML = lista.map((s, i) => {
      const color = COLORES_SUC[i % COLORES_SUC.length];
      const lider = Number(s.id) === Number(liderId) && (Number(s.ingresos) || 0) > 0;
      const estrella = s.producto_estrella
        ? `${escHtml(s.producto_estrella)} · ${Number(s.producto_estrella_unidades) || 0} uds`
        : 'Sin ventas';
      return `
        <article class="dashboard-comparativa-card${lider ? ' esta-lider' : ''}">
          <div class="dashboard-comparativa-card-head">
            <span class="dashboard-comparativa-dot" style="background:${color}"></span>
            <h4>${escHtml(s.nombre)}</h4>
            ${lider ? '<span class="dashboard-comparativa-badge">Líder</span>' : ''}
          </div>
          <strong class="dashboard-comparativa-ingreso">${formatearPrecio(s.ingresos)}</strong>
          <p class="dashboard-comparativa-pct">${formatoPct(s.participacion_pct)} del total</p>
          <dl class="dashboard-comparativa-dl">
            <div><dt>Tickets</dt><dd>${Number(s.tickets) || 0}</dd></div>
            <div><dt>Ticket promedio</dt><dd>${formatearPrecio(s.ticket_promedio)}</dd></div>
            <div class="dashboard-comparativa-dl-full"><dt>Producto estrella</dt><dd>${estrella}</dd></div>
          </dl>
        </article>
      `;
    }).join('');
  }

  function pintarKpis(data) {
    const $ing = document.getElementById('dash-kpi-ingresos');
    const $ingMeta = document.getElementById('dash-kpi-ingresos-meta');
    const $com = document.getElementById('dash-kpi-comision');
    const $tic = document.getElementById('dash-kpi-tickets');
    const $ticket = document.getElementById('dash-kpi-ticket');

    if ($ing) $ing.textContent = formatearPrecio(data.ingresos);
    if ($com) $com.textContent = formatearPrecio(data.ingresos_comision);
    if ($tic) $tic.textContent = String(data.tickets ?? 0);
    if ($ticket) $ticket.textContent = formatearPrecio(data.ticket_promedio);

    if ($ingMeta) {
      const txt = textoVariacion(data.variacion_pct, data.etiqueta_comparacion);
      $ingMeta.textContent = txt;
      $ingMeta.hidden = !txt;
      aplicarClaseVariacion($ingMeta, data.variacion_pct);
    }
  }

  function destruirChart7d() {
    if (chart7d) {
      chart7d.destroy();
      chart7d = null;
    }
  }

  function redimensionarChart7d() {
    try { chart7d?.resize(); } catch (_) { /* ignore */ }
  }

  const ORDEN_LUN_DOM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  function ordenarDiasLunDom(dias) {
    return (Array.isArray(dias) ? dias : [])
      .slice()
      .sort((a, b) => ORDEN_LUN_DOM.indexOf(a.etiqueta) - ORDEN_LUN_DOM.indexOf(b.etiqueta));
  }

  function renderChart7d(dias) {
    const canvas = document.getElementById('home-chart-ventas-7d');
    if (!canvas || typeof global.Chart === 'undefined') return;

    destruirChart7d();
    const lista = ordenarDiasLunDom(dias);
    const labels = lista.map((d) => d.etiqueta || '');
    const ingresos = lista.map((d) => Number(d.ingresos) || 0);
    const meta = lista.map((d) => ({
      larga: d.etiqueta_larga || d.etiqueta || '',
      tickets: Number(d.tickets) || 0,
      promedio: Number(d.ticket_promedio) || 0,
    }));
    const maxIng = Math.max(0, ...ingresos);
    const c = colorAccent();
    const texto = esTemaOscuro() ? '#b8b8c8' : '#5c5c66';
    const grid = esTemaOscuro() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

    chart7d = new global.Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ingresos',
          data: ingresos,
          backgroundColor: c,
          borderRadius: { topLeft: 8, topRight: 8 },
          borderSkipped: false,
          maxBarThickness: 48,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: esTemaOscuro() ? '#1a1a1f' : '#fff',
            titleColor: esTemaOscuro() ? '#e8e8ed' : '#1a1a1f',
            bodyColor: texto,
            borderColor: esTemaOscuro() ? '#2d2d36' : 'rgba(0,0,0,0.1)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
              title: (items) => meta[items[0]?.dataIndex]?.larga || items[0]?.label || '',
              label: () => '',
              afterBody: (items) => {
                const i = items[0]?.dataIndex ?? 0;
                const m = meta[i] || {};
                const prom = m.promedio > 0 ? m.promedio : (m.tickets > 0 ? ingresos[i] / m.tickets : 0);
                return [
                  `Ingresos: ${formatearPrecio(ingresos[i])}`,
                  `Tickets: ${m.tickets ?? 0}`,
                  `Promedio por ticket: ${formatearPrecio(prom)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: texto, font: { family: 'DM Sans', size: 11, weight: '600' } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            suggestedMax: maxIng <= 0 ? 100 : undefined,
            ticks: {
              color: texto,
              font: { size: 10 },
              callback: (v) => formatearPrecio(v),
            },
            grid: { color: grid },
          },
        },
      },
    });

    requestAnimationFrame(() => requestAnimationFrame(redimensionarChart7d));
  }

  async function cargarChart7d() {
    const params = new URLSearchParams();
    const sid = leerSucursalParam();
    if (sid != null) params.set('sucursal_id', String(sid));
    try {
      const r = await fetch(`${apiBase()}/reportes/dashboard-ventas-7d?${params}`, { headers: authHeaders() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'No se pudo cargar la gráfica');
      renderChart7d(data.dias);
    } catch (err) {
      console.error('home-chart-7d:', err);
      renderChart7d([]);
    }
  }

  function programarResizeChart() {
    requestAnimationFrame(() => {
      redimensionarChart7d();
      setTimeout(redimensionarChart7d, 120);
    });
  }

  async function cargarHomeDashboards() {
    if (cargando) return;
    const enHome = document.querySelector('.categoria-btn[data-categoria="todos"]')?.classList.contains('activo');
    if (!enHome || !document.getElementById('home-dashboards')) return;

    cargando = true;
    document.getElementById('home-dashboards')?.classList.add('cargando');

    const params = new URLSearchParams({ periodo: periodoActivo });
    const chartParams = new URLSearchParams();
    const sid = leerSucursalParam();
    if (sid != null) {
      params.set('sucursal_id', String(sid));
      chartParams.set('sucursal_id', String(sid));
    }

    try {
      const [rKpi, rChart, rTop, rCmp] = await Promise.all([
        fetch(`${apiBase()}/reportes/dashboard-kpis?${params}`, { headers: authHeaders() }),
        fetch(`${apiBase()}/reportes/dashboard-ventas-7d?${chartParams}`, { headers: authHeaders() }),
        fetch(`${apiBase()}/reportes/dashboard-top-productos?${params}`, { headers: authHeaders() }),
        sid == null
          ? fetch(`${apiBase()}/reportes/dashboard-comparativa-sucursales?${params}`, { headers: authHeaders() })
          : Promise.resolve({ ok: true, json: async () => ({ sucursales: [] }) }),
      ]);
      const dataKpi = await rKpi.json().catch(() => ({}));
      const dataChart = await rChart.json().catch(() => ({}));
      const dataTop = await rTop.json().catch(() => ({}));
      const dataCmp = sid == null ? await rCmp.json().catch(() => ({})) : { sucursales: [] };

      if (rKpi.ok) {
        pintarKpis(dataKpi);
      } else {
        const msg = dataKpi.error || (rKpi.status === 404 ? 'Ruta no encontrada. Reinicia el servidor (npm start).' : 'No se pudieron cargar los indicadores');
        pintarKpis({
          ingresos: 0,
          ingresos_comision: 0,
          tickets: 0,
          ticket_promedio: 0,
          variacion_pct: null,
        });
        const $meta = document.getElementById('dash-kpi-ingresos-meta');
        if ($meta) {
          $meta.hidden = false;
          $meta.textContent = msg;
          $meta.classList.add('dashboard-kpi-meta--down');
        }
        console.error('home-dashboards KPI:', msg);
      }

      if (rChart.ok && Array.isArray(dataChart.dias) && dataChart.dias.length) {
        renderChart7d(dataChart.dias);
        programarResizeChart();
      } else {
        const chartMsg = dataChart.error || (rChart.status === 404 ? 'Gráfica: reinicia el servidor.' : 'No se pudo cargar la gráfica');
        console.error('home-chart-7d:', chartMsg, rChart.status);
      }

      if (rTop.ok) {
        pintarTopProductos(dataTop);
      } else {
        pintarTopProductos({ productos: [], todas_sucursales: sid == null });
        console.error('home-top-productos:', dataTop.error || rTop.status);
      }

      if (sid == null && rCmp.ok) {
        pintarComparativaSucursales(dataCmp, true);
      } else {
        pintarComparativaSucursales({ sucursales: [] }, false);
        if (sid == null) console.error('home-comparativa:', dataCmp.error || rCmp.status);
      }
    } catch (err) {
      console.error('home-dashboards:', err);
    } finally {
      cargando = false;
      document.getElementById('home-dashboards')?.classList.remove('cargando');
    }
  }

  function initHomeDashboards() {
    document.querySelectorAll('[data-dash-periodo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.dashPeriodo;
        if (!p || p === periodoActivo) return;
        periodoActivo = p;
        document.querySelectorAll('[data-dash-periodo]').forEach((b) => {
          b.classList.toggle('activo', b.dataset.dashPeriodo === p);
        });
        void cargarHomeDashboards();
      });
    });
    document.getElementById('home-top-productos')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-top-dir]');
      if (!btn) return;
      moverTopCarrusel(btn.dataset.topDir);
    });
    window.addEventListener('resize', () => {
      if (document.querySelector('.categoria-btn[data-categoria="todos"].activo')) redimensionarChart7d();
    });
  }

  global.ucCargarHomeDashboards = cargarHomeDashboards;
  global.initHomeDashboards = initHomeDashboards;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomeDashboards);
  } else {
    initHomeDashboards();
  }
})(window);
