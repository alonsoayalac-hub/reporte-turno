/* Importación local de paquetes exportados desde Excel ABB TIS.
   No transmite los datos a Supabase ni a ningún servicio externo. */
(function (root) {
  'use strict';

  const SCHEMA = 'reporte-turno.abb.v1';
  let current = null;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function parseDate(value, label) {
    const d = new Date(value);
    if (!value || Number.isNaN(d.getTime())) throw new Error('Fecha inválida en ' + label + '.');
    return d;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('El archivo no contiene un objeto JSON válido.');
    }
    if (raw.schema !== SCHEMA) {
      throw new Error('Versión de archivo no reconocida. Se esperaba ' + SCHEMA + '.');
    }
    if (!raw.shift || !Array.isArray(raw.variables) || !Array.isArray(raw.records)) {
      throw new Error('Faltan los datos del turno, las variables o los registros.');
    }
    if (raw.variables.length < 1 || raw.variables.length > 200) {
      throw new Error('La cantidad de variables debe estar entre 1 y 200.');
    }
    if (raw.records.length < 1 || raw.records.length > 20000) {
      throw new Error('La cantidad de registros debe estar entre 1 y 20.000.');
    }

    const start = parseDate(raw.shift.start, 'inicio del turno');
    const end = parseDate(raw.shift.end, 'término del turno');
    if (end <= start) throw new Error('El término del turno debe ser posterior al inicio.');
    const durationHours = (end - start) / 3600000;
    if (durationHours < 11.5 || durationHours > 12.5) {
      throw new Error('El intervalo del turno no corresponde a un turno de aproximadamente 12 horas.');
    }

    const variables = raw.variables.map((v, i) => {
      if (!v || typeof v !== 'object' || !String(v.ricode || '').trim()) {
        throw new Error('La variable número ' + (i + 1) + ' no tiene código RIC.');
      }
      return {
        ricode: String(v.ricode).trim(),
        description: String(v.description || v.ricode).trim(),
        unit: String(v.unit || '').trim()
      };
    });

    const seen = new Set();
    const records = raw.records.map((r, i) => {
      if (!r || typeof r !== 'object') throw new Error('Registro inválido en la fila ' + (i + 1) + '.');
      const timestamp = parseDate(r.timestamp, 'registro ' + (i + 1));
      if (timestamp < start || timestamp >= end) {
        throw new Error('Hay registros fuera del intervalo del turno. Revisa las fechas del Excel.');
      }
      const key = timestamp.getTime();
      if (seen.has(key)) throw new Error('Hay marcas de tiempo duplicadas: ' + timestamp.toLocaleString('es-CL') + '.');
      seen.add(key);

      let values;
      if (Array.isArray(r.values)) {
        if (r.values.length !== variables.length) {
          throw new Error('El registro ' + (i + 1) + ' no coincide con la cantidad de variables.');
        }
        values = r.values.map((v) => v === null || v === '' || typeof v === 'undefined' ? null : Number(v));
      } else if (r.values && typeof r.values === 'object') {
        values = variables.map((v) => {
          const value = r.values[v.ricode];
          return value === null || value === '' || typeof value === 'undefined' ? null : Number(value);
        });
      } else {
        throw new Error('El registro ' + (i + 1) + ' no contiene valores.');
      }
      if (values.some((v) => v !== null && !Number.isFinite(v))) {
        throw new Error('Se encontró un valor que no es numérico en el registro ' + (i + 1) + '.');
      }
      return { timestamp, values };
    }).sort((a, b) => a.timestamp - b.timestamp);

    const stats = variables.map((variable, index) => {
      const values = records.map((r) => r.values[index]).filter((v) => v !== null);
      if (!values.length) return { ...variable, count: 0, avg: null, min: null, max: null, last: null };
      const sum = values.reduce((a, b) => a + b, 0);
      return {
        ...variable,
        count: values.length,
        avg: sum / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        last: values[values.length - 1]
      };
    });

    const nonEmpty = stats.filter((s) => s.count > 0).length;
    if (!nonEmpty) throw new Error('El archivo contiene registros, pero ninguna variable tiene valores numéricos.');

    return {
      schema: SCHEMA,
      source: String(raw.source || 'Excel ABB TIS'),
      exportedAt: raw.exportedAt || null,
      shift: {
        date: String(raw.shift.date || ''),
        type: raw.shift.type === 'noche' ? 'noche' : 'dia',
        start,
        end,
        timezone: String(raw.shift.timezone || 'America/Santiago')
      },
      variables,
      records,
      stats,
      nonEmptyVariables: nonEmpty
    };
  }

  function formatNumber(value, unit) {
    if (value === null || typeof value === 'undefined') return 'Sin datos';
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value) + (unit ? ' ' + unit : '');
  }

  function formatDate(date) {
    return date.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function setStatus(message, type) {
    const el = $('abbImportStatus');
    if (!el) return;
    el.className = 'msg ' + (type || 'muted');
    el.textContent = message;
  }

  function render(data) {
    const summary = $('abbImportSummary');
    const list = $('abbVariableList');
    if (!summary || !list) return;

    const shiftName = data.shift.type === 'noche' ? 'Noche' : 'Día';
    $('abbShiftLabel').textContent = (data.shift.date || 'Fecha no indicada') + ' · Turno ' + shiftName;
    $('abbRangeLabel').textContent = formatDate(data.shift.start) + ' → ' + formatDate(data.shift.end);
    $('abbRecordsLabel').textContent = data.records.length.toLocaleString('es-CL');
    $('abbVariablesLabel').textContent = data.nonEmptyVariables + ' / ' + data.variables.length;

    list.innerHTML = data.stats.map((s) => {
      const value = (v) => escapeHtml(formatNumber(v, s.unit));
      return '<div class="abb-variable-row">' +
        '<div class="abb-variable-name"><strong>' + escapeHtml(s.description) + '</strong><small>' +
        escapeHtml(s.ricode) + (s.unit ? ' · ' + escapeHtml(s.unit) : '') + '</small></div>' +
        '<div class="abb-variable-values"><span><small>Promedio</small><b>' + value(s.avg) + '</b></span>' +
        '<span><small>Mín.</small><b>' + value(s.min) + '</b></span>' +
        '<span><small>Máx.</small><b>' + value(s.max) + '</b></span>' +
        '<span><small>Último</small><b>' + value(s.last) + '</b></span></div>' +
        '<div class="abb-variable-count">' + s.count.toLocaleString('es-CL') + ' valores válidos</div></div>';
    }).join('');

    summary.hidden = false;
    setStatus('Importación local correcta. Los datos permanecen en este navegador y no se han enviado a Supabase.', 'ok');
  }

  async function handleFile(file) {
    if (!file) return;
    current = null;
    if ($('abbImportSummary')) $('abbImportSummary').hidden = true;
    setStatus('Leyendo archivo…', 'muted');
    try {
      if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
        throw new Error('Selecciona un archivo JSON exportado desde Excel ABB.');
      }
      if (file.size > 15 * 1024 * 1024) throw new Error('El archivo supera el límite de 15 MB.');
      const raw = JSON.parse(await file.text());
      current = normalize(raw);
      render(current);
    } catch (error) {
      current = null;
      setStatus(error && error.message ? error.message : 'No se pudo leer el archivo.', 'error');
    }
  }

  function clear() {
    current = null;
    const input = $('abbFile');
    if (input) input.value = '';
    if ($('abbImportSummary')) $('abbImportSummary').hidden = true;
    if ($('abbVariableList')) $('abbVariableList').innerHTML = '';
    setStatus('No hay datos ABB importados. La importación es local y no modifica tus registros ni se sincroniza.', 'muted');
  }

  function init() {
    const input = $('abbFile');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    input.addEventListener('change', (event) => handleFile(event.target.files && event.target.files[0]));
    const clearButton = $('abbClearImport');
    if (clearButton) clearButton.addEventListener('click', clear);
  }

  root.ABBImport = {
    init,
    clear,
    getCurrent: () => current ? JSON.parse(JSON.stringify(current)) : null,
    schema: SCHEMA
  };
})(window);
