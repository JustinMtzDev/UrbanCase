(function (global) {
  const THEME_KEY = 'urbancase-theme';
  const HORA_INICIO_NOCHE = 20;
  const HORA_FIN_NOCHE = 7;

  function temaOscuroPorHora(date) {
    const h = (date || new Date()).getHours();
    return h >= HORA_INICIO_NOCHE || h < HORA_FIN_NOCHE;
  }

  function leerPreferenciaTema() {
    try {
      const p = localStorage.getItem(THEME_KEY);
      if (p === 'dark' || p === 'light') return p;
      return 'auto';
    } catch {
      return 'auto';
    }
  }

  function resolverTemaOscuro() {
    const pref = leerPreferenciaTema();
    if (pref === 'dark') return true;
    if (pref === 'light') return false;
    return temaOscuroPorHora();
  }

  function aplicarClaseTema(oscuro) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('theme-dark', oscuro);
    if (document.body) {
      document.body.classList.toggle('theme-dark', oscuro);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body?.classList.toggle('theme-dark', oscuro);
      }, { once: true });
    }
  }

  function guardarPreferenciaTema(pref) {
    try { localStorage.setItem(THEME_KEY, pref); } catch (_) {}
  }

  function aplicarTemaDesdePreferencia() {
    const oscuro = resolverTemaOscuro();
    aplicarClaseTema(oscuro);
    return oscuro;
  }

  function alternarTemaManual() {
    const actualOscuro = document.body?.classList.contains('theme-dark')
      ?? document.documentElement.classList.contains('theme-dark');
    const nuevoOscuro = !actualOscuro;
    aplicarClaseTema(nuevoOscuro);
    guardarPreferenciaTema(nuevoOscuro ? 'dark' : 'light');
    return nuevoOscuro;
  }

  function iniciarTemaAutomatico(onChange) {
    function tick() {
      if (leerPreferenciaTema() !== 'auto') return;
      const oscuro = resolverTemaOscuro();
      const actual = document.body?.classList.contains('theme-dark');
      if (actual !== oscuro) {
        aplicarClaseTema(oscuro);
        if (typeof onChange === 'function') onChange(oscuro);
      }
    }
    setInterval(tick, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tick();
    });
  }

  global.UrbanCaseTheme = {
    THEME_KEY,
    temaOscuroPorHora,
    leerPreferenciaTema,
    resolverTemaOscuro,
    aplicarClaseTema,
    guardarPreferenciaTema,
    aplicarTemaDesdePreferencia,
    alternarTemaManual,
    iniciarTemaAutomatico,
  };
})(typeof window !== 'undefined' ? window : globalThis);
