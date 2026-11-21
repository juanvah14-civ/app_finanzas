/* Mis Finanzas: lógica de la app. */
(() => {
  const APP_VERSION = '0.2.0';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const CATEGORIAS_BASE = [
    ['egreso', '🍽️', 'Comida'],
    ['egreso', '🛒', 'Supermercado'],
    ['egreso', '🚗', 'Transporte'],
    ['egreso', '🏠', 'Casa / alquiler'],
    ['egreso', '💡', 'Servicios'],
    ['egreso', '📱', 'Teléfono e internet'],
    ['egreso', '🩺', 'Salud'],
    ['egreso', '🎉', 'Ocio'],
    ['egreso', '👕', 'Ropa'],
    ['egreso', '📚', 'Educación'],
    ['egreso', '🎁', 'Regalos'],
    ['egreso', '📦', 'Otros gastos'],
    ['ingreso', '💼', 'Salario'],
    ['ingreso', '💻', 'Trabajos extra'],
    ['ingreso', '🤝', 'Ventas'],
    ['ingreso', '💰', 'Otros ingresos'],
  ];

  const state = {
    ajustes: null,
    categorias: [],
    movimientos: [],
    mes: mesActual(),
    vista: 'inicio',
    editMovId: null,
    editCatId: null,
  };

  /* ---------- utilidades ---------- */
  function hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function mesActual() { return hoy().slice(0, 7); }
  function mesMover(mes, delta) {
    let [y, m] = mes.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function nombreMes(mes, corto = false) {
    const [y, m] = mes.split('-').map(Number);
    return corto ? cap(MESES[m - 1].slice(0, 3)) : `${cap(MESES[m - 1])} ${y}`;
  }
  function fechaLarga(f) {
    const [y, m, d] = f.split('-').map(Number);
    return `${d} de ${MESES[m - 1]} ${y}`;
  }
  function diasDelMes(mes) {
    const [y, m] = mes.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  // Acepta "12500", "12 500", "12.500", "12,500", "12500,50", "1.250.000,75"…
  function parseMonto(txt) {
    if (txt == null) return NaN;
    let s = String(txt).trim().replace(/[₡$\s]/g, '');
    if (!s) return NaN;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) {
      const dec = lc > ld ? ',' : '.';
      const mil = dec === ',' ? '.' : ',';
      s = s.split(mil).join('').replace(dec, '.');
    } else if (lc > -1 || ld > -1) {
      const sep = lc > -1 ? ',' : '.';
      const parts = s.split(sep);
      const esMiles = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
      s = esMiles ? parts.join('') : parts.join('.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  function moneda() { return state.ajustes?.moneda || 'CRC'; }
  function simbolo() { return moneda() === 'USD' ? '$' : '₡'; }
  function fmt(n) {
    const dec = moneda() === 'USD' || n % 1 !== 0 ? 2 : 0;
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: moneda(), minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  }
  function fmtShort(n) {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    const nf = v => v.toLocaleString('es-CR', { maximumFractionDigits: 1 });
    if (a >= 1e6) return `${s}${simbolo()}${nf(a / 1e6)} M`;
    if (a >= 1e3) return `${s}${simbolo()}${nf(a / 1e3)} mil`;
    return `${s}${simbolo()}${nf(a)}`;
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  let toastTimer;
  function toast(msg, tipo = '') {
    const t = $('#toast');
    t.innerHTML = msg;
    t.className = `toast show ${tipo}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), tipo ? 5000 : 2500);
  }

  /* ---------- datos ---------- */
  async function cargar() {
    state.ajustes = await DB.get('ajustes', 'general');
    state.categorias = await DB.all('categorias');
    state.movimientos = await DB.all('movimientos');
    if (!state.categorias.length && !(await DB.all('categorias', { incluirBorrados: true })).length) {
      let orden = 0;
      for (const [tipo, icono, nombre] of CATEGORIAS_BASE) {
        await DB.put('categorias', { tipo, icono, nombre, limite: null, orden: orden++ });
      }
      state.categorias = await DB.all('categorias');
    }
    state.categorias.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  }

  const cat = id => state.categorias.find(c => c.id === id) || { nombre: 'Sin categoría', icono: '❔', tipo: 'egreso' };
  const umbral = () => Number(state.ajustes?.umbral || 0.8);

  function saldoActual() {
    return state.movimientos.reduce((s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), Number(state.ajustes?.saldoInicial || 0));
  }
  function movsMes(mes) { return state.movimientos.filter(m => m.fecha.startsWith(mes)); }
  function totales(mes) {
    let ingresos = 0, egresos = 0;
    for (const m of movsMes(mes)) m.tipo === 'ingreso' ? ingresos += m.monto : egresos += m.monto;
    return { ingresos, egresos };
  }
  function gastoPorCategoria(mes) {
    const map = new Map();
    for (const m of movsMes(mes)) if (m.tipo === 'egreso') map.set(m.categoriaId, (map.get(m.categoriaId) || 0) + m.monto);
    return map;
  }
  function estadoLimites(mes) {
    const g = gastoPorCategoria(mes);
    return state.categorias
      .filter(c => c.tipo === 'egreso' && c.limite > 0)
      .map(c => {
        const gastado = g.get(c.id) || 0;
        const pct = gastado / c.limite;
        const estado = pct > 1 ? 'excedido' : pct >= 1 ? 'tope' : pct >= umbral() ? 'cerca' : 'ok';
        return { c, gastado, pct, estado };
      });
  }

  /* ---------- render ---------- */
  function render() {
    $$('[data-month-picker]').forEach(mp => {
      mp.innerHTML = `<button class="icon-btn" data-mes="-1" aria-label="Mes anterior">‹</button><span>${nombreMes(state.mes)}</span><button class="icon-btn" data-mes="1" aria-label="Mes siguiente" ${state.mes >= mesActual() ? 'disabled' : ''}>›</button>`;
    });
    if (state.vista === 'inicio') renderInicio();
    if (state.vista === 'movimientos') renderMovimientos();
    if (state.vista === 'graficos') renderGraficos();
    if (state.vista === 'ajustes') renderAjustes();
  }

  function movItem(m) {
    const c = cat(m.categoriaId);
    const signo = m.tipo === 'ingreso' ? '+' : '−';
    return `<li class="mov" data-mov="${m.id}">
      <span class="mov-ico">${esc(c.icono)}</span>
      <span class="mov-main"><span class="mov-cat">${esc(c.nombre)}</span><span class="mov-sub">${esc(fechaLarga(m.fecha))}${m.nota ? ' · ' + esc(m.nota) : ''}</span></span>
      <span class="mov-monto ${m.tipo}">${signo}${fmt(m.monto)}</span>
    </li>`;
  }
  const ordenar = arr => [...arr].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));

  function limiteBar(l) {
    const pct = Math.min(l.pct, 1) * 100;
    const etiqueta = { excedido: '⚠ Excedido', tope: '⚠ Llegaste al límite', cerca: '⚠ Cerca del límite', ok: '' }[l.estado];
    const resto = l.c.limite - l.gastado;
    return `<div class="limite ${l.estado}">
      <div class="limite-top"><span>${esc(l.c.icono)} ${esc(l.c.nombre)}</span><span class="limite-num">${fmt(l.gastado)} <span class="muted">de ${fmt(l.c.limite)}</span></span></div>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(l.pct * 100)}" aria-label="${esc(l.c.nombre)}"><span style="width:${pct}%"></span></div>
      <div class="limite-foot"><span class="estado">${etiqueta}</span><span class="muted">${resto >= 0 ? 'Quedan ' + fmt(resto) : 'Te pasaste por ' + fmt(-resto)} · ${Math.round(l.pct * 100)} %</span></div>
    </div>`;
  }

  function renderInicio() {
    const saldo = saldoActual();
    $('#saldo-actual').textContent = fmt(saldo);
    $('#saldo-actual').classList.toggle('neg', saldo < 0);
    const t = totales(state.mes);
    $('#mes-ingresos').textContent = fmt(t.ingresos);
    $('#mes-egresos').textContent = fmt(t.egresos);

    const lims = estadoLimites(state.mes);
    const alertas = lims.filter(l => l.estado !== 'ok').sort((a, b) => b.pct - a.pct);
    $('#alertas').innerHTML = alertas.map(l => `<div class="alerta ${l.estado}" role="alert"><span>⚠</span><span><strong>${esc(l.c.icono)} ${esc(l.c.nombre)}:</strong> ${
      l.estado === 'excedido' ? `te pasaste del límite por ${fmt(l.gastado - l.c.limite)}.` :
      l.estado === 'tope' ? 'llegaste exactamente al límite del mes.' :
      `llevas el ${Math.round(l.pct * 100)} % del límite. Te quedan ${fmt(l.c.limite - l.gastado)}.`}</span></div>`).join('');

    $('#limites-lista').innerHTML = lims.length
      ? lims.sort((a, b) => b.pct - a.pct).map(limiteBar).join('')
      : `<p class="muted small">Aún no tienes límites. Ponlos en <button class="link" data-view-link="ajustes">Ajustes</button> para cada categoría.</p>`;

    const ult = ordenar(state.movimientos).slice(0, 8);
    $('#ultimos').innerHTML = ult.length ? ult.map(movItem).join('') : `<li class="muted small empty">Toca ＋ para registrar tu primer movimiento.</li>`;
  }

  function renderMovimientos() {
    const sel = $('#filtro-cat');
    const val = sel.value;
    sel.innerHTML = '<option value="">Todas las categorías</option>' + state.categorias.map(c => `<option value="${c.id}">${esc(c.icono)} ${esc(c.nombre)}</option>`).join('');
    sel.value = val;
    const tipo = $('#filtro-tipo').value, catId = sel.value, q = $('#filtro-texto').value.trim().toLowerCase();
    const lista = ordenar(movsMes(state.mes)).filter(m =>
      (!tipo || m.tipo === tipo) && (!catId || m.categoriaId === catId) && (!q || (m.nota || '').toLowerCase().includes(q) || cat(m.categoriaId).nombre.toLowerCase().includes(q)));
    let ing = 0, egr = 0;
    lista.forEach(m => m.tipo === 'ingreso' ? ing += m.monto : egr += m.monto);
    $('#mov-summary').innerHTML = `<span>${lista.length} movimiento${lista.length === 1 ? '' : 's'}</span><span class="ingreso">+${fmt(ing)}</span><span class="egreso">−${fmt(egr)}</span>`;
    $('#mov-lista').innerHTML = lista.length ? lista.map(movItem).join('') : `<li class="muted small empty">No hay movimientos con esos filtros en ${nombreMes(state.mes).toLowerCase()}.</li>`;
  }

  function renderGraficos() {
    const g = gastoPorCategoria(state.mes);
    const rows = state.categorias.filter(c => c.tipo === 'egreso' && (g.get(c.id) || c.limite))
      .map(c => ({ label: c.nombre, icon: c.icono, value: g.get(c.id) || 0, limit: c.limite || null, threshold: umbral() }))
      .concat(g.has(undefined) ? [{ label: 'Sin categoría', icon: '❔', value: g.get(undefined), limit: null }] : [])
      .sort((a, b) => b.value - a.value);
    Charts.categoryBars($('#chart-categorias'), rows, fmt, fmtShort);
    const total = rows.reduce((s, r) => s + r.value, 0);
    $('#tabla-categorias').innerHTML = `<table class="tabla"><thead><tr><th>Categoría</th><th>Gastado</th><th>Límite</th><th>%</th></tr></thead><tbody>${
      rows.map(r => `<tr><td>${esc(r.icon)} ${esc(r.label)}</td><td>${fmt(r.value)}</td><td>${r.limit ? fmt(r.limit) : '—'}</td><td>${r.limit ? Math.round(r.value / r.limit * 100) + ' %' : '—'}</td></tr>`).join('')
    }</tbody><tfoot><tr><td>Total</td><td>${fmt(total)}</td><td></td><td></td></tr></tfoot></table>`;

    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const mes = mesMover(state.mes, -i);
      meses.push({ ...totales(mes), label: nombreMes(mes, true), labelLargo: nombreMes(mes) });
    }
    $('#legend-meses').innerHTML = '<span><span class="sw sw-1"></span>Ingresos</span><span><span class="sw sw-2"></span>Egresos</span>';
    Charts.monthBars($('#chart-meses'), meses, fmt, fmtShort);

    // saldo diario del mes
    const ini = Number(state.ajustes?.saldoInicial || 0);
    const antes = state.movimientos.filter(m => m.fecha < `${state.mes}-01`).reduce((s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), ini);
    const ultimoDia = state.mes === mesActual() ? Number(hoy().slice(8)) : diasDelMes(state.mes);
    const porDia = new Map();
    for (const m of movsMes(state.mes)) {
      const d = Number(m.fecha.slice(8));
      porDia.set(d, (porDia.get(d) || 0) + (m.tipo === 'ingreso' ? m.monto : -m.monto));
    }
    const pts = [];
    let s = antes;
    for (let d = 1; d <= ultimoDia; d++) {
      s += porDia.get(d) || 0;
      pts.push({ y: s, label: String(d), labelLargo: fechaLarga(`${state.mes}-${String(d).padStart(2, '0')}`) });
    }
    Charts.balanceLine($('#chart-saldo'), pts, fmt, fmtShort);
  }

  function renderAjustes() {
    const a = state.ajustes || {};
    if (document.activeElement !== $('#saldo-inicial')) $('#saldo-inicial').value = a.saldoInicial != null ? String(a.saldoInicial) : '';
    $('#moneda').value = a.moneda || 'CRC';
    $('#umbral').value = String(a.umbral || 0.8);
    const grupo = tipo => state.categorias.filter(c => c.tipo === tipo).map(c => `<button class="cat-row" data-cat="${c.id}">
      <span class="mov-ico">${esc(c.icono)}</span><span class="grow">${esc(c.nombre)}</span>
      <span class="muted small">${c.tipo === 'egreso' ? (c.limite ? 'Límite ' + fmt(c.limite) : 'Sin límite') : ''}</span><span class="chev">›</span></button>`).join('');
    const nueva = tipo => `<button class="cat-row cat-add" data-action="nueva-cat" data-tipo="${tipo}"><span class="mov-ico">＋</span><span class="grow">Nueva categoría de ${tipo}</span></button>`;
    $('#cat-admin').innerHTML = `<h3>Egresos</h3>${grupo('egreso')}${nueva('egreso')}<h3>Ingresos</h3>${grupo('ingreso')}${nueva('ingreso')}`;
    const ult = localStorage.getItem('ultimoRespaldo');
    $('#ultimo-respaldo').textContent = ult ? `Último respaldo: ${fechaLarga(ult)}` : 'Todavía no has hecho ningún respaldo.';
    $('#version-info').textContent = `Versión ${APP_VERSION} · ${state.movimientos.length} movimientos guardados en este dispositivo`;
  }

  /* ---------- navegación ---------- */
  function irA(vista) {
    state.vista = vista;
    $$('.view').forEach(v => v.hidden = v.id !== `view-${vista}`);
    $$('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === vista));
    Charts.hideTip();
    render();
    window.scrollTo(0, 0);
    if (location.hash !== '#' + vista) history.replaceState(null, '', '#' + vista);
  }

  /* ---------- formulario de movimiento ---------- */
  function abrirMov(id = null) {
    state.editMovId = id;
    const m = id ? state.movimientos.find(x => x.id === id) : null;
    const f = $('#form-mov');
    f.reset();
    $('#dlg-mov-title').textContent = m ? 'Editar movimiento' : 'Nuevo movimiento';
    $('#btn-borrar-mov').hidden = !m;
    $('#mov-sym').textContent = simbolo();
    const tipo = m?.tipo || 'egreso';
    f.querySelector(`input[name=tipo][value=${tipo}]`).checked = true;
    $('#mov-monto').value = m ? String(m.monto) : '';
    $('#mov-fecha').value = m?.fecha || hoy();
    $('#mov-nota').value = m?.nota || '';
    pintarChips(tipo, m?.categoriaId);
    $('#mov-aviso').hidden = true;
    $('#dlg-mov').showModal();
    if (!m) setTimeout(() => $('#mov-monto').focus(), 50);
  }

  function pintarChips(tipo, sel) {
    const cats = state.categorias.filter(c => c.tipo === tipo);
    if (!sel || !cats.some(c => c.id === sel)) sel = cats[0]?.id;
    $('#mov-cats').innerHTML = cats.map(c => `<label class="chip"><input type="radio" name="cat" value="${c.id}" ${c.id === sel ? 'checked' : ''}><span>${esc(c.icono)} ${esc(c.nombre)}</span></label>`).join('')
      + `<button type="button" class="chip chip-add" data-action="nueva-cat" data-tipo="${tipo}"><span>＋ Nueva</span></button>`;
    avisoPrevio();
  }

  // Muestra en el formulario cómo quedaría el límite con este gasto.
  function avisoPrevio() {
    const f = $('#form-mov');
    const tipo = f.tipo.value, catId = f.cat?.value, monto = parseMonto($('#mov-monto').value) || 0;
    const c = state.categorias.find(x => x.id === catId);
    const p = $('#mov-aviso');
    if (tipo !== 'egreso' || !c || !c.limite) { p.hidden = true; return; }
    const mes = ($('#mov-fecha').value || hoy()).slice(0, 7);
    let gastado = gastoPorCategoria(mes).get(c.id) || 0;
    const prev = state.editMovId && state.movimientos.find(x => x.id === state.editMovId);
    if (prev && prev.tipo === 'egreso' && prev.categoriaId === c.id && prev.fecha.startsWith(mes)) gastado -= prev.monto;
    const total = gastado + monto;
    const pct = total / c.limite;
    p.hidden = false;
    p.className = 'warn-inline ' + (pct > 1 ? 'excedido' : pct >= umbral() ? 'cerca' : 'ok');
    p.textContent = pct > 1 ? `⚠ Con este gasto te pasas del límite de ${c.nombre} por ${fmt(total - c.limite)}.`
      : pct >= umbral() ? `⚠ Con este gasto llegas al ${Math.round(pct * 100)} % del límite de ${c.nombre}. Te quedarían ${fmt(c.limite - total)}.`
      : `${c.nombre}: llevarías ${fmt(total)} de ${fmt(c.limite)} este mes.`;
  }

  async function guardarMov(e) {
    e.preventDefault();
    const f = $('#form-mov');
    const monto = parseMonto($('#mov-monto').value);
    if (!(monto > 0)) { toast('Escribe un monto válido.'); $('#mov-monto').focus(); return; }
    if (!f.cat?.value) { toast('Elige una categoría.'); return; }
    const prev = state.editMovId ? state.movimientos.find(x => x.id === state.editMovId) : null;
    const antes = estadoLimites(($('#mov-fecha').value).slice(0, 7));
    const row = await DB.put('movimientos', {
      ...(prev || {}),
      id: prev?.id,
      tipo: f.tipo.value,
      monto,
      categoriaId: f.cat.value,
      fecha: $('#mov-fecha').value,
      nota: $('#mov-nota').value.trim(),
      creado: prev?.creado || Date.now(),
    });
    state.movimientos = state.movimientos.filter(x => x.id !== row.id).concat(row);
    $('#dlg-mov').close();
    // ¿cambió el estado de algún límite?
    const despues = estadoLimites(row.fecha.slice(0, 7));
    const orden = { ok: 0, cerca: 1, tope: 2, excedido: 3 };
    const empeoro = despues.find(l => l.c.id === row.categoriaId && orden[l.estado] > orden[(antes.find(a => a.c.id === l.c.id) || {}).estado || 'ok']);
    if (empeoro) {
      const l = empeoro;
      toast(l.estado === 'excedido' ? `⚠ Te pasaste del límite de ${esc(l.c.nombre)} por ${fmt(l.gastado - l.c.limite)}.`
        : l.estado === 'tope' ? `⚠ Llegaste al límite de ${esc(l.c.nombre)}.`
        : `⚠ Llevas el ${Math.round(l.pct * 100)} % del límite de ${esc(l.c.nombre)}.`, 'alerta-toast');
    } else {
      toast(prev ? 'Movimiento actualizado' : 'Movimiento guardado ✓');
    }
    render();
  }

  async function borrarMov() {
    if (!state.editMovId) return;
    if (!confirm('¿Borrar este movimiento?')) return;
    await DB.remove('movimientos', state.editMovId);
    state.movimientos = state.movimientos.filter(x => x.id !== state.editMovId);
    $('#dlg-mov').close();
    toast('Movimiento borrado');
    render();
  }

  /* ---------- categorías ---------- */
  function abrirCat(id = null, tipoNuevo = 'egreso') {
    state.editCatId = id;
    state.catDesdeMov = !id && $('#dlg-mov').open;
    const c = id ? state.categorias.find(x => x.id === id) : null;
    const f = $('#form-cat');
    f.reset();
    $('#dlg-cat-title').textContent = c ? 'Editar categoría' : 'Nueva categoría';
    $('#btn-borrar-cat').hidden = !c;
    f.querySelector(`input[name=cat-tipo][value=${c?.tipo || tipoNuevo}]`).checked = true;
    $('#cat-icono').value = c?.icono || '';
    $('#cat-nombre').value = c?.nombre || '';
    $('#cat-limite').value = c?.limite ? String(c.limite) : '';
    $('#cat-limite-wrap').hidden = (c?.tipo || tipoNuevo) !== 'egreso';
    $('#dlg-cat').showModal();
    if (!c) setTimeout(() => $('#cat-nombre').focus(), 50);
  }

  async function guardarCat(e) {
    e.preventDefault();
    const f = $('#form-cat');
    const tipo = f['cat-tipo'].value;
    const limTxt = $('#cat-limite').value.trim();
    const limite = tipo === 'egreso' && limTxt ? parseMonto(limTxt) : null;
    if (limTxt && tipo === 'egreso' && !(limite > 0)) { toast('El límite no es un monto válido.'); return; }
    const prev = state.editCatId ? state.categorias.find(x => x.id === state.editCatId) : null;
    const nombre = $('#cat-nombre').value.trim();
    if (!nombre) { toast('Escribe un nombre.'); return; }
    if (state.categorias.some(c => c.tipo === tipo && c.id !== prev?.id && c.nombre.toLowerCase() === nombre.toLowerCase())) {
      toast(`Ya existe la categoría "${esc(nombre)}".`); return;
    }
    const row = await DB.put('categorias', {
      ...(prev || {}),
      id: prev?.id,
      tipo,
      icono: $('#cat-icono').value.trim() || '🏷️',
      nombre: $('#cat-nombre').value.trim(),
      limite,
      orden: prev?.orden ?? state.categorias.length,
    });
    state.categorias = state.categorias.filter(x => x.id !== row.id).concat(row).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    $('#dlg-cat').close();
    toast(prev ? 'Categoría guardada' : `Categoría "${esc(row.nombre)}" creada ✓`);
    // Si se creó desde el formulario de movimiento, queda seleccionada ahí.
    if (state.catDesdeMov && $('#dlg-mov').open) {
      $('#form-mov').querySelector(`input[name=tipo][value=${row.tipo}]`).checked = true;
      pintarChips(row.tipo, row.id);
    }
    state.catDesdeMov = false;
    render();
  }

  async function borrarCat() {
    const id = state.editCatId;
    const usos = state.movimientos.filter(m => m.categoriaId === id).length;
    const msg = usos ? `Esta categoría tiene ${usos} movimiento(s). Se conservarán, pero aparecerán como "Sin categoría". ¿Borrarla?` : '¿Borrar esta categoría?';
    if (!confirm(msg)) return;
    await DB.remove('categorias', id);
    state.categorias = state.categorias.filter(c => c.id !== id);
    $('#dlg-cat').close();
    toast('Categoría borrada');
    render();
  }

  /* ---------- ajustes ---------- */
  async function guardarAjustes(e) {
    e.preventDefault();
    const saldo = parseMonto($('#saldo-inicial').value);
    if (!Number.isFinite(saldo)) { toast('Escribe un saldo válido.'); return; }
    state.ajustes = await DB.put('ajustes', { ...(state.ajustes || {}), id: 'general', saldoInicial: saldo, moneda: $('#moneda').value, umbral: Number($('#umbral').value) });
    toast('Ajustes guardados');
    render();
  }

  async function exportar() {
    const datos = { app: 'mis-finanzas', version: 1, exportado: new Date().toISOString() };
    for (const s of DB.STORES) datos[s] = await DB.all(s, { incluirBorrados: true });
    const nombre = `finanzas-respaldo-${hoy()}.json`;
    const json = JSON.stringify(datos);
    localStorage.setItem('ultimoRespaldo', hoy());
    // En el iPhone abre el menú Compartir (AirDrop a la compu, Archivos, WhatsApp…).
    try {
      const file = new File([json], nombre, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Respaldo de Mis Finanzas' });
        render();
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    descargar(nombre, json, 'application/json');
    render();
  }

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Une un respaldo con lo que hay: por cada registro gana el más reciente.
  async function importar(file) {
    try {
      const datos = JSON.parse(await file.text());
      if (datos.app !== 'mis-finanzas') throw new Error('formato');
      let nuevos = 0;
      // Dispositivo sin movimientos (recién instalado): el respaldo reemplaza todo.
      const reemplazar = state.movimientos.length === 0;
      if (reemplazar) for (const s of DB.STORES) await DB.clear(s);
      for (const s of DB.STORES) {
        const locales = new Map((await DB.all(s, { incluirBorrados: true })).map(r => [r.id, r]));
        const ganar = (datos[s] || []).filter(r => r && r.id && (!locales.has(r.id) || (r.actualizado || 0) > (locales.get(r.id).actualizado || 0)));
        nuevos += ganar.length;
        await DB.putRaw(s, ganar);
      }
      await cargar();
      toast(reemplazar ? 'Respaldo cargado ✓' : `Respaldo unido: ${nuevos} registro(s) nuevos o actualizados.`);
      if ($('#dlg-bienvenida').open && state.ajustes) $('#dlg-bienvenida').close();
      render();
    } catch (err) {
      toast('No se pudo leer ese archivo de respaldo.');
    }
  }

  function exportarCSV() {
    const filas = [['Fecha', 'Tipo', 'Categoría', 'Monto', 'Nota']];
    for (const m of ordenar(state.movimientos)) filas.push([m.fecha, m.tipo, cat(m.categoriaId).nombre, m.monto, m.nota || '']);
    const csv = filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    descargar(`movimientos-${hoy()}.csv`, '﻿' + csv, 'text/csv');
  }

  /* ---------- eventos ---------- */
  function eventos() {
    document.addEventListener('click', e => {
      const t = e.target.closest('button, li[data-mov], .cat-row');
      if (!t) return;
      if (t.dataset.view) irA(t.dataset.view);
      else if (t.dataset.viewLink) irA(t.dataset.viewLink);
      else if (t.dataset.action === 'nuevo') abrirMov();
      else if (t.dataset.action === 'nueva-cat') abrirCat(null, t.dataset.tipo || 'egreso');
      else if (t.dataset.mes) { state.mes = mesMover(state.mes, Number(t.dataset.mes)); render(); }
      else if (t.dataset.mov) abrirMov(t.dataset.mov);
      else if (t.dataset.cat) abrirCat(t.dataset.cat);
      else if (t.hasAttribute('data-close')) t.closest('dialog').close();
    });
    $('#form-mov').addEventListener('submit', guardarMov);
    $('#form-mov').addEventListener('change', e => { if (e.target.name === 'tipo') pintarChips(e.target.value); else avisoPrevio(); });
    $('#mov-monto').addEventListener('input', avisoPrevio);
    $('#btn-borrar-mov').addEventListener('click', borrarMov);
    $('#form-cat').addEventListener('submit', guardarCat);
    $('#form-cat').addEventListener('change', e => { if (e.target.name === 'cat-tipo') $('#cat-limite-wrap').hidden = e.target.value !== 'egreso'; });
    $('#btn-borrar-cat').addEventListener('click', borrarCat);
    $('#btn-nueva-cat').addEventListener('click', () => abrirCat(null, 'egreso'));
    $('#form-saldo').addEventListener('submit', guardarAjustes);
    $('#btn-exportar').addEventListener('click', exportar);
    $('#btn-csv').addEventListener('click', exportarCSV);
    $('#input-importar').addEventListener('change', e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; });
    ['#filtro-tipo', '#filtro-cat', '#filtro-texto'].forEach(s => $(s).addEventListener('input', renderMovimientos));
    $('#toggle-tabla').addEventListener('click', e => {
      const tb = $('#tabla-categorias'), ch = $('#chart-categorias');
      tb.hidden = !tb.hidden; ch.hidden = !tb.hidden;
      e.target.textContent = tb.hidden ? 'Ver tabla' : 'Ver gráfico';
    });
    $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => state.vista === 'graficos' && renderGraficos(), 150); });
    $('#form-bienvenida').addEventListener('submit', async e => {
      e.preventDefault();
      const saldo = parseMonto($('#bienv-saldo').value);
      if (!Number.isFinite(saldo)) { toast('Escribe un monto válido.'); return; }
      state.ajustes = await DB.put('ajustes', { id: 'general', saldoInicial: saldo, moneda: 'CRC', umbral: 0.8, fechaInicio: hoy() });
      $('#dlg-bienvenida').close();
      render();
    });
    $('#dlg-bienvenida').addEventListener('cancel', e => e.preventDefault());
    $('#bienv-importar').addEventListener('change', e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; });
  }

  /* ---------- inicio ---------- */
  async function init() {
    eventos();
    await cargar();
    const v = location.hash.slice(1);
    irA(['inicio', 'movimientos', 'graficos', 'ajustes'].includes(v) ? v : 'inicio');
    if (!state.ajustes) $('#dlg-bienvenida').showModal();
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  init();
})();
