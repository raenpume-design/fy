
import streamlit as st
import sqlite3
import pandas as pd
import datetime
import calendar
import plotly.express as px
import plotly.graph_objects as go

# --- CONFIGURACIÓN DE PÁGINA ---
st.set_page_config(page_title="Gestor de Finanzas", page_icon="💰", layout="wide")

# --- CONEXIÓN A BASE DE DATOS (SQLite) ---
def init_db():
    conn = sqlite3.connect('mis_finanzas.db')
    c = conn.cursor()
    # Tabla de Movimientos
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
    # Tabla de Tarjetas/Cuentas
    c.execute('''CREATE TABLE IF NOT EXISTS cuentas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT,
                    tipo TEXT
                )''')
    # Tabla de Ahorros
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
menu = st.sidebar.radio("Navegación", ["📊 Dashboard & Proyección", "📝 Registrar Movimiento", "🐷 Ahorros", "💳 Tarjetas y Cuentas"])

# --- VISTA 1: DASHBOARD Y PROYECCIÓN QUINCENAL ---
if menu == "📊 Dashboard & Proyección":
    st.title("📊 Resumen y Proyección (Por Quincenas)")
    
    df = pd.read_sql_query("SELECT * FROM movimientos", conn)
    
    if df.empty:
        st.info("Aún no hay movimientos registrados. Ve a 'Registrar Movimiento' para comenzar.")
    else:
        # Filtros
        meses_disponibles = df['mes'].unique().tolist()
        mes_seleccionado = st.selectbox("Selecciona el Mes a visualizar:", meses_disponibles)
        
        df_mes = df[df['mes'] == mes_seleccionado]
        
        # Calcular Totales por Quincena
        resumen = df_mes.groupby(['quincena', 'tipo', 'estado'])['monto'].sum().reset_index()
        
        col1, col2 = st.columns(2)
        
        # Q1
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

        # Q2
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

        # Gráfico
        st.markdown("---")
        st.subheader("📈 Proyección de Ingresos vs Egresos")
        fig = px.bar(resumen, x="quincena", y="monto", color="tipo", barmode="group",
                     pattern_shape="estado", title="Flujo Quincenal (Realizados vs Proyectados)",
                     color_discrete_map={"Ingreso": "#2CA02C", "Egreso": "#D62728"})
        st.plotly_chart(fig, use_container_width=True)


# --- VISTA 2: REGISTRAR MOVIMIENTO ---
elif menu == "📝 Registrar Movimiento":
    st.title("📝 Registrar Nuevo Movimiento")
    
    # Cargar cuentas para el dropdown
    cuentas_df = pd.read_sql_query("SELECT nombre FROM cuentas", conn)
    lista_cuentas = cuentas_df['nombre'].tolist() if not cuentas_df.empty else ["Sin cuenta configurada (Ve a 'Tarjetas y Cuentas')"]

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

# --- VISTA 3: AHORROS ---
elif menu == "🐷 Ahorros":
    st.title("🐷 Módulo de Ahorros")
    st.write("Agrega dinero a tus metas de ahorro sin que se mezcle con tus gastos mensuales.")
    
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
    st.subheader("Tus Metas Actuales")
    ahorros_df = pd.read_sql_query("SELECT meta, SUM(monto) as total_ahorrado FROM ahorros GROUP BY meta", conn)
    
    if not ahorros_df.empty:
        fig = px.pie(ahorros_df, values='total_ahorrado', names='meta', title="Distribución de Ahorros", hole=0.4)
        st.plotly_chart(fig)
        st.dataframe(ahorros_df, use_container_width=True)
    else:
        st.info("Aún no tienes ahorros registrados.")

# --- VISTA 4: TARJETAS Y CUENTAS ---
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
