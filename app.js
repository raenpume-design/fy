// CONFIGURACIÓN SUPABASE (REEMPLAZA CON TUS CREDENCIALES)
const SUPABASE_URL = "https://fpweccrefuiznuugkngm.supabase.co";
const SUPABASE_KEY = "sb_publishable_3YKhDoPtMQe3VRyOROt9xQ_ZjuqeT7u";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cuentas = [];
let bolsillos = [];
let proyecciones = [];
let todasLasTransacciones = [];

let tipoCuentaSeleccionado = 'efectivo';
let tipoProyeccionSeleccionado = 'ingreso';
let filtroFechaActual = 'todas';
let filtroTipoActual = 'todos';
let filtroCuentaActual = 'todas';

/* FORMATOS */
function getTodayString() { return new Date().toISOString().split('T')[0]; }

function formatDateDisplay(fechaStr) {
    if (!fechaStr) return '';
    const date = new Date(fechaStr);
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
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

/* NAVEGACIÓN AWP EXCLUSIVA */
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

/* CARGA DE DATOS */
async function cargarDatos() {
    if (SUPABASE_URL.includes("TU_SUPABASE")) return;

    const { data: resCuentas } = await db.from('cuentas').select('*');
    const { data: resBolsillos } = await db.from('bolsillos').select('*');
    // Ahora traemos el nombre de la cuenta asociada a la proyección
    const { data: resProy } = await db.from('proyecciones').select('*, cuentas(nombre, tipo)').order('fecha', { ascending: true });
    const { data: resTx } = await db.from('transacciones').select('*, cuentas(nombre), bolsillos(nombre)').order('fecha', { ascending: false });

    cuentas = resCuentas || [];
    bolsillos = resBolsillos || [];
    proyecciones = resProy || [];
    todasLasTransacciones = resTx || [];

    renderizarCuentas();
    renderizarBolsillos();
    renderizarProyecciones();
    generarBotonesFiltroCuentas();
    actualizarSaldosGlobales();
    filtrarMovimientos();
}

function generarBotonesFiltroCuentas() {
    const container = document.getElementById('filter-cuentas-container');
    let html = `<button class="filter-btn active" id="f-cuenta-todas" onclick="setFiltroCuenta('todas')">Todas</button>`;
    cuentas.forEach(c => {
        html += `<button class="filter-btn" id="f-cuenta-${c.id}" onclick="setFiltroCuenta('${c.id}')">${c.nombre}</button>`;
    });
    container.innerHTML = html;
}

/* RENDERIZADO */
function renderizarCuentas() {
    const container = document.getElementById('lista-cuentas');
    if (!cuentas.length) return container.innerHTML = '<p style="font-size: 0.8rem; color: var(--subtext);">Sin cuentas.</p>';
    
    container.innerHTML = cuentas.map(c => {
        const esCredito = c.tipo === 'credito';
        const cupoDisponible = esCredito ? (Number(c.cupo_total) - Number(c.saldo_actual)) : 0;
        return `
            <div class="item-row">
                <div>
                    <p style="font-weight: 700; font-size: 0.9rem;">${c.nombre} <span style="font-size: 0.65rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${c.tipo.toUpperCase()}</span></p>
                    ${esCredito ? `<p style="font-size: 0.75rem; color: var(--subtext);">Deuda Actual: ${formatMoney(c.saldo_actual)} | Libre: <b style="color: var(--success);">${formatMoney(cupoDisponible)}</b></p>` : `<p style="font-size: 0.75rem; color: var(--subtext);">Saldo Actual: ${formatMoney(c.saldo_actual)}</p>`}
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

function renderizarProyecciones() {
    const container = document.getElementById('lista-proyecciones');
    if (!proyecciones.length) return container.innerHTML = '<p style="font-size: 0.8rem; color: var(--subtext);">Sin proyecciones registradas.</p>';

    container.innerHTML = proyecciones.map(p => {
        const esIngreso = p.tipo === 'ingreso';
        const color = esIngreso ? 'var(--success)' : 'var(--danger)';
        const signo = esIngreso ? '+' : '-';
        const nombreCuenta = p.cuentas ? p.cuentas.nombre : 'Sin cuenta';

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
                <div>
                    <p style="font-weight: 600;">${p.concepto}</p>
                    <p style="font-size: 0.7rem; color: var(--subtext);">${formatDateDisplay(p.fecha)} | Proyectado a: ${nombreCuenta}</p>
                </div>
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <span style="font-weight: 700; color: ${color};">${signo}${formatMoney(p.monto)}</span>
                    <button onclick="abrirModalEjecutarProyeccion('${p.id}', '${p.tipo}', ${p.monto}, '${p.concepto}', '${p.fecha}', '${p.cuenta_id}')" style="background: var(--success); color: white; border: none; padding: 0.25rem 0.4rem; border-radius: 0.4rem; font-size: 0.7rem; font-weight: 700; cursor: pointer;">✔</button>
                    <button onclick="anularProyeccion('${p.id}')" style="background: #cbd5e1; color: #334155; border: none; padding: 0.25rem 0.4rem; border-radius: 0.4rem; font-size: 0.7rem; font-weight: 700; cursor: pointer;">✖</button>
                </div>
            </div>
        `;
    }).join('');
}

function generarHTMLMovimiento(t) {
    const esIngreso = t.tipo === 'ingreso';
    const color = esIngreso ? 'var(--success)' : 'var(--danger)';
    const signo = esIngreso ? '+' : '-';
    return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
            <div>
                <p style="font-weight: 600;">${t.concepto}</p>
                <p style="font-size: 0.7rem; color: var(--subtext);">${formatDateDisplay(t.fecha)} • ${t.cuentas?.nombre || 'Cuenta'} ${t.bolsillos ? `➔ ${t.bolsillos.nombre}` : ''}</p>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-weight: 700; color: ${color};">${signo}${formatMoney(t.monto)}</span>
                <button onclick="eliminarTransaccion('${t.id}', '${t.tipo}', ${t.monto}, '${t.cuenta_id}', '${t.bolsillo_id || ''}')" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 0.8rem;">🗑️</button>
            </div>
        </div>
    `;
}

function actualizarSaldosGlobales() {
    // 1. Cálculos de Dinero Real (Actual)
    const totalDisp = cuentas.filter(c => c.tipo !== 'credito').reduce((acc, c) => acc + Number(c.saldo_actual), 0);
    const totalDeudaActual = cuentas.filter(c => c.tipo === 'credito').reduce((acc, c) => acc + Number(c.saldo_actual), 0);
    const totalAhorro = bolsillos.reduce((acc, b) => acc + Number(b.saldo_actual), 0);
    
    // 2. Cálculos de Proyecciones Finales
    let dispProyectado = totalDisp;
    let deudaProyectada = totalDeudaActual;

    proyecciones.forEach(p => {
        const cuenta = cuentas.find(c => c.id === p.cuenta_id);
        if (cuenta) {
            if (cuenta.tipo === 'credito') {
                if (p.tipo === 'egreso') deudaProyectada += Number(p.monto); // Comprar algo con TC sube la deuda
                if (p.tipo === 'ingreso') deudaProyectada -= Number(p.monto); // Pagar la TC baja la deuda
            } else {
                if (p.tipo === 'ingreso') dispProyectado += Number(p.monto); // Ingreso a débito suma saldo
                if (p.tipo === 'egreso') dispProyectado -= Number(p.monto);  // Egreso a débito resta saldo
            }
        }
    });

    // Asegurar que la deuda no se vuelva negativa visualmente
    if (deudaProyectada < 0) deudaProyectada = 0;

    // 3. Pintar en pantalla
    document.getElementById('total-disponible').innerText = formatMoney(totalDisp);
    document.getElementById('total-ahorrado').innerText = formatMoney(totalAhorro);
    document.getElementById('proy-disponible-final').innerText = formatMoney(dispProyectado);
    document.getElementById('proy-credito-final').innerText = formatMoney(deudaProyectada);
}

/* FILTROS EXCLUSIVOS DEL MÓDULO MOVIMIENTOS */
function setFiltroFecha(fecha) {
    filtroFechaActual = fecha;
    ['todas', 'hoy', 'mes'].forEach(f => document.getElementById(`f-fecha-${f}`).classList.remove('active'));
    document.getElementById(`f-fecha-${fecha}`).classList.add('active');
    filtrarMovimientos();
}

function setFiltroTipo(tipo) {
    filtroTipoActual = tipo;
    ['todos', 'ingreso', 'egreso', 'ahorro'].forEach(t => document.getElementById(`f-tipo-${t}`).classList.remove('active'));
    document.getElementById(`f-tipo-${tipo}`).classList.add('active');
    filtrarMovimientos();
}

function setFiltroCuenta(id) {
    filtroCuentaActual = id;
    document.querySelectorAll('#filter-cuentas-container .filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`f-cuenta-${id}`).classList.add('active');
    filtrarMovimientos();
}

function filtrarMovimientos() {
    const busqueda = document.getElementById('filter-search').value.toLowerCase().trim();
    
    const filtrados = todasLasTransacciones.filter(t => {
        const busquedaMatch = t.concepto.toLowerCase().includes(busqueda) || t.monto.toString().includes(busqueda);
        const tipoMatch = filtroTipoActual === 'todos' || t.tipo === filtroTipoActual;
        const cuentaMatch = filtroCuentaActual === 'todas' || t.cuenta_id === filtroCuentaActual;
        
        let fechaMatch = true;
        if (t.fecha) {
            const txDate = new Date(t.fecha);
            const hoy = new Date();
            if (filtroFechaActual === 'hoy') {
                if (txDate.toISOString().split('T')[0] !== hoy.toISOString().split('T')[0]) fechaMatch = false;
            } else if (filtroFechaActual === 'mes') {
                if (txDate.getMonth() !== hoy.getMonth() || txDate.getFullYear() !== hoy.getFullYear()) fechaMatch = false;
            }
        }
        return busquedaMatch && tipoMatch && cuentaMatch && fechaMatch;
    });

    const container = document.getElementById('lista-movimientos-completa');
    if (!filtrados.length) {
        container.innerHTML = '<p style="font-size: 0.8rem; color: var(--subtext);">No hay movimientos que coincidan con los filtros.</p>';
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
    
    // Poblamos selector de cuenta para enlazar la proyección
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
    
    // Seleccionar por defecto la cuenta que se enlazó al proyectar
    if (cuenta_id_original) {
        selectCuenta.value = cuenta_id_original;
    }

    abrirModal('modal-ejecutar-proyeccion');
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
    if (tipo === 'ingreso') {
        await db.from('cuentas').update({ saldo_actual: Number(cuenta.saldo_actual) + monto }).eq('id', cuenta_id);
    } else if (tipo === 'egreso' || tipo === 'ahorro') {
        const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) + monto : Number(cuenta.saldo_actual) - monto;
        await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta_id);
        
        if (tipo === 'ahorro' && bolsillo_id) {
            const bol = bolsillos.find(b => b.id === bolsillo_id);
            await db.from('bolsillos').update({ saldo_actual: Number(bol.saldo_actual) + monto }).eq('id', bolsillo_id);
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
    const nombre = document.getElementById('cuenta-nombre').value;
    const cupo_total = tipoCuentaSeleccionado === 'credito' ? parseInput('cuenta-cupo') : 0;
    await db.from('cuentas').insert([{ nombre, tipo: tipoCuentaSeleccionado, cupo_total, saldo_actual: 0 }]);
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
    const cuenta_id = document.getElementById('proy-cuenta').value; // Nueva conexión

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
    if (tipo === 'ingreso') {
        await db.from('cuentas').update({ saldo_actual: Number(cuenta.saldo_actual) + monto }).eq('id', cuenta_id);
    } else if (tipo === 'egreso') {
        const nuevoSaldo = cuenta.tipo === 'credito' ? Number(cuenta.saldo_actual) + monto : Number(cuenta.saldo_actual) - monto;
        await db.from('cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta_id);
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
