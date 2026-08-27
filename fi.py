import streamlit as st
import sqlite3
import pandas as pd
import datetime
import calendar
import plotly.express as px

# --- CONFIGURACIÓN DE PÁGINA ---
st.set_page_config(page_title="Gestor de Finanzas", page_icon="💰", layout="wide")

# --- CONEXIÓN A BASE DE DATOS (SQLite) ---
def init_db():
    conn = sqlite3.connect('mis_finanzas.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS movimientos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fecha DATE,
                    mes TEXT,
                    quincena TEXT,
                    tipo TEXT,
                    estado TEXT,
                    metodo_pago TEXT,
                    cuenta_tarjeta TEXT,
                    categoria TEXT,
                    descripcion TEXT,
                    monto REAL
                )''')
    c.execute('''CREATE TABLE IF NOT EXISTS cuentas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT,
                    tipo TEXT
                )''')
    c.execute('''CREATE TABLE IF NOT EXISTS ahorros (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fecha DATE,
                    meta TEXT,
                    monto REAL
                )''')
    conn.commit()
    return conn

conn = init_db()

# --- FUNCIONES AUXILIARES ---
def calcular_quincena(fecha_str):
    fecha = datetime.datetime.strptime(str(fecha_str), '%Y-%m-%d')
    dia = fecha.day
    mes = fecha.month
    año = fecha.year
    ultimo_dia = calendar.monthrange(año, mes)[1]
    
    if dia <= 15:
        return f"Q1 (1 - 15)"
    else:
        return f"Q2 (16 - {ultimo_dia})"

def obtener_mes_nombre(fecha_str):
    meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
             "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    fecha = datetime.datetime.strptime(str(fecha_str), '%Y-%m-%d')
    return meses[fecha.month - 1]

# --- SIDEBAR (MENÚ DE NAVEGACIÓN) ---
st.sidebar.title("💰 Gestor de Finanzas")
menu = st.sidebar.radio("Navegación", [
    "📊 Dashboard & Proyección", 
    "📝 Registrar Movimiento", 
    "✏️ Editar / Eliminar", 
    "🐷 Ahorros", 
    "💳 Tarjetas y Cuentas"
])

# --- VISTA 1: DASHBOARD Y PROYECCIÓN QUINCENAL ---
if menu == "📊 Dashboard & Proyección":
    st.title("📊 Resumen y Proyección (Por Quincenas)")
    
    df = pd.read_sql_query("SELECT * FROM movimientos", conn)
    
    if df.empty:
        st.info("Aún no hay movimientos registrados. Ve a 'Registrar Movimiento' para comenzar.")
    else:
        meses_disponibles = df['mes'].unique().tolist()
        mes_seleccionado = st.selectbox("Selecciona el Mes a visualizar:", meses_disponibles)
        df_mes = df[df['mes'] == mes_seleccionado]
        resumen = df_mes.groupby(['quincena', 'tipo', 'estado'])['monto'].sum().reset_index()
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("🗓️ Quincena 1 (Días 1 al 15)")
            df_q1 = df_mes[df_mes['quincena'].str.contains('Q1')]
            ingresos_q1 = df_q1[df_q1['tipo'] == 'Ingreso']['monto'].sum()
            egresos_q1 = df_q1[df_q1['tipo'] == 'Egreso']['monto'].sum()
            utilidad_q1 = ingresos_q1 - egresos_q1
            st.metric("Total Ingresos Q1", f"${ingresos_q1:,.2f}")
            st.metric("Total Egresos Q1", f"${egresos_q1:,.2f}")
            st.metric("Utilidad / Flujo Q1", f"${utilidad_q1:,.2f}", delta=utilidad_q1)
            st.dataframe(df_q1[['fecha', 'tipo', 'estado', 'descripcion', 'monto']], use_container_width=True)

        with col2:
            st.subheader("🗓️ Quincena 2 (Día 16 al fin de mes)")
            df_q2 = df_mes[df_mes['quincena'].str.contains('Q2')]
            ingresos_q2 = df_q2[df_q2['tipo'] == 'Ingreso']['monto'].sum()
            egresos_q2 = df_q2[df_q2['tipo'] == 'Egreso']['monto'].sum()
            utilidad_q2 = ingresos_q2 - egresos_q2
            st.metric("Total Ingresos Q2", f"${ingresos_q2:,.2f}")
            st.metric("Total Egresos Q2", f"${egresos_q2:,.2f}")
            st.metric("Utilidad / Flujo Q2", f"${utilidad_q2:,.2f}", delta=utilidad_q2)
            st.dataframe(df_q2[['fecha', 'tipo', 'estado', 'descripcion', 'monto']], use_container_width=True)

        st.markdown("---")
        st.subheader("📈 Proyección de Ingresos vs Egresos")
        fig = px.bar(resumen, x="quincena", y="monto", color="tipo", barmode="group",
                     pattern_shape="estado", title="Flujo Quincenal (Realizados vs Proyectados)",
                     color_discrete_map={"Ingreso": "#2CA02C", "Egreso": "#D62728"})
        st.plotly_chart(fig, use_container_width=True)

# --- VISTA 2: REGISTRAR MOVIMIENTO ---
elif menu == "📝 Registrar Movimiento":
    st.title("📝 Registrar Nuevo Movimiento")
    cuentas_df = pd.read_sql_query("SELECT nombre FROM cuentas", conn)
    lista_cuentas = cuentas_df['nombre'].tolist() if not cuentas_df.empty else ["Sin cuenta configurada"]

    with st.form("form_movimiento", clear_on_submit=True):
        col1, col2 = st.columns(2)
        with col1:
            fecha_input = st.date_input("Fecha (Aplica para proyecciones futuras)")
            tipo = st.selectbox("Tipo de Movimiento", ["Ingreso", "Egreso"])
            estado = st.selectbox("Estado", ["Realizado", "Proyectado"])
            monto = st.number_input("Monto ($)", min_value=0.01, format="%.2f")
        with col2:
            metodo = st.selectbox("Método de Pago", ["Efectivo", "Transferencia", "Tarjeta Débito", "Tarjeta de Crédito"])
            cuenta = st.selectbox("Cuenta / Tarjeta", lista_cuentas)
            categoria = st.text_input("Categoría (Ej. Salario, Vivienda, Transporte)")
            descripcion = st.text_input("Descripción")
            
        submit = st.form_submit_button("Guardar Movimiento")
        if submit:
            mes_nombre = obtener_mes_nombre(fecha_input)
            quincena = calcular_quincena(fecha_input)
            c = conn.cursor()
            c.execute("INSERT INTO movimientos (fecha, mes, quincena, tipo, estado, metodo_pago, cuenta_tarjeta, categoria, descripcion, monto) VALUES (?,?,?,?,?,?,?,?,?,?)",
                      (fecha_input, mes_nombre, quincena, tipo, estado, metodo, cuenta, categoria, descripcion, monto))
            conn.commit()
            st.success("✅ Movimiento guardado correctamente. Revisa el Dashboard.")

# --- VISTA 3: EDITAR / ELIMINAR ---
elif menu == "✏️ Editar / Eliminar":
    st.title("✏️ Editar o Eliminar Movimientos")
    
    cuentas_df = pd.read_sql_query("SELECT nombre FROM cuentas", conn)
    lista_cuentas = cuentas_df['nombre'].tolist() if not cuentas_df.empty else ["Sin cuenta configurada"]
    
    df_movs = pd.read_sql_query("SELECT * FROM movimientos ORDER BY fecha DESC", conn)
    
    if df_movs.empty:
        st.info("No hay movimientos para editar.")
    else:
        opciones = df_movs.apply(lambda row: f"[{row['fecha']}] {row['tipo']} - {row['descripcion']} (${row['monto']}) - ID:{row['id']}", axis=1).tolist()
        mov_seleccionado = st.selectbox("Busca y selecciona el movimiento:", opciones)
        
        mov_id = int(mov_seleccionado.split("ID:")[-1])
        mov_data = df_movs[df_movs['id'] == mov_id].iloc[0]
        
        with st.form("form_edicion"):
            col1, col2 = st.columns(2)
            with col1:
                f_date = datetime.datetime.strptime(mov_data['fecha'], '%Y-%m-%d').date()
                new_fecha = st.date_input("Fecha", value=f_date)
                tipo_idx = ["Ingreso", "Egreso"].index(mov_data['tipo']) if mov_data['tipo'] in ["Ingreso", "Egreso"] else 0
                new_tipo = st.selectbox("Tipo", ["Ingreso", "Egreso"], index=tipo_idx)
                estado_idx = ["Realizado", "Proyectado"].index(mov_data['estado']) if mov_data['estado'] in ["Realizado", "Proyectado"] else 0
                new_estado = st.selectbox("Estado", ["Realizado", "Proyectado"], index=estado_idx)
                new_monto = st.number_input("Monto ($)", min_value=0.01, value=float(mov_data['monto']), format="%.2f")
            with col2:
                metodos = ["Efectivo", "Transferencia", "Tarjeta Débito", "Tarjeta de Crédito"]
                metodo_idx = metodos.index(mov_data['metodo_pago']) if mov_data['metodo_pago'] in metodos else 0
                new_metodo = st.selectbox("Método de Pago", metodos, index=metodo_idx)
                cuenta_idx = lista_cuentas.index(mov_data['cuenta_tarjeta']) if mov_data['cuenta_tarjeta'] in lista_cuentas else 0
                new_cuenta = st.selectbox("Cuenta / Tarjeta", lista_cuentas, index=cuenta_idx)
                new_cat = st.text_input("Categoría", value=mov_data['categoria'])
                new_desc = st.text_input("Descripción", value=mov_data['descripcion'])
            
            # Using columns for buttons
            st.write("---")
            col_b1, col_b2, col_b3 = st.columns([1, 1, 2])
            with col_b1:
                btn_actualizar = st.form_submit_button("✅ Actualizar")
            with col_b2:
                btn_eliminar = st.form_submit_button("🗑️ Eliminar")
                
        if btn_actualizar:
            mes_nombre = obtener_mes_nombre(new_fecha)
            quincena = calcular_quincena(new_fecha)
            c = conn.cursor()
            c.execute('''UPDATE movimientos 
                         SET fecha=?, mes=?, quincena=?, tipo=?, estado=?, metodo_pago=?, cuenta_tarjeta=?, categoria=?, descripcion=?, monto=?
                         WHERE id=?''', 
                      (new_fecha, mes_nombre, quincena, new_tipo, new_estado, new_metodo, new_cuenta, new_cat, new_desc, new_monto, mov_id))
            conn.commit()
            st.success("Movimiento actualizado exitosamente. Selecciona otro o ve al Dashboard.")
            
        if btn_eliminar:
            c = conn.cursor()
            c.execute("DELETE FROM movimientos WHERE id=?", (mov_id,))
            conn.commit()
            st.error("Movimiento eliminado exitosamente.")

# --- VISTA 4: AHORROS ---
elif menu == "🐷 Ahorros":
    st.title("🐷 Módulo de Ahorros")
    with st.form("form_ahorro", clear_on_submit=True):
        col1, col2 = st.columns(2)
        with col1:
            fecha_ahorro = st.date_input("Fecha")
            meta = st.text_input("Nombre de la Meta (Ej. Viaje, Emergencia, Auto)")
        with col2:
            monto_ahorro = st.number_input("Monto a Ahorrar ($)", min_value=0.01, format="%.2f")
        submit_ahorro = st.form_submit_button("Agregar al Ahorro")
        
        if submit_ahorro:
            c = conn.cursor()
            c.execute("INSERT INTO ahorros (fecha, meta, monto) VALUES (?,?,?)", (fecha_ahorro, meta, monto_ahorro))
            conn.commit()
            st.success("✅ Ahorro registrado exitosamente.")
            
    st.markdown("---")
    ahorros_df = pd.read_sql_query("SELECT meta, SUM(monto) as total_ahorrado FROM ahorros GROUP BY meta", conn)
    if not ahorros_df.empty:
        fig = px.pie(ahorros_df, values='total_ahorrado', names='meta', title="Distribución de Ahorros", hole=0.4)
        st.plotly_chart(fig)
        st.dataframe(ahorros_df, use_container_width=True)
    else:
        st.info("Aún no tienes ahorros registrados.")

# --- VISTA 5: TARJETAS Y CUENTAS ---
elif menu == "💳 Tarjetas y Cuentas":
    st.title("💳 Administrar Cuentas y Tarjetas")
    with st.form("form_cuentas", clear_on_submit=True):
        nombre_cuenta = st.text_input("Nombre de la Cuenta o Tarjeta (Ej. Visa Bancolombia)")
        tipo_cuenta = st.selectbox("Tipo", ["Cuenta Débito", "Tarjeta de Crédito", "Efectivo Físico"])
        submit_cuenta = st.form_submit_button("Crear Cuenta")
        
        if submit_cuenta:
            c = conn.cursor()
            c.execute("INSERT INTO cuentas (nombre, tipo) VALUES (?,?)", (nombre_cuenta, tipo_cuenta))
            conn.commit()
            st.success(f"✅ Cuenta '{nombre_cuenta}' creada.")
            
    st.markdown("---")
    cuentas_df = pd.read_sql_query("SELECT * FROM cuentas", conn)
    st.dataframe(cuentas_df, use_container_width=True)
