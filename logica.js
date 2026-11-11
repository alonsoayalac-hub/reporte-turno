/* Lógica del reporte de turno: áreas, interpretación del texto, turnos y reporte.
   Funciona en el navegador (window.Logica) y en Node (para pruebas). */
(function (root) {
  'use strict';

  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const pad = (n) => String(n).padStart(2, '0');
  const fFecha = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  const fHora = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const nombreDia = (d) => cap(DIAS[d.getDay()]);

  /** Sin tildes y en mayúsculas, para comparar "Chancado" con "CHANCADO". */
  function normalizar(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  }

  /** Día: 08:00 a 20:00. Noche: 20:00 a 08:00. */
  function turnoActual(ahora = new Date()) {
    const h = ahora.getHours();
    return h >= 8 && h < 20 ? 'dia' : 'noche';
  }

  /** Turno más reciente de ese tipo que ya haya comenzado. */
  function rangoTurno(turno, ahora = new Date()) {
    const inicio = new Date(ahora);
    inicio.setHours(turno === 'dia' ? 8 : 20, 0, 0, 0);
    if (inicio > ahora) inicio.setDate(inicio.getDate() - 1);
    const fin = new Date(inicio);
    fin.setHours(inicio.getHours() + 12);
    return { inicio, fin };
  }

  /** Busca el área al inicio del texto ("Chancado, corte de correa...").
      Si hay áreas parecidas (CHANCADO y CHANCADO PRIMARIO) gana la más larga. */
  function interpretar(texto, areas) {
    const original = String(texto || '').trim();
    if (!original) return null;
    const norm = normalizar(original);
    const ordenadas = [...areas].sort(
      (a, b) => normalizar(b.nombre).length - normalizar(a.nombre).length
    );
    for (const area of ordenadas) {
      const nombre = normalizar(area.nombre);
      if (!nombre || !norm.startsWith(nombre)) continue;
      const siguiente = norm.charAt(nombre.length);
      if (siguiente && /[A-Z0-9]/.test(siguiente)) continue; // CHANCADOR no es CHANCADO

      let i = 0;
      let consumido = 0;
      while (i < original.length && consumido < nombre.length) {
        consumido += normalizar(original[i]).length;
        i++;
      }
      const descripcion = original.slice(i).replace(/^[\s,:;\-–.]+/, '').trim();
      return { area, descripcion };
    }
    return null;
  }

  /** Área donde caen los eventos en que no se detecta un área al inicio del texto. */
  const OTROS = 'OTROS EVENTOS';

  /** Como interpretar(), pero si no se detecta un área el evento va a OTROS EVENTOS
      con el texto completo. Devuelve null solo si el texto está vacío. */
  function clasificar(texto, areas) {
    const original = String(texto || '').trim();
    if (!original) return null;
    const r = interpretar(original, areas);
    if (r) return { area: r.area, descripcion: r.descripcion, sinArea: false };
    return { area: { id: 'otros', nombre: OTROS }, descripcion: original, sinArea: true };
  }

  /** Nombres de área en orden: las áreas creadas, luego las áreas borradas que aún
      tengan eventos, y al final OTROS EVENTOS (solo si tiene eventos). */
  function nombresDeArea(areas, eventos) {
    const nombres = areas.map((a) => a.nombre);
    for (const e of eventos) {
      if (e.areaNombre !== OTROS && !nombres.includes(e.areaNombre)) nombres.push(e.areaNombre);
    }
    if (!nombres.includes(OTROS) && eventos.some((e) => e.areaNombre === OTROS)) nombres.push(OTROS);
    return nombres;
  }

  /** Reporte del turno: eventos agrupados por área, en el orden en que se agregaron,
      sin fecha ni hora por evento. Formato listo para WhatsApp (*negrita*). */
  function generarReporte(turno, eventos, areas, ahora = new Date()) {
    const rango = rangoTurno(turno, ahora);
    const delTurno = eventos.filter(
      (e) => e.fecha >= rango.inicio.getTime() && e.fecha < rango.fin.getTime()
    );

    const nombres = nombresDeArea(areas, delTurno);

    const lineas = [];
    lineas.push(`*REPORTE DE TURNO – ${turno === 'dia' ? 'DÍA' : 'NOCHE'}*`);
    lineas.push(`Fecha: ${nombreDia(rango.inicio)} ${fFecha(rango.inicio)}`);
    lineas.push(`Horario: ${fHora(rango.inicio)} – ${fHora(rango.fin)}`);
    if (turno === 'noche') lineas.push(`(Termina el ${fFecha(rango.fin)})`);
    lineas.push('');

    for (const nombre of nombres) {
      lineas.push(`*${nombre}*`);
      const delArea = delTurno.filter((e) => e.areaNombre === nombre);
      if (delArea.length === 0) {
        lineas.push('• Sin novedades');
      } else {
        for (const e of delArea) lineas.push(`• ${e.descripcion}`);
      }
      lineas.push('');
    }
    lineas.push(`Total de eventos: ${delTurno.length}`);

    const y = rango.inicio.getFullYear();
    const m = pad(rango.inicio.getMonth() + 1);
    const d = pad(rango.inicio.getDate());
    return {
      texto: lineas.join('\n'),
      rango,
      total: delTurno.length,
      archivo: `Reporte_Turno_${turno === 'dia' ? 'Dia' : 'Noche'}_${y}-${m}-${d}.txt`,
    };
  }

  function urlWhatsApp(texto) {
    return 'https://wa.me/?text=' + encodeURIComponent(texto);
  }

  const api = {
    normalizar, turnoActual, rangoTurno, interpretar, clasificar, nombresDeArea, OTROS,
    generarReporte, urlWhatsApp, fFecha, fHora, nombreDia,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logica = api;
})(typeof window !== 'undefined' ? window : globalThis);
