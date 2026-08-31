// CONFIGURACIÓN SUPABASE (REEMPLAZA CON TUS CREDENCIALES)
const SUPABASE_URL = "https://fpweccrefuiznuugkngm.supabase.co";
const SUPABASE_KEY = "sb_publishable_3YKhDoPtMQe3VRyOROt9xQ_ZjuqeT7u";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cuentas = [];
let bolsillos = [];
let proyecciones = [];
let todasLasTransacciones = [];
let prestamos = JSON.parse(localStorage.getItem('mis_finanzas_prestamos') || '[]');
let tarjetasMetadata = JSON.parse(localStorage.getItem('mis_finanzas_tarjetas_meta') || '{}');

let tipoCuentaSeleccionado = 'efectivo';
let tipoProyeccionSeleccionado = 'ingreso';
let filtroFechaActual = 'todas';
let filtroTipoActual = 'todos';
let filtroCuentaActual = 'todas';

// Estado de periodos para Inicio (Dashboard)
let mesSeleccionado = '';
let subperiodoSeleccionado = 'mes'; // 'mes', 'q1', 'q2'

/* FORMATOS Y FECHAS */
function getTodayString() { return new Date().toISOString().split('T')[0]; }

function getLocalDateParts(fechaStr) {
    if (!fechaStr) return null;
    if (typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
        const [y, m, d] = fechaStr.split('-').map(Number);
        return { year: y, month: m - 1, day: d };
    }
    const date = new Date(fechaStr);
    if (isNaN(date.getTime())) return null;
    return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate()
    };
}

function formatDateDisplay(fechaStr) {
    if (!fechaStr) return '';
    const parts = getLocalDateParts(fechaStr);
    if (!parts) return fechaStr;
    const d = String(parts.day).padStart(2, '0');
    const m = String(parts.month + 1).padStart(2, '0');
    return `${d}/${m}/${parts.year}`;
}

function formatMoney(monto) {
    const num = Math.round(Number(monto) || 0);
    return '$' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatInput(input) {
    let val = input.value.replace(/\D/g, "");
    input.value = val ? Number(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

function parseInput(id) {
    const val = document.getElementById(id).value.replace(/\./g, "").replace(/\D/g, "");
    return Number(val) || 0;
}

/* GESTIÓN DE PERIODOS Y QUINCENAS (DASHBOARD) */
const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function inicializarSelectorMeses() {
    const select = document.getElementById('filtro-mes-select');
    if (!select) return;

    const hoy = new Date();
    const curYear = hoy.getFullYear();
    const curMonth = hoy.getMonth();

    if (!mesSeleccionado) {
        mesSeleccionado = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
    }

    let html = '';
    for (let i = -2; i <= 6; i++) {
        const d = new Date(curYear, curMonth + i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const isCurrent = (d.getFullYear() === curYear && d.getMonth() === curMonth);
        const label = `${MESES_NOMBRES[d.getMonth()]} ${d.getFullYear()}${isCurrent ? ' • Actual' : ''}`;
        html += `<option value="${val}" ${val === mesSeleccionado ? 'selected' : ''}>${label}</option>`;
    }
    select.innerHTML = html;
}

function cambiarMesPeriodo(val) {
    mesSeleccionado = val;
    actualizarSaldosGlobales();
    renderizarProyecciones();
}

function setSubperiodo(sub) {
    subperiodoSeleccionado = sub;
    ['mes', 'q1', 'q2'].forEach(p => {
        const btn = document.getElementById(`pill-periodo-${p}`);
        if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`pill-periodo-${sub}`);
    if (activeBtn) activeBtn.classList.add('active');
    actualizarSaldosGlobales();
    renderizarProyecciones();
}

/* NAVEGACIÓN ENTRE VISTAS */
function cambiarVista(vista) {
    const viewDash = document.getElementById('view-dashboard');
    const viewMov = document.getElementById('view-movimientos');
    const btnDash = document.getElementById('nav-dashboard');
    const btnMov = document.getElementById('nav-movimientos');

    if (vista === 'dashboard') {
        viewDash.classList.remove('hidden');
        viewMov.classList.add('hidden');
        btnDash.classList.add('active');
        btnMov.classList.remove('active');
        window.scrollTo(0, 0);
    } else {
        viewDash.classList.add('hidden');
        viewMov.classList.remove('hidden');
        btnDash.classList.remove('active');
        btnMov.classList.add('active');
        window.scrollTo(0, 0);
        filtrarMovimientos(); 
    }
}

/* CARGA DE DATOS PRINCIPAL */
async function cargarDatos() {
    if (SUPABASE_URL.includes("TU_SUPABASE")) return;

    inicializarSelectorMeses();

    const { data: resCuentas } = await db.from('cuentas').select('*');
    const { data: resBolsillos } = await db.from('bolsillos').select('*');
    const { data: resProy } = await db.from('proyecciones').select('*, cuentas(nombre, tipo)').order('fecha', { ascending: true });
    const { data: resTx } = await db.from('transacciones').select('*, cuentas(nombre), bolsillos(nombre)').order('fecha', { ascending: false });

    cuentas = resCuentas || [];
    bolsillos = resBolsillos || [];
    proyecciones = resProy || [];
    todasLasTransacciones = resTx || [];

    renderizarCuentas();
    renderizarPrestamos();
    renderizarBolsillos();
    renderizarProyecciones();
    generarBotonesFiltroCuentas();
    actualizarSaldosGlobales();
    filtrarMovimientos();
}

function generarBotonesFiltroCuentas() {
    const container = document.getElementById('filter-cuentas-container');
    if (!container) return;
    let html = `<button class="filter-btn ${filtroCuentaActual === 'todas' ? 'active' : ''}" id="f-cuenta-todas" onclick="setFiltroCuenta('todas')">Todas</button>`;
    cuentas.forEach(c => {
        const isActive = filtroCuentaActual === c.id ? 'active' : '';
        html += `<button class="filter-btn ${isActive}" id="f-cuenta-${c.id}" onclick="setFiltroCuenta('${c.id}')">${c.nombre}</button>`;
    });
    container.innerHTML = html;
}

/* RENDERIZADO DE CUENTAS Y TARJETAS */
function renderizarCuentas() {
    const container = document.getElementById('lista-cuentas');
    if (!container) return;
    if (!cuentas.length) return container.innerHTML = '<p style="font-size: 0.8rem; color: var(--subtext);">Sin cuentas registradas.</p>';
    
    container.innerHTML = cuentas.map(c => {
        const esCredito = c.tipo === 'credito';
        
        if (esCredito) {
            const meta = tarjetasMetadata[c.id] || {};
            const diaPago = meta.dia_pago || '17 de cada mes';
            const periodo = meta.periodo_corte || 'Entre 28 y 28 de cada mes';

            // Calcular deuda proyectada para esta tarjeta sumando todas las proyecciones
            let egresosProyCard = 0;
            let ingresosProyCard = 0;
            proyecciones.forEach(p => {
                if (p.cuenta_id === c.id) {
                    if (p.tipo === 'egreso') egresosProyCard += Number(p.monto);
                    if (p.tipo === 'ingreso') ingresosProyCard += Number(p.monto);
                }
            });

            const deudaActual = Number(c.saldo_actual) || 0;
            const cupoTotal = Number(c.cupo_total) || 0;
            const deudaProyectada = Math.max(0, deudaActual + egresosProyCard - ingresosProyCard);
            const cupoLibreActual = Math.max(0, cupoTotal - deudaActual);
            const cupoLibreProy = Math.max(0, cupoTotal - deudaProyectada);
            const tieneProyeccion = (egresosProyCard > 0 || ingresosProyCard > 0);

            return `
                <div class="item-row" style="flex-direction: column; align-items: stretch; gap: 0.4rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <p style="font-weight: 700; font-size: 0.9rem;">
                            💳 ${c.nombre} 
                            <span style="font-size: 0.65rem; background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: 700;">CRÉDITO</span>
                        </p>
                        <button onclick="abrirModalEditarCuenta('${c.id}')" style="background: none; border: none; color: var(--accent); font-size: 0.8rem; cursor: pointer; font-weight: 700;" title="Editar tarjeta">⚙️ Editar</button>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--subtext); background: #ffffff; padding: 0.4rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--border);">
                        <p>📅 <b>Límite de pago:</b> ${diaPago} &bull; <b>Periodo:</b> ${periodo}</p>
                        <p style="margin-top: 2px;">Cupo Total: <b>${formatMoney(cupoTotal)}</b></p>
                    </div>
                    <div style="font-size: 0.75rem; display: flex; justify-content: space-between; border-top: 1px dashed var(--border); padding-top: 0.3rem;">
                        <span>Deuda Actual: <b style="color: var(--danger);">${formatMoney(deudaActual)}</b> (Libre: <b style="color: var(--success);">${formatMoney(cupoLibreActual)}</b>)</span>
                    </div>
                    ${tieneProyeccion ? `
                        <div style="font-size: 0.75rem; display: flex; justify-content: space-between; background: #fff1f2; padding: 0.3rem 0.5rem; border-radius: 0.4rem; color: #9f1239;">
                            <span>🔮 Deuda Futura: <b>${formatMoney(deudaProyectada)}</b></span>
                            <span>Libre Futuro: <b style="color: var(--success);">${formatMoney(cupoLibreProy)}</b></span>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        return `
            <div class="item-row">
                <div>
                    <p style="font-weight: 700; font-size: 0.9rem;">
                        ${c.nombre} 
                        <span style="font-size: 0.65rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${c.tipo.toUpperCase()}</span>
                    </p>
                    <p style="font-size: 0.75rem; color: var(--subtext); margin-top: 2px;">Saldo Actual: <b>${formatMoney(c.saldo_actual)}</b></p>
                </div>
                <div>
                    <button onclick="abrirModalEditarCuenta('${c.id}')" style="background: none; border: none; color: var(--subtext); font-size: 0.8rem; cursor: pointer;" title="Editar cuenta">✏️</button>
                </div>
            </div>
        `;
    }).join('');
}

/* RENDERIZADO DE PRÉSTAMOS */
function renderizarPrestamos() {
    const container = document.getElementById('lista-prestamos');
    const resumenEl = document.getElementById('resumen-prestamos-total');
    if (!container) return;

    const totalPorCobrar = prestamos.filter(p => !p.cobrado).reduce((acc, p) => acc + Number(p.monto), 0);
    if (resumenEl) {
        resumenEl.innerHTML = `Total por cobrar: <b style="color: var(--warning, #d97706);">${formatMoney(totalPorCobrar)}</b>`;
    }

    if (!prestamos.length) {
        return container.innerHTML = '<p style="font-size: 0.8rem; color: var(--subtext);">Sin préstamos registrados.</p>';
    }

    container.innerHTML = prestamos.map(p => {
        const cuentaObj = cuentas.find(c => c.id === p.cuenta_id);
        const cuentaNombre = cuentaObj ? cuentaObj.nombre : 'Cuenta';
        const badge = p.cobrado 
            ? '<span class="badge-prestamo-cobrado">✔ Cobrado</span>' 
            : '<span class="badge-prestamo-pendiente">⏳ Pendiente</span>';

        return `
            <div class="item-row" style="flex-direction: column; align-items: stretch; gap: 0.35rem; background: ${p.cobrado ? '#f0fdf4' : '#fffbeb'}; border: 1px solid ${p.cobrado ? '#bbf7d0' : '#fde68a'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <p style="font-weight: 700; font-size: 0.88rem; color: #1e293b;">
                            👤 ${p.a_quien} <span style="font-weight: 400; font-size: 0.8rem; color: var(--subtext);">- ${p.concepto}</span>
                        </p>
                    </div>
                    <span style="font-weight: 800; font-size: 0.9rem; color: #b45309;">${formatMoney(p.monto)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--subtext);">
                    <span>📅 Prestado: ${formatDateDisplay(p.fecha)} ${p.fecha_pago ? `&bull; ⏳ A pagar: <b>${formatDateDisplay(p.fecha_pago)}</b>` : ''} &bull; Origen: ${cuentaNombre}</span>
                    <div style="display: flex; align-items: center; gap: 0.3rem;">
                        ${badge}
                        ${!p.cobrado ? `
                            <button onclick="abrirModalCobrarPrestamo('${p.id}')" style="background: var(--success); color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.4rem; font-size: 0.7rem; font-weight: 700; cursor: pointer;">💰 Cobrar</button>
                        ` : ''}
                        <button onclick="eliminarPrestamo('${p.id}')" style="background: none; border: none; color: #94a3b8; font-size: 0.8rem; cursor: pointer;" title="Eliminar registro">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarBolsillos() {
    const container = document.getElementById('lista-bolsillos');
    if (!bolsillos.length) return container.innerHTML = '<p style="font-size: 0.8rem; color: var(--subtext);">Sin bolsillos.</p>';

    container.innerHTML = bolsillos.map(b => {
        const tieneMeta = Number(b.meta) > 0;
        const textoMeta = tieneMeta ? ` de ${formatMoney(b.meta)}` : ' (Sin meta)';
        return `
            <div class="item-row" style="background: #e0e7ff; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <p style="font-weight: 700; font-size: 0.9rem; color: #3730a3;">🎯 ${b.nombre}</p>
                    <p style="font-size: 0.75rem; color: #4338ca;">Ahorrado: <b>${formatMoney(b.saldo_actual)}</b>${textoMeta}</p>
                </div>
                <div style="display: flex; gap: 0.25rem;">
                    <button onclick="abrirModalEditarBolsillo('${b.id}', '${b.nombre}', ${b.saldo_actual})" style="background: #6366f1; color: white; border: none; padding: 0.3rem 0.4rem; border-radius: 0.4rem; font-size: 0.7rem; cursor: pointer;">✏️</button>
                    <button onclick="abrirModalSacarBolsillo('${b.id}', '${b.nombre}', ${b.saldo_actual})" style="background: #4338ca; color: white; border: none; padding: 0.3rem 0.4rem; border-radius: 0.4rem; font-size: 0.7rem; font-weight: 700; cursor: pointer;">💸</button>
                    <button onclick="eliminarBolsillo('${b.id}')" style="background: var(--danger); color: white; border: none; padding: 0.3rem 0.4rem; border-radius: 0.4rem; font-size: 0.7rem; cursor: pointer;">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

/* RENDERIZADO DE PROYECCIONES FILTRADAS POR EL PERIODO SELECCIONADO */
function renderizarProyecciones() {
    const container = document.getElementById('lista-proyecciones');
    const tituloEl = document.getElementById('titulo-proyecciones-pendientes');
    if (!container) return;

    const [selYear, selMonth] = mesSeleccionado.split('-').map(Number);
    const diasEnMes = new Date(selYear, selMonth, 0).getDate();
    const inicioPeriodoStr = subperiodoSeleccionado === 'q2' ? `${mesSeleccionado}-16` : `${mesSeleccionado}-01`;
    const finPeriodoStr = subperiodoSeleccionado === 'q1' ? `${mesSeleccionado}-15` : `${mesSeleccionado}-${String(diasEnMes).padStart(2, '0')}`;

    const subLabel = subperiodoSeleccionado === 'mes' ? 'Mes Completo' : (subperiodoSeleccionado === 'q1' ? '1ra Quincena' : '2da Quincena');
    const mesNombre = MESES_NOMBRES[selMonth - 1];
    if (tituloEl) {
        tituloEl.innerText = `Proyecciones: ${mesNombre} (${subLabel})`;
    }

    const proyeccionesPeriodo = proyecciones.filter(p => {
        if (!p.fecha) return false;
        const fechaStr = p.fecha.includes('T') ? p.fecha.split('T')[0] : p.fecha;
        return fechaStr >= inicioPeriodoStr && fechaStr <= finPeriodoStr;
    });

    if (!proyeccionesPeriodo.length) {
        return container.innerHTML = '<p style="font-size: 0.8rem; color: var(--subtext); text-align: center; padding: 1rem 0;">Sin proyecciones registradas para este periodo.</p>';
    }

    container.innerHTML = proyeccionesPeriodo.map(p => {
        const esIngreso = p.tipo === 'ingreso';
        const color = esIngreso ? 'var(--success)' : 'var(--danger)';
        const signo = esIngreso ? '+' : '-';
        const nombreCuenta = p.cuentas ? p.cuentas.nombre : (cuentas.find(c => c.id === p.cuenta_id)?.nombre || 'Sin cuenta');

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
                <div>
                    <p style="font-weight: 600;">${p.concepto}</p>
                    <p style="font-size: 0.7rem; color: var(--subtext);">${formatDateDisplay(p.fecha)} | Proyectado a: ${nombreCuenta}</p>
                </div>
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <span style="font-weight: 700; color: ${color};">${signo}${formatMoney(p.monto)}</span>
                    <button onclick="abrirModalEjecutarProyeccion('${p.id}', '${p.tipo}', ${p.monto}, '${p.concepto}', '${p.fecha}', '${p.cuenta_id}')" style="background: var(--success); color: white; border: none; padding: 0.25rem 0.4rem; border-radius: 0.4rem; font-size: 0.7rem; font-weight: 700; cursor: pointer;" title="Confirmar movimiento real">✔</button>
                    <button onclick="anularProyeccion('${p.id}')" style="background: #cbd5e1; color: #334155; border: none; padding: 0.25rem 0.4rem; border-radius: 0.4rem; font-size: 0.7rem; font-weight: 700; cursor: pointer;" title="Anular proyección">✖</button>
                </div>
            </div>
        `;
    }).join('');
}

function generarHTMLMovimiento(t) {
    const esIngreso = t.tipo === 'ingreso';
    const esAhorro = t.tipo === 'ahorro';
    const color = esIngreso ? 'var(--success)' : (esAhorro ? 'var(--accent)' : 'var(--danger)');
    const signo = esIngreso ? '+' : '-';
    
    const cuentaNombre = t.cuentas?.nombre || cuentas.find(c => c.id === t.cuenta_id)?.nombre || 'Cuenta';
    const bolsilloNombre = t.bolsillos?.nombre || bolsillos.find(b => b.id === t.bolsillo_id)?.nombre || '';
    const detalle = bolsilloNombre ? `${cuentaNombre} ➔ 🎯 ${bolsilloNombre}` : cuentaNombre;

    return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
            <div>
                <p style="font-weight: 600;">${t.concepto || 'Sin concepto'}</p>
                <p style="font-size: 0.7rem; color: var(--subtext); margin-top: 2px;">${formatDateDisplay(t.fecha)} • ${detalle}</p>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-weight: 700; color: ${color};">${signo}${formatMoney(t.monto)}</span>
                <button onclick="eliminarTransaccion('${t.id}', '${t.tipo}', ${t.monto}, '${t.cuenta_id}', '${t.bolsillo_id || ''}')" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 0.85rem; padding: 4px;" title="Eliminar movimiento">🗑️</button>
            </div>
        </div>
    `;
}

/* CÁLCULO DE SALDOS GLOBALES Y PROYECCIONES SEGÚN EL PERIODO (MES / QUINCENA) */
function actualizarSaldosGlobales() {
    if (!mesSeleccionado) inicializarSelectorMeses();

    const [selYear, selMonth] = mesSeleccionado.split('-').map(Number);
    const hoyStr = getTodayString();
    const diasEnMes = new Date(selYear, selMonth, 0).getDate();

    const inicioPeriodoStr = subperiodoSeleccionado === 'q2' ? `${mesSeleccionado}-16` : `${mesSeleccionado}-01`;
    const finPeriodoStr = subperiodoSeleccionado === 'q1' ? `${mesSeleccionado}-15` : `${mesSeleccionado}-${String(diasEnMes).padStart(2, '0')}`;

    // 1. Dinero Real Actual (al día de hoy)
    const totalDispReal = cuentas.filter(c => c.tipo !== 'credito').reduce((acc, c) => acc + Number(c.saldo_actual), 0);
    const totalDeudaReal = cuentas.filter(c => c.tipo === 'credito').reduce((acc, c) => acc + Number(c.saldo_actual), 0);
    const totalAhorro = bolsillos.reduce((acc, b) => acc + Number(b.saldo_actual), 0);

    // 2. Simulación hacia adelante hasta el inicio del periodo
    let dispInicioPeriodo = totalDispReal;
    let deudaInicioPeriodo = totalDeudaReal;

    if (inicioPeriodoStr > hoyStr) {
        proyecciones.forEach(p => {
            const fechaStr = p.fecha ? (p.fecha.includes('T') ? p.fecha.split('T')[0] : p.fecha) : '';
            if (fechaStr >= hoyStr && fechaStr < inicioPeriodoStr) {
                const cuenta = cuentas.find(c => c.id === p.cuenta_id);
                if (cuenta) {
                    if (cuenta.tipo === 'credito') {
                        if (p.tipo === 'egreso') deudaInicioPeriodo += Number(p.monto);
                        if (p.tipo === 'ingreso') deudaInicioPeriodo -= Number(p.monto);
                    } else {
                        if (p.tipo === 'ingreso') dispInicioPeriodo += Number(p.monto);
                        if (p.tipo === 'egreso') dispInicioPeriodo -= Number(p.monto);
                    }
                }
            }
        });
    }

    if (deudaInicioPeriodo < 0) deudaInicioPeriodo = 0;

    // 3. Proyecciones que caen DENTRO del periodo seleccionado
    let dispFinal = dispInicioPeriodo;
    let deudaFinal = deudaInicioPeriodo;

    proyecciones.forEach(p => {
        const fechaStr = p.fecha ? (p.fecha.includes('T') ? p.fecha.split('T')[0] : p.fecha) : '';
        const entraEnPeriodo = (fechaStr >= inicioPeriodoStr && fechaStr <= finPeriodoStr);

        if (entraEnPeriodo) {
            const cuenta = cuentas.find(c => c.id === p.cuenta_id);
            if (cuenta) {
                if (cuenta.tipo === 'credito') {
                    if (p.tipo === 'egreso') deudaFinal += Number(p.monto);
                    if (p.tipo === 'ingreso') deudaFinal -= Number(p.monto);
                } else {
                    if (p.tipo === 'ingreso') dispFinal += Number(p.monto);
                    if (p.tipo === 'egreso') dispFinal -= Number(p.monto);
                }
            }
        }
    });

    if (deudaFinal < 0) deudaFinal = 0;

    // 4. Actualizar textos e indicadores en la vista
    const subLabel = subperiodoSeleccionado === 'mes' ? 'Mes Completo' : (subperiodoSeleccionado === 'q1' ? '1ra Quincena' : '2da Quincena');
    const mesNombre = MESES_NOMBRES[selMonth - 1];

    const labelReal = document.getElementById('label-disponible-real');
    if (labelReal) {
        const esMesActual = (mesSeleccionado === hoyStr.substring(0, 7));
        labelReal.innerText = esMesActual ? 'Disponible Real (Hoy)' : 'Disponible al Inicio';
    }

    const tituloFuturo = document.getElementById('titulo-futuro-proyeccion');
    if (tituloFuturo) {
        tituloFuturo.innerText = `🔮 Futuro: ${mesNombre} ${selYear} (${subLabel})`;
    }

    document.getElementById('total-disponible').innerText = formatMoney(dispInicioPeriodo);
    document.getElementById('total-ahorrado').innerText = formatMoney(totalAhorro);
    document.getElementById('proy-disponible-final').innerText = formatMoney(dispFinal);
    document.getElementById('proy-credito-final').innerText = formatMoney(deudaFinal);
}

/* FILTROS EXCLUSIVOS DEL MÓDULO MOVIMIENTOS */
function setFiltroFecha(fecha) {
    filtroFechaActual = fecha;
    ['todas', 'hoy', 'mes'].forEach(f => {
        const el = document.getElementById(`f-fecha-${f}`);
        if (el) el.classList.remove('active');
    });
    const targetEl = document.getElementById(`f-fecha-${fecha}`);
    if (targetEl) targetEl.classList.add('active');
    filtrarMovimientos();
}

function setFiltroTipo(tipo) {
    filtroTipoActual = tipo;
    ['todos', 'ingreso', 'egreso', 'ahorro'].forEach(t => {
        const el = document.getElementById(`f-tipo-${t}`);
        if (el) el.classList.remove('active');
    });
    const targetEl = document.getElementById(`f-tipo-${tipo}`);
    if (targetEl) targetEl.classList.add('active');
    filtrarMovimientos();
}

function setFiltroCuenta(id) {
    filtroCuentaActual = id;
    document.querySelectorAll('#filter-cuentas-container .filter-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`f-cuenta-${id}`);
    if (targetBtn) targetBtn.classList.add('active');
    filtrarMovimientos();
}

function filtrarMovimientos() {
    const inputSearch = document.getElementById('filter-search');
    const busqueda = (inputSearch?.value || '').toLowerCase().trim();
    
    const hoy = new Date();
    const hoyYear = hoy.getFullYear();
    const hoyMonth = hoy.getMonth();
    const hoyDay = hoy.getDate();

    const filtrados = todasLasTransacciones.filter(t => {
        const concepto = (t.concepto || '').toLowerCase();
        const montoStr = (t.monto ?? '').toString();
        const busquedaMatch = !busqueda || concepto.includes(busqueda) || montoStr.includes(busqueda);
        const tipoMatch = filtroTipoActual === 'todos' || t.tipo === filtroTipoActual;
        const cuentaMatch = filtroCuentaActual === 'todas' || t.cuenta_id === filtroCuentaActual;
        
        let fechaMatch = true;
        if (filtroFechaActual !== 'todas') {
            const txParts = getLocalDateParts(t.fecha);
            if (!txParts) {
                fechaMatch = false;
            } else if (filtroFechaActual === 'hoy') {
                fechaMatch = (txParts.year === hoyYear && txParts.month === hoyMonth && txParts.day === hoyDay);
            } else if (filtroFechaActual === 'mes') {
                fechaMatch = (txParts.year === hoyYear && txParts.month === hoyMonth);
            }
        }
        return busquedaMatch && tipoMatch && cuentaMatch && fechaMatch;
    });

    const countEl = document.getElementById('movimientos-count');
    if (countEl) {
        countEl.innerText = `${filtrados.length} movimiento${filtrados.length === 1 ? '' : 's'}`;
    }

    const container = document.getElementById('lista-movimientos-completa');
    if (!container) return;

    if (!filtrados.length) {
        container.innerHTML = '<p style="font-size: 0.8rem; color: var(--subtext); text-align: center; padding: 1.5rem 0;">No hay movimientos que coincidan con los filtros.</p>';
    } else {
        container.innerHTML = filtrados.map(t => generarHTMLMovimiento(t)).join('');
    }
}

/* MODALES */
function abrirModal(id) { document.getElementById(id).classList.remove('hidden'); }
function cerrarModal(id) { document.getElementById(id).classList.add('hidden'); }

function abrirModalTransaccion(tipo) {
    document.getElementById('form-transaccion').reset();
    document.getElementById('tx-tipo').value = tipo;
    document.getElementById('tx-fecha').value = getTodayString();
    document.getElementById('modal-tx-titulo').innerText = tipo === 'ingreso' ? 'Registrar Ingreso' : (tipo === 'egreso' ? 'Registrar Egreso' : 'Mover a Bolsillo');
    
    const selectCuenta = document.getElementById('tx-cuenta');
    selectCuenta.innerHTML = cuentas.map(c => `<option value="${c.id}">${c.nombre} (${c.tipo})</option>`).join('');

    const divBolsillo = document.getElementById('div-bolsillo-select');
    if (tipo === 'ahorro') {
        divBolsillo.classList.remove('hidden');
        document.getElementById('tx-bolsillo').innerHTML = bolsillos.map(b => `<option value="${b.id}">${b.nombre}</option>`).join('');
    } else {
        divBolsillo.classList.add('hidden');
    }

    abrirModal('modal-transaccion');
}

function abrirModalCuenta() {
    document.getElementById('form-cuenta').reset();
    seleccionarTipoCuenta('efectivo');
    abrirModal('modal-cuenta');
}

function abrirModalEditarCuenta(id) {
    const c = cuentas.find(acc => acc.id === id);
    if (!c) return;

    document.getElementById('form-editar-cuenta').reset();
    document.getElementById('edit-cuenta-id').value = c.id;
    document.getElementById('edit-cuenta-tipo').value = c.tipo;
    document.getElementById('edit-cuenta-nombre').value = c.nombre;

    const divCredito = document.getElementById('edit-div-credito');
    if (c.tipo === 'credito') {
        divCredito.classList.remove('hidden');
        document.getElementById('edit-cuenta-cupo').value = c.cupo_total ? Number(c.cupo_total).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";
        const meta = tarjetasMetadata[c.id] || {};
        document.getElementById('edit-cuenta-dia-pago').value = meta.dia_pago || '17 de cada mes';
        document.getElementById('edit-cuenta-periodo-corte').value = meta.periodo_corte || 'Entre 28 y 28 de cada mes';
    } else {
        divCredito.classList.add('hidden');
    }

    abrirModal('modal-editar-cuenta');
}

async function confirmarEditarCuenta(e) {
    e.preventDefault();
    const id = document.getElementById('edit-cuenta-id').value;
    const tipo = document.getElementById('edit-cuenta-tipo').value;
    const nombre = document.getElementById('edit-cuenta-nombre').value;

    if (tipo === 'credito') {
        const cupo = parseInput('edit-cuenta-cupo');
        const dia_pago = document.getElementById('edit-cuenta-dia-pago').value;
        const periodo_corte = document.getElementById('edit-cuenta-periodo-corte').value;

        await db.from('cuentas').update({ nombre, cupo_total: cupo }).eq('id', id);
        tarjetasMetadata[id] = { dia_pago, periodo_corte };
        localStorage.setItem('mis_finanzas_tarjetas_meta', JSON.stringify(tarjetasMetadata));
    } else {
        await db.from('cuentas').update({ nombre }).eq('id', id);
    }

    cerrarModal('modal-editar-cuenta');
    cargarDatos();
}

function abrirModalBolsillo() {
    document.getElementById('form-bolsillo').reset();
    abrirModal('modal-bolsillo');
}

function abrirModalEditarBolsillo(id, nombre, saldoActual) {
    document.getElementById('form-editar-bolsillo').reset();
    document.getElementById('edit-bolsillo-id').value = id;
    document.getElementById('edit-bolsillo-nombre').innerText = `Modificar saldo de "${nombre}"`;
    document.getElementById('edit-bolsillo-saldo').value = saldoActual ? saldoActual.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";
    abrirModal('modal-editar-bolsillo');
}

function abrirModalProyeccion() {
    document.getElementById('form-proyeccion').reset();
    document.getElementById('proy-fecha').value = getTodayString();
    
    const selectCuenta = document.getElementById('proy-cuenta');
    selectCuenta.innerHTML = cuentas.map(c => `<option value="${c.id}">${c.nombre} (${c.tipo})</option>`).join('');
    
    seleccionarTipoProyeccion('ingreso');
    abrirModal('modal-proyeccion');
}

function abrirModalSacarBolsillo(id, nombre, saldoActual) {
    document.getElementById('form-sacar-bolsillo').reset();
    document.getElementById('sacar-bolsillo-id').value = id;
    document.getElementById('sacar-bolsillo-max').value = saldoActual;
    document.getElementById('sacar-fecha').value = getTodayString();
    document.getElementById('sacar-resumen').innerText = `Saldo disponible en "${nombre}": ${formatMoney(saldoActual)}`;

    const selectCuenta = document.getElementById('sacar-cuenta-destino');
    selectCuenta.innerHTML = cuentas.map(c => `<option value="${c.id}">${c.nombre} (${c.tipo})</option>`).join('');

    abrirModal('modal-sacar-bolsillo');
}

function abrirModalEjecutarProyeccion(id, tipo, monto, concepto, fechaProy, cuenta_id_original) {
    document.getElementById('form-ejecutar-proyeccion').reset();
    document.getElementById('proy-exec-id').value = id;
    document.getElementById('proy-exec-tipo').value = tipo;
    document.getElementById('proy-exec-monto').value = monto;
    document.getElementById('proy-exec-concepto').value = concepto;
    document.getElementById('proy-exec-fecha').value = fechaProy ? fechaProy.split('T')[0] : getTodayString();

    document.getElementById('proy-exec-resumen').innerText = `Vas a confirmar "${concepto}" (${formatMoney(monto)}).`;

    const selectCuenta = document.getElementById('proy-exec-cuenta');
    selectCuenta.innerHTML = cuentas.map(c => `<option value="${c.id}">${c.nombre} (${c.tipo})</option>`).join('');
    
    if (cuenta_id_original) {
        selectCuenta.value = cuenta_id_original;
    }

    abrirModal('modal-ejecutar-proyeccion');
}

/* MODALES Y LÓGICA DE PRÉSTAMOS */
function abrirModalPrestamo() {
    document.getElementById('form-prestamo').reset();
    const select = document.getElementById('prestamo-cuenta');
    select.innerHTML = cuentas.map(c => `<option value="${c.id}">${c.nombre} (${c.tipo})</option>`).join('');
    abrirModal('modal-prestamo');
}

async function guardarPrestamo(e) {
    e.preventDefault();
    const a_quien = document.getElementById('prestamo-a-quien').value.trim();
    const concepto = document.getElementById('prestamo-concepto').value.trim();
    const monto = parseInput('prestamo-monto');
    const cuenta_id = document.getElementById('prestamo-cuenta').value;
    const fecha_pago = document.getElementById('prestamo-fecha-pago').value || null;
    const fecha = getTodayString();

    if (monto <= 0) {
        alert("Por favor ingresa un monto válido.");
        return;
    }

    // 1. Insertar transacción automática como egreso
    const conceptoTx = `🤝 Préstamo a ${a_quien}: ${concepto}`;
    await db.from('transacciones').insert([{ tipo: 'egreso', monto, concepto: conceptoTx, cuenta_id, fecha }]);

    // 2. Descontar de la cuenta
    const cuenta = cuentas.find(c => c.id === cuenta_id);
    if (cuenta) {
        const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) + monto : Number(cuenta.saldo_actual) - monto;
        await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta_id);
    }

    // 3. Guardar en el registro de préstamos
    const nuevoPrestamo = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'p_' + Date.now(),
        a_quien,
        concepto,
        monto,
        cuenta_id,
        fecha,
        fecha_pago,
        cobrado: false,
        fecha_cobrado: null
    };

    prestamos.unshift(nuevoPrestamo);
    localStorage.setItem('mis_finanzas_prestamos', JSON.stringify(prestamos));

    cerrarModal('modal-prestamo');
    cargarDatos();
}

function abrirModalCobrarPrestamo(id) {
    const p = prestamos.find(item => item.id === id);
    if (!p) return;

    document.getElementById('form-cobrar-prestamo').reset();
    document.getElementById('cobro-prestamo-id').value = p.id;
    document.getElementById('cobro-prestamo-monto').value = p.monto;
    document.getElementById('cobro-prestamo-a-quien').value = p.a_quien;
    document.getElementById('cobro-fecha').value = getTodayString();
    document.getElementById('cobro-prestamo-resumen').innerText = `Vas a recibir ${formatMoney(p.monto)} devueltos por "${p.a_quien}".`;

    const select = document.getElementById('cobro-cuenta-destino');
    select.innerHTML = cuentas.map(c => `<option value="${c.id}">${c.nombre} (${c.tipo})</option>`).join('');

    abrirModal('modal-cobrar-prestamo');
}

async function confirmarCobroPrestamo(e) {
    e.preventDefault();
    const id = document.getElementById('cobro-prestamo-id').value;
    const monto = Number(document.getElementById('cobro-prestamo-monto').value);
    const a_quien = document.getElementById('cobro-prestamo-a-quien').value;
    const cuenta_id = document.getElementById('cobro-cuenta-destino').value;
    const fecha = document.getElementById('cobro-fecha').value;

    // 1. Insertar transacción automática como ingreso
    const conceptoTx = `💰 Cobro de préstamo (${a_quien})`;
    await db.from('transacciones').insert([{ tipo: 'ingreso', monto, concepto: conceptoTx, cuenta_id, fecha }]);

    // 2. Sumar saldo a la cuenta
    const cuenta = cuentas.find(c => c.id === cuenta_id);
    if (cuenta) {
        const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) - monto : Number(cuenta.saldo_actual) + monto;
        await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta_id);
    }

    // 3. Actualizar estado del préstamo
    const index = prestamos.findIndex(item => item.id === id);
    if (index !== -1) {
        prestamos[index].cobrado = true;
        prestamos[index].fecha_cobrado = fecha;
        localStorage.setItem('mis_finanzas_prestamos', JSON.stringify(prestamos));
    }

    cerrarModal('modal-cobrar-prestamo');
    cargarDatos();
}

function eliminarPrestamo(id) {
    if (!confirm("¿Deseas eliminar este registro de préstamo del historial?")) return;
    prestamos = prestamos.filter(p => p.id !== id);
    localStorage.setItem('mis_finanzas_prestamos', JSON.stringify(prestamos));
    renderizarPrestamos();
}

function seleccionarTipoCuenta(tipo) {
    tipoCuentaSeleccionado = tipo;
    ['efectivo', 'transferencia', 'debito', 'credito'].forEach(t => {
        const btn = document.getElementById(`opt-${t}`);
        if (t === tipo) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
    const divCupo = document.getElementById('div-cupo');
    if (tipo === 'credito') divCupo.classList.remove('hidden');
    else divCupo.classList.add('hidden');
}

function seleccionarTipoProyeccion(tipo) {
    tipoProyeccionSeleccionado = tipo;
    ['ingreso', 'egreso'].forEach(t => {
        const btn = document.getElementById(`opt-proy-${t}`);
        if (t === tipo) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
}

/* ACCIONES DE BASE DE DATOS */
async function guardarTransaccion(e) {
    e.preventDefault();
    const tipo = document.getElementById('tx-tipo').value;
    const fecha = document.getElementById('tx-fecha').value;
    const monto = parseInput('tx-monto');
    const concepto = document.getElementById('tx-concepto').value;
    const cuenta_id = document.getElementById('tx-cuenta').value;
    const bolsillo_id = tipo === 'ahorro' ? document.getElementById('tx-bolsillo').value : null;

    await db.from('transacciones').insert([{ tipo, monto, concepto, cuenta_id, bolsillo_id, fecha }]);

    const cuenta = cuentas.find(c => c.id === cuenta_id);
    if (cuenta) {
        if (tipo === 'ingreso') {
            const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) - monto : Number(cuenta.saldo_actual) + monto;
            await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta_id);
        } else if (tipo === 'egreso' || tipo === 'ahorro') {
            const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) + monto : Number(cuenta.saldo_actual) - monto;
            await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta_id);
            
            if (tipo === 'ahorro' && bolsillo_id) {
                const bol = bolsillos.find(b => b.id === bolsillo_id);
                if (bol) {
                    await db.from('bolsillos').update({ saldo_actual: Number(bol.saldo_actual) + monto }).eq('id', bolsillo_id);
                }
            }
        }
    }
    cerrarModal('modal-transaccion');
    cargarDatos();
}

async function eliminarTransaccion(id, tipo, monto, cuentaId, bolsilloId) {
    if (!confirm("¿Deseas eliminar este movimiento? Se reajustará el saldo automáticamente.")) return;
    monto = Number(monto);
    const cuenta = cuentas.find(c => c.id === cuentaId);

    if (cuenta) {
        if (tipo === 'ingreso') {
            const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) + monto : Number(cuenta.saldo_actual) - monto;
            await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuentaId);
        } else if (tipo === 'egreso' || tipo === 'ahorro') {
            const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) - monto : Number(cuenta.saldo_actual) + monto;
            await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuentaId);

            if (tipo === 'ahorro' && bolsilloId) {
                const bol = bolsillos.find(b => b.id === bolsilloId);
                if (bol) {
                    const nuevoSaldoBol = Math.max(0, Number(bol.saldo_actual) - monto);
                    await db.from('bolsillos').update({ saldo_actual: nuevoSaldoBol }).eq('id', bolsilloId);
                }
            }
        }
    }
    await db.from('transacciones').delete().eq('id', id);
    cargarDatos();
}

async function guardarCuenta(e) {
    e.preventDefault();
    const nombre = document.getElementById('cuenta-nombre').value.trim();
    const cupo_total = tipoCuentaSeleccionado === 'credito' ? parseInput('cuenta-cupo') : 0;
    
    const { data, error } = await db.from('cuentas').insert([{ nombre, tipo: tipoCuentaSeleccionado, cupo_total, saldo_actual: 0 }]).select();
    
    if (tipoCuentaSeleccionado === 'credito' && data && data.length > 0) {
        const dia_pago = document.getElementById('cuenta-dia-pago').value.trim() || '17 de cada mes';
        const periodo_corte = document.getElementById('cuenta-periodo-corte').value.trim() || 'Entre 28 y 28 de cada mes';
        tarjetasMetadata[data[0].id] = { dia_pago, periodo_corte };
        localStorage.setItem('mis_finanzas_tarjetas_meta', JSON.stringify(tarjetasMetadata));
    }

    cerrarModal('modal-cuenta');
    cargarDatos();
}

async function guardarBolsillo(e) {
    e.preventDefault();
    const nombre = document.getElementById('bolsillo-nombre').value;
    const meta = parseInput('bolsillo-meta');
    const saldo_actual = parseInput('bolsillo-saldo');
    await db.from('bolsillos').insert([{ nombre, meta, saldo_actual }]);
    cerrarModal('modal-bolsillo');
    cargarDatos();
}

async function confirmarEditarBolsillo(e) {
    e.preventDefault();
    const id = document.getElementById('edit-bolsillo-id').value;
    const nuevoSaldo = parseInput('edit-bolsillo-saldo');
    await db.from('bolsillos').update({ saldo_actual: nuevoSaldo }).eq('id', id);
    cerrarModal('modal-editar-bolsillo');
    cargarDatos();
}

async function eliminarBolsillo(id) {
    if (confirm("¿Seguro que deseas eliminar este bolsillo?")) {
        await db.from('bolsillos').delete().eq('id', id);
        cargarDatos();
    }
}

async function confirmarSacarBolsillo(e) {
    e.preventDefault();
    const id = document.getElementById('sacar-bolsillo-id').value;
    const saldoMax = Number(document.getElementById('sacar-bolsillo-max').value);
    const monto = parseInput('sacar-monto');
    const cuenta_id = document.getElementById('sacar-cuenta-destino').value;
    const fecha = document.getElementById('sacar-fecha').value;

    if (monto > saldoMax) {
        alert("El monto supera el saldo disponible en este bolsillo.");
        return;
    }
    const bol = bolsillos.find(b => b.id === id);
    const cuenta = cuentas.find(c => c.id === cuenta_id);

    await db.from('bolsillos').update({ saldo_actual: Number(bol.saldo_actual) - monto }).eq('id', id);
    await db.from('cuentas').update({ saldo_actual: Number(cuenta.saldo_actual) + monto }).eq('id', cuenta_id);

    await db.from('transacciones').insert([{
        tipo: 'ingreso',
        monto: monto,
        concepto: `Retiro de bolsillo (${bol.nombre})`,
        cuenta_id: cuenta_id,
        fecha: fecha
    }]);

    cerrarModal('modal-sacar-bolsillo');
    cargarDatos();
}

async function guardarProyeccion(e) {
    e.preventDefault();
    const concepto = document.getElementById('proy-concepto').value;
    const monto = parseInput('proy-monto');
    const fecha = document.getElementById('proy-fecha').value;
    const cuenta_id = document.getElementById('proy-cuenta').value;

    await db.from('proyecciones').insert([{ tipo: tipoProyeccionSeleccionado, concepto, monto, fecha, cuenta_id }]);
    cerrarModal('modal-proyeccion');
    cargarDatos();
}

async function confirmarEjecutarProyeccion(e) {
    e.preventDefault();
    const id = document.getElementById('proy-exec-id').value;
    const tipo = document.getElementById('proy-exec-tipo').value;
    const monto = Number(document.getElementById('proy-exec-monto').value);
    const concepto = document.getElementById('proy-exec-concepto').value;
    const cuenta_id = document.getElementById('proy-exec-cuenta').value;
    const fecha = document.getElementById('proy-exec-fecha').value;

    await db.from('transacciones').insert([{ tipo, monto, concepto, cuenta_id, fecha }]);

    const cuenta = cuentas.find(c => c.id === cuenta_id);
    if (cuenta) {
        if (tipo === 'ingreso') {
            const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) - monto : Number(cuenta.saldo_actual) + monto;
            await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta_id);
        } else if (tipo === 'egreso') {
            const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) + monto : Number(cuenta.saldo_actual) - monto;
            await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta_id);
        }
    }

    await db.from('proyecciones').delete().eq('id', id);
    cerrarModal('modal-ejecutar-proyeccion');
    cargarDatos();
}

async function anularProyeccion(id) {
    await db.from('proyecciones').delete().eq('id', id);
    cargarDatos();
}

window.onload = cargarDatos;
