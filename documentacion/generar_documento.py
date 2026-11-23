import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def create_manual_docx():
    doc = docx.Document()

    # Configuración de márgenes
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    # Colores institucionales
    COLOR_PRIMARY = RGBColor(26, 54, 93)     # Azul marino institucional #1A365D
    COLOR_SECONDARY = RGBColor(43, 108, 176) # Azul acento #2B6CB0
    COLOR_TEXT = RGBColor(45, 55, 72)        # Gris oscuro #2D3748
    COLOR_MUTED = RGBColor(113, 128, 150)    # Gris medio #718096

    # Estilo base
    style_normal = doc.styles['Normal']
    font = style_normal.font
    font.name = 'Calibri'
    font.size = Pt(11)
    font.color.rgb = COLOR_TEXT

    # ==========================================
    # CARÁTULA
    # ==========================================
    p_inst = doc.add_paragraph()
    p_inst.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_inst = p_inst.add_run("UNIVERSIDAD / INSTITUCIÓN ACADÉMICA\nFACULTAD DE CIENCIAS Y TECNOLOGÍA\nCARRERA DE INGENIERÍA DE SISTEMAS")
    r_inst.bold = True
    r_inst.font.size = Pt(13)
    r_inst.font.color.rgb = COLOR_PRIMARY

    doc.add_paragraph("\n" * 2)

    p_tipo = doc.add_paragraph()
    p_tipo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_tipo = p_tipo.add_run("PROYECTO DE GRADO")
    r_tipo.bold = True
    r_tipo.font.size = Pt(14)
    r_tipo.font.color.rgb = COLOR_SECONDARY

    p_titulo = doc.add_paragraph()
    p_titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_titulo = p_titulo.add_run("“SISTEMA DE MONITOREO Y DOSIFICACIÓN AUTOMÁTICA DE QUÍMICOS PARA PISCINAS MEDIANTE REDES NEURONALES BiLSTM E INTERNET DE LAS COSAS”")
    r_titulo.bold = True
    r_titulo.font.size = Pt(17)
    r_titulo.font.color.rgb = COLOR_PRIMARY

    doc.add_paragraph("\n")

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_sub = p_sub.add_run("MANUAL DE INSTALACIÓN, CONFIGURACIÓN Y GUÍA DE ENTREGA DIGITAL")
    r_sub.bold = True
    r_sub.font.size = Pt(13)
    r_sub.font.color.rgb = COLOR_SECONDARY

    doc.add_paragraph("\n" * 4)

    # Caja de metadatos de la carátula
    table_meta = doc.add_table(rows=5, cols=2)
    table_meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_meta.autofit = False

    datos_meta = [
        ("Postulante:", "Shakira Orosco Gutierrez"),
        ("Asignatura / Modalidad:", "Taller de Graduación / Proyecto de Grado"),
        ("Fecha de Entrega:", "02 de Diciembre de 2026 - 18:30"),
        ("Versión del Software:", "1.0.0 (Release Estable)"),
        ("Entorno de Ejecución:", "Cliente-Servidor (FastAPI + React + Supabase Cloud + PyTorch)")
    ]

    for i, (campo, valor) in enumerate(datos_meta):
        cell_lbl = table_meta.rows[i].cells[0]
        cell_val = table_meta.rows[i].cells[1]
        
        cell_lbl.width = Inches(2.2)
        cell_val.width = Inches(4.2)
        
        p_l = cell_lbl.paragraphs[0]
        r_l = p_l.add_run(campo)
        r_l.bold = True
        r_l.font.color.rgb = COLOR_PRIMARY
        
        p_v = cell_val.paragraphs[0]
        r_v = p_v.add_run(valor)
        r_v.font.color.rgb = COLOR_TEXT

    doc.add_page_break()

    # ==========================================
    # SECCIÓN 1: INTRODUCCIÓN
    # ==========================================
    h1 = doc.add_heading("1. Introducción y Arquitectura del Sistema", level=1)
    h1.runs[0].font.color.rgb = COLOR_PRIMARY

    p = doc.add_paragraph(
        "El presente manual proporciona las directrices técnicas indispensables para la instalación, "
        "configuración y puesta en marcha del Sistema de Monitoreo y Dosificación Automática de Químicos para Piscinas. "
        "La solución ha sido diseñada bajo una Arquitectura Cliente-Servidor desacoplada que asegura escalabilidad, "
        "alta disponibilidad y acceso multiplataforma:"
    )
    p.paragraph_format.line_spacing = 1.15

    doc.add_paragraph(
        "• Servidor (Backend & IA): Desarrollado en Python con FastAPI. Integra los modelos predictivos de redes "
        "neuronales recurrentes bidireccionales (BiLSTM) construidos sobre PyTorch, modelos de ensamble XGBoost, "
        "control de actuadores dosificadores y APIs RESTful seguras con autenticación JWT.",
        style='List Bullet'
    )
    doc.add_paragraph(
        "• Cliente (Frontend SPA): Desarrollado en React 19 con Vite y TailwindCSS. Ofrece un panel de control interactivo "
        "en tiempo real para operadores y administradores, con gráficas dinámicas (Recharts) y diseño responsivo móvil.",
        style='List Bullet'
    )
    doc.add_paragraph(
        "• Base de Datos en la Nube (Cloud DB): Gestionada a través de PostgreSQL en Supabase Cloud bajo el esquema "
        "específico piscina_lstm3, permitiendo persistencia centralizada, auditoría y respaldo continuo.",
        style='List Bullet'
    )
    doc.add_paragraph(
        "• Módulo IoT y Hardware: Firmware para microcontroladores ESP32 con sensores de pH, turbidez y temperatura, "
        "respaldado por un simulador de telemetría de eventos para pruebas de laboratorio.",
        style='List Bullet'
    )

    # ==========================================
    # SECCIÓN 2: REQUISITOS PREVIOS
    # ==========================================
    h2 = doc.add_heading("2. Requisitos Previos", level=1)
    h2.runs[0].font.color.rgb = COLOR_PRIMARY

    doc.add_heading("2.1 Requisitos de Hardware", level=2)
    
    t_hw = doc.add_table(rows=6, cols=3)
    t_hw.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["Componente", "Requisito Mínimo", "Requisito Recomendado"]
    for j, h in enumerate(headers):
        cell = t_hw.rows[0].cells[j]
        set_cell_background(cell, "1A365D")
        p = cell.paragraphs[0]
        r = p.add_run(h)
        r.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)

    hw_rows = [
        ("Sistema Operativo", "Windows 10/11 (64-bit), Ubuntu 20.04+, macOS 12+", "Windows 11 Pro o Ubuntu 22.04 LTS"),
        ("Procesador (CPU)", "Intel Core i3 / AMD Ryzen 3 (2.0 GHz, 2 cores)", "Intel Core i5/i7 o Ryzen 5/7 (4+ cores)"),
        ("Memoria RAM", "4 GB", "8 GB o 16 GB (recomendado para Docker/IA)"),
        ("Espacio en Disco", "5 GB disponibles", "15 GB libres (SSD recomendado)"),
        ("Conectividad", "Conexión a Internet (acceso a Supabase Cloud)", "Red LAN / Wi-Fi local para multidispositivo")
    ]
    for i, fila in enumerate(hw_rows):
        for j, val in enumerate(fila):
            cell = t_hw.rows[i+1].cells[j]
            if (i % 2) == 1:
                set_cell_background(cell, "F7FAFC")
            p = cell.paragraphs[0]
            r = p.add_run(val)
            if j == 0:
                r.bold = True

    doc.add_paragraph("\n")
    doc.add_heading("2.2 Dependencias de Software", level=2)
    doc.add_paragraph("Para ejecutar el software se puede optar por Docker (recomendado) o instalación nativa:")
    doc.add_paragraph("1. Python 3.10 o 3.11 (64-bit) con gestor de paquetes pip y venv.", style='List Number')
    doc.add_paragraph("2. Node.js 20.x LTS o 22.x LTS (incluye npm v10+).", style='List Number')
    doc.add_paragraph("3. Docker Desktop y Docker Compose v2 (opción de despliegue en un clic).", style='List Number')
    doc.add_paragraph("4. Acceso al clúster de Base de Datos PostgreSQL (Supabase Cloud).", style='List Number')

    # ==========================================
    # SECCIÓN 3: INSTALACIÓN
    # ==========================================
    h3 = doc.add_heading("3. Procedimiento de Instalación", level=1)
    h3.runs[0].font.color.rgb = COLOR_PRIMARY

    doc.add_heading("3.1 Método 1: Despliegue Automatizado con Docker (Recomendado)", level=2)
    doc.add_paragraph(
        "Este método compila y ejecuta automáticamente el Frontend (React + Nginx) y el Backend (FastAPI + PyTorch) "
        "en contenedores aislados con orquestación de red y proxy inverso:"
    )

    p_cmd1 = doc.add_paragraph()
    set_cell_background(doc.add_table(rows=1, cols=1).rows[0].cells[0], "EDF2F7")
    # Para simplicidad visual:
    p_code = doc.add_paragraph("cd sistema-piscina\ndocker compose up -d --build")
    p_code.paragraph_format.left_indent = Inches(0.5)
    for run in p_code.runs:
        run.font.name = 'Consolas'
        run.font.size = Pt(10)

    doc.add_paragraph("Una vez finalizado, los servicios estarán disponibles en:")
    doc.add_paragraph("• Frontend Aplicación Web: http://localhost:3000", style='List Bullet')
    doc.add_paragraph("• Backend API & Documentación Swagger: http://localhost:8000/docs", style='List Bullet')
    doc.add_paragraph("• Acceso desde otros dispositivos en la red: http://<IP_DEL_SERVIDOR>:3000", style='List Bullet')

    doc.add_heading("3.2 Método 2: Instalación Nativa en Windows (Paso a Paso)", level=2)
    doc.add_paragraph("Paso 1: Configurar el Backend (FastAPI + IA):")
    p_w1 = doc.add_paragraph(
        "cd sistema-piscina\\backend\n"
        "python -m venv venv\n"
        ".\\venv\\Scripts\\activate\n"
        "python -m pip install --upgrade pip\n"
        "pip install -r requirements.txt\n"
        "cd ..\n"
        "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload"
    )
    p_w1.paragraph_format.left_indent = Inches(0.5)
    for run in p_w1.runs:
        run.font.name = 'Consolas'
        run.font.size = Pt(9.5)

    doc.add_paragraph("Paso 2: Configurar el Frontend (React + Vite) en una segunda consola:")
    p_w2 = doc.add_paragraph(
        "cd sistema-piscina\\frontend\n"
        "npm install\n"
        "npm run dev -- --host 0.0.0.0"
    )
    p_w2.paragraph_format.left_indent = Inches(0.5)
    for run in p_w2.runs:
        run.font.name = 'Consolas'
        run.font.size = Pt(9.5)

    doc.add_heading("3.3 Método 3: Instalación Nativa en Linux (Ubuntu / Debian)", level=2)
    p_l1 = doc.add_paragraph(
        "# 1. Instalar dependencias del sistema\n"
        "sudo apt update && sudo apt install -y python3 python3-pip python3-venv git curl nodejs npm\n\n"
        "# 2. Levantar Backend\n"
        "cd sistema-piscina/backend\n"
        "python3 -m venv venv && source venv/bin/activate\n"
        "pip install -r requirements.txt\n"
        "cd .. && python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &\n\n"
        "# 3. Compilar y levantar Frontend\n"
        "cd sistema-piscina/frontend\n"
        "npm install && npm run build\n"
        "npm run preview -- --host 0.0.0.0 --port 3000"
    )
    p_l1.paragraph_format.left_indent = Inches(0.5)
    for run in p_l1.runs:
        run.font.name = 'Consolas'
        run.font.size = Pt(9)

    doc.add_heading("3.4 Método 4: Acceso y Operación desde Dispositivos Móviles (Android / iOS)", level=2)
    doc.add_paragraph(
        "El sistema incorpora una arquitectura web responsive (Mobile First) que permite control y monitoreo en tiempo real "
        "desde cualquier smartphone sin exigir la instalación de un archivo APK de gran tamaño:"
    )
    doc.add_paragraph("1. Conecte el dispositivo móvil a la misma red Wi-Fi del equipo anfitrión.", style='List Number')
    doc.add_paragraph("2. Obtenga la IP local del servidor con 'ipconfig' (ejemplo: 192.168.1.50).", style='List Number')
    doc.add_paragraph("3. Abra el navegador del celular (Chrome o Safari) y acceda a: http://192.168.1.50:3000", style='List Number')
    doc.add_paragraph("4. En el menú del navegador pulse 'Agregar a pantalla principal' para crear un acceso directo PWA.", style='List Number')

    # ==========================================
    # SECCIÓN 4: CONFIGURACIÓN ADICIONAL
    # ==========================================
    h4 = doc.add_heading("4. Configuración de Base de Datos y Servicios Cloud", level=1)
    h4.runs[0].font.color.rgb = COLOR_PRIMARY

    doc.add_heading("4.1 Parámetros de Conexión a Supabase Cloud (.env)", level=2)
    doc.add_paragraph(
        "El sistema consume una instancia de base de datos relacional PostgreSQL alojada en Supabase (AWS us-east-2). "
        "El archivo .env en la raíz del proyecto debe contener los siguientes parámetros:"
    )
    p_env = doc.add_paragraph(
        "SUPABASE_DB_HOST=aws-0-us-east-2.pooler.supabase.com\n"
        "SUPABASE_DB_PORT=5432\n"
        "SUPABASE_DB_NAME=postgres\n"
        "SUPABASE_DB_USER=postgres.magihsdcxcjmfdjechvc\n"
        "SUPABASE_DB_PASSWORD=LSTM_piscinaIOT\n"
        "JWT_SECRET=cambia-esta-clave-en-produccion-usa-una-clave-propia\n"
        "JWT_EXPIRES_MINUTES=60\n"
        "CORS_ORIGINS=*"
    )
    p_env.paragraph_format.left_indent = Inches(0.5)
    for run in p_env.runs:
        run.font.name = 'Consolas'
        run.font.size = Pt(9)

    doc.add_heading("4.2 Credenciales Iniciales de Acceso", level=2)
    t_cred = doc.add_table(rows=4, cols=2)
    t_cred.alignment = WD_TABLE_ALIGNMENT.CENTER
    cred_datos = [
        ("URL de Ingreso:", "http://localhost:3000"),
        ("Correo Electrónico:", "shakiraog2005@gmail.com"),
        ("Contraseña de Acceso:", "admin1234"),
        ("Rol Asignado:", "Administrador (ADM) con permisos completos")
    ]
    for i, (k, v) in enumerate(cred_datos):
        c0 = t_cred.rows[i].cells[0]
        c1 = t_cred.rows[i].cells[1]
        c0.width = Inches(2.5)
        c1.width = Inches(3.8)
        p0 = c0.paragraphs[0]
        r0 = p0.add_run(k)
        r0.bold = True
        p1 = c1.paragraphs[0]
        p1.add_run(v)

    doc.add_paragraph("\n")
    doc.add_heading("4.3 Módulo de Simulación IoT y Telemetría", level=2)
    doc.add_paragraph(
        "Para demostraciones académicas sin hardware físico en agua, se incluye un simulador de telemetría automática:\n"
        "python backend/iot/simulador_api.py --escenario normal --pausa 3"
    )

    # ==========================================
    # SECCIÓN 5: SOLUCIÓN DE PROBLEMAS
    # ==========================================
    h5 = doc.add_heading("5. Solución de Problemas Comunes (Troubleshooting)", level=1)
    h5.runs[0].font.color.rgb = COLOR_PRIMARY

    t_tr = doc.add_table(rows=5, cols=3)
    t_tr.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers_tr = ["Problema", "Causa Probable", "Solución Recomendada"]
    for j, h in enumerate(headers_tr):
        cell = t_tr.rows[0].cells[j]
        set_cell_background(cell, "1A365D")
        p = cell.paragraphs[0]
        r = p.add_run(h)
        r.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)

    tr_rows = [
        ("Fallo de conexión a Supabase", "Puerto 5432 bloqueado por el firewall.", "Cambiar en .env SUPABASE_DB_PORT=6543 (Session Pooler)."),
        ("Puerto 8000 o 3000 ocupado", "Instancia anterior no cerrada.", "En Windows ejecutar: taskkill /F /IM python.exe /IM node.exe."),
        ("Bloqueo CORS en navegador", "Acceso desde IP no permitida.", "Verificar que CORS_ORIGINS=* esté activo en el archivo .env."),
        ("Cuenta temporalmente bloqueada", "Más de 3 intentos fallidos de login.", "Espere 5 minutos para desbloqueo automático por seguridad.")
    ]
    for i, fila in enumerate(tr_rows):
        for j, val in enumerate(fila):
            cell = t_tr.rows[i+1].cells[j]
            if (i % 2) == 1:
                set_cell_background(cell, "F7FAFC")
            p = cell.paragraphs[0]
            r = p.add_run(val)
            if j == 0:
                r.bold = True

    # ==========================================
    # SECCIÓN 6: ENTREGA EN DIGITAL
    # ==========================================
    doc.add_page_break()
    h6 = doc.add_heading("6. Guía para la Entrega en Digital del Proyecto de Grado", level=1)
    h6.runs[0].font.color.rgb = COLOR_PRIMARY

    doc.add_paragraph(
        "En cumplimiento de los requerimientos de titulación, la entrega física del software se efectuará "
        "en memoria Flash USB o disco DVD-R debidamente rotulado y sin posibilidad de devolución."
    )

    doc.add_heading("6.1 Rótulo Oficial del Dispositivo Físico", level=2)
    p_rot = doc.add_paragraph(
        "------------------------------------------------------------------------\n"
        "PROYECTO DE GRADO - ENTREGA DIGITAL FINAL\n"
        "Postulante:     Shakira Orosco Gutierrez\n"
        "Carrera:        Ingeniería de Sistemas\n"
        "Proyecto:       Sistema de Monitoreo y Dosificación Automática de Químicos\n"
        "                para Piscinas mediante Redes Neuronales BiLSTM e IoT\n"
        "Fecha Límite:   02 de Diciembre de 2026 - 18:30\n"
        "------------------------------------------------------------------------"
    )
    p_rot.paragraph_format.left_indent = Inches(0.5)
    for run in p_rot.runs:
        run.font.name = 'Consolas'
        run.font.size = Pt(9.5)

    doc.add_heading("6.2 Estructura de Carpetas en la Memoria USB / DVD", level=2)
    doc.add_paragraph("La raíz del dispositivo debe organizarse con la siguiente estructura oficial:")
    p_tree = doc.add_paragraph(
        "SISTEMA_PISCINA_IOT_LSTM/\n"
        "├── 1_Codigo_Fuente/\n"
        "│   ├── Backend/                 (Código FastAPI, PyTorch y servicios)\n"
        "│   ├── Frontend/                (Código React 19, componentes y estilos)\n"
        "│   ├── IoT_Firmware/            (Firmware ESP32 en Arduino C++ y MicroPython)\n"
        "│   ├── docker-compose.yml       (Despliegue unificado con contenedores)\n"
        "│   └── .env.example             (Variables de entorno de muestra)\n"
        "├── 2_Backups_BD/\n"
        "│   ├── backup_piscina_lstm3.sql (Respaldo completo de base de datos Supabase)\n"
        "│   └── auth_migration.sql       (Script de auditoría y roles de seguridad)\n"
        "├── 3_Datasets/\n"
        "│   ├── dataset_piscina.csv            (Historial fisicoquímico)\n"
        "│   ├── dataset_mediciones_horas.csv   (Mediciones horarias)\n"
        "│   └── dataset_dosificacion_diaria.csv(Aplicación de cloro y pH)\n"
        "├── 4_Ejecutables_Demo/\n"
        "│   ├── INICIAR_SISTEMA_WINDOWS.bat    (Lanzador de un clic para Windows)\n"
        "│   ├── INICIAR_SISTEMA_LINUX.sh       (Lanzador para Linux)\n"
        "│   └── Modelos_Entrenados/            (Archivos .pth y .joblib)\n"
        "└── 5_Manuales_Documentacion/\n"
        "    ├── Manual_de_Instalacion.pdf      (Manual técnico de instalación)\n"
        "    ├── Manual_de_Usuario.pdf          (Guía de usuario de pantallas)\n"
        "    └── Pruebas_Iteracion_1_a_5.xlsx   (Matrices de prueba de calidad)"
    )
    p_tree.paragraph_format.left_indent = Inches(0.3)
    for run in p_tree.runs:
        run.font.name = 'Consolas'
        run.font.size = Pt(8.5)

    doc.save("MANUAL_DE_INSTALACION.docx")
    print("Documento MANUAL_DE_INSTALACION.docx generado exitosamente.")

if __name__ == "__main__":
    create_manual_docx()
