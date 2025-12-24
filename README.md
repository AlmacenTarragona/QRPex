# ESCANER DE POSTES - Almacen Teleco Tarragona

Aplicación web industrial para el escaneo de códigos Data Matrix, registro de datos y sincronización automática con Google Sheets.

## 🚀 Funcionalidades
- **Escaneo DM**: Lectura optimizada para entornos industriales.
- **Validación**: Control de código de técnico (4 dígitos).
- **Sincronización**: Envío silencioso a Google Sheets.
- **Prevención de Duplicados**: Alertas visuales y sonoras si se escanea un código repetido.
- **Diseño Mobile-First**: Interfaz dark-mode optimizada.

## 🛠️ Instalación y Uso

### 1. Preparar Google Sheets
1. Crea una nueva hoja de cálculo en Google Sheets.
2. Ve a `Extensiones` -> `Apps Script`.
3. Copia el contenido del archivo `google_apps_script.gs` y pégalo allí.
4. Dale a `Implementar` -> `Nueva implementación`.
5. Selecciona `Tipo: Aplicación Web`.
6. **Configuración CRÍTICA**: 
   - Ejecutar como: `Yo`.
   - Quién tiene acceso: `Cualquier persona`.
7. Copia la URL de la aplicación web generada.

### 2. Configurar la Aplicación Web
1. Abre el archivo `script.js`.
2. En la primera línea, sustituye el valor de `APPS_SCRIPT_URL` por la URL que copiaste.

### 3. Subir a GitHub
1. Entra en tu repositorio: [github.com/AlmacenTarragona/QRPex](https://github.com/AlmacenTarragona/QRPex)
2. Haz clic en **Add file** -> **Upload files**.
3. Arrastra los archivos de esta carpeta.
4. Haz clic en **Commit changes**.

## 📋 Requisitos
- Navegador moderno con permisos de cámara.
- Conexión a internet.
