# API Dólar Venezuela 🇻🇪

Una API RESTful y aplicación web construida con Node.js y Express diseñada para monitorear, almacenar y consultar las tasas de cambio en Venezuela. El sistema obtiene automáticamente los valores del Banco Central de Venezuela (BCV), el Euro y un promedio en tiempo real de Binance P2P.

## 🚀 Características Principales

* **Web Scraping Automatizado:** Extrae tasas directamente del portal del BCV y calcula promedios de órdenes de venta en Binance P2P.
* **Cron Jobs Integrados:** Actualiza los precios en la base de datos automáticamente entre las 6:00 AM y las 10:00 PM (Hora de Caracas).
* **Historial de Tasas:** Almacena el histórico en MongoDB, permitiendo búsquedas por fecha y la generación de datos para gráficas de los últimos 30 registros.
* **Manejo de Fines de Semana:** Lógica inteligente para detectar y manejar tasas futuras (ej. las publicadas el viernes para el día lunes).
* **Frontend Incluido:** Interfaz visual (SSR con EJS) que incluye un monitor en tiempo real, calculadora de conversiones y un calendario histórico.

## 🛠️ Tecnologías Utilizadas

* **Backend:** Node.js, Express.js
* **Base de Datos:** MongoDB (Mongoose)
* **Scraping y Peticiones:** Cheerio, Node-fetch, Axios
* **Tareas Programadas:** Node-cron
* **Vistas:** EJS, Bootstrap 5

## 🌐 API Pública (Lista para usar)

Si no deseas configurar, instalar ni alojar el proyecto por tu cuenta, puedes consumir directamente la API pública que ya se encuentra desplegada y actualizándose automáticamente:

**URL Base:** `https://api-dollar-0f0i.onrender.com`

**Endpoint principal:** 👉 `https://api-dollar-0f0i.onrender.com/api/dolar/ves`

*Puedes usar esta URL base para probar cualquiera de los endpoints descritos en la documentación a continuación.*

## ⚙️ Instalación y Configuración

1. **Clonar el repositorio y entrar al directorio:**
   ```bash
   git clone [https://github.com/Rem0925/API_DOLLAR](https://github.com/Rem0925/API_DOLLAR)
   cd api_dollar
   ```

2. **Instalar las dependencias:**
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno:**
   Crea un archivo `.env` en la raíz del proyecto y añade la URI de conexión a MongoDB y el puerto:
   ```env
   PORT=3000
   MONGO_URI=mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/<tu-bd>?retryWrites=true&w=majority
   ```

4. **Iniciar el servidor:**
   ```bash
   npm start
   ```
   *Nota: El script de inicio utiliza `cross-env NODE_TLS_REJECT_UNAUTHORIZED=0` para evitar problemas de certificados SSL al hacer scraping a páginas gubernamentales como el BCV.*

## 📡 Documentación de la API

La API cuenta con soporte de *Content Negotiation*. Si accedes desde un navegador web, renderizará la vista visual (HTML). Si realizas la petición desde un cliente HTTP (Postman, Fetch, Axios, aplicación móvil), devolverá un objeto JSON.

### 1. Obtener la Tasa Actual
Obtiene los valores vigentes del dólar (BCV, Binance) y Euro.

* **Endpoint:** `GET /api/dolar/ves`
* **Respuesta Exitosa (JSON):**
  ```json
  {
    "fecha": "27/03/26 - 08:30 PM",
    "bcv": "35.95",
    "euro": "39.12",
    "binance": "38.50",
    "tieneProximo": false,
    "esTasaProxima": false,
    "conversion": {}
  }
  ```

### 2. Consultar Histórico por Fecha Exacta
Devuelve la tasa de cambio que estaba vigente en una fecha en específico.

* **Endpoint:** `GET /api/dolar/ves?fecha=YYYY-MM-DD`
* **Ejemplo:** `/api/dolar/ves?fecha=2026-03-25`
* **Respuesta Exitosa (JSON):** Retorna la misma estructura del punto 1, pero con los datos correspondientes a ese día.

### 3. Obtener Tasa del Próximo Día Hábil
Fuerza al sistema a devolver la tasa proyectada (ej. la tasa del lunes que se publica el viernes por la tarde).

* **Endpoint:** `GET /api/dolar/ves?proximo=true`

### 4. Consultar Días Disponibles en un Mes (Modo Calendario)
Útil para pintar calendarios en aplicaciones frontend o móviles. Devuelve un arreglo con los días que tienen registros almacenados en un mes específico.

* **Endpoint:** `GET /api/dolar/ves?modo=calendario&mes={MES}&anio={AÑO}`
  *(Nota importante: El mes sigue el estándar de JavaScript y se cuenta desde 0, donde 0 es Enero y 11 es Diciembre).*
* **Ejemplo:** `/api/dolar/ves?modo=calendario&mes=2&anio=2026` (Busca en Marzo de 2026)
* **Respuesta Exitosa (JSON):**
  ```json
  {
    "dias": [1, 2, 3, 4, 5, 8, 9, 10, 11, 12]
  }
  ```

### 5. Obtener Datos para Gráficas
Devuelve un histórico ordenado cronológicamente (de más antiguo a más reciente) con los últimos 30 días registrados. Ideal para alimentar gráficas de líneas o barras.

* **Endpoint:** `GET /api/dolar/historial`
* **Respuesta Exitosa (JSON):**
  ```json
  [
    {
      "fecha": "26/03/26",
      "bcv": 35.80,
      "binance": 38.10,
      "euro": 38.90
    },
    {
      "fecha": "27/03/26",
      "bcv": 35.85,
      "binance": 38.25,
      "euro": 39.00
    }
  ]
  ```

## 🧹 Mantenimiento Automático
El sistema incluye un cron job de limpieza configurado para ejecutarse el día 1 de cada mes a la medianoche. Este proceso elimina automáticamente de la base de datos de MongoDB cualquier registro que tenga más de 1 año de antigüedad, optimizando el espacio y evitando costos innecesarios.
