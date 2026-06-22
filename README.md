# API Dólar Venezuela 🇻🇪

Una API RESTful y aplicación web construida con Node.js y Express, diseñada para monitorear, almacenar y consultar las tasas de cambio en Venezuela de manera confiable. El sistema automatiza la obtención de valores del Banco Central de Venezuela (BCV), el Euro y un promedio en tiempo real de Binance P2P. Además, incluye integración con **DolarApi** para obtener tasas de otras monedas de la región (Pesos Colombianos, Chilenos, Mexicanos y Reales Brasileños).

---

## 📑 Tabla de Contenidos

- [🚀 Características Principales](#-características-principales)
- [🛠️ Tecnologías Utilizadas](#️-tecnologías-utilizadas)
- [🌐 Uso de la API Pública](#-uso-de-la-api-pública-lista-para-usar)
- [⚙️ Instalación y Configuración Local](#️-instalación-y-configuración-local)
- [📡 Documentación Completa de la API](#-documentación-completa-de-la-api)
  - [1. Obtener la Tasa Actual](#1-obtener-la-tasa-actual)
  - [2. Consultar Histórico por Fecha Exacta](#2-consultar-histórico-por-fecha-exacta)
  - [3. Obtener Tasa del Próximo Día Hábil](#3-obtener-tasa-del-próximo-día-hábil)
  - [4. Consultar Días Disponibles (Modo Calendario)](#4-consultar-días-disponibles-en-un-mes-modo-calendario)
  - [5. Obtener Datos para Gráficas](#5-obtener-datos-para-gráficas)
  - [6. Configuración de Monedas](#6-configuración-de-monedas)
- [💻 API Explorer Integrado (Frontend)](#-api-explorer-integrado-frontend)
- [🧹 Mantenimiento Automático](#-mantenimiento-automático)

---

## 🚀 Características Principales

Esta plataforma no es solo un scraper de precios, sino un sistema integral con las siguientes capacidades:

* **Soporte Multimoneda:** Gracias a la conexión con DolarApi y nuestro scraping interno, obtenemos el BCV, Binance (compra/venta), Euro, y tasas de COP, CLP, BRL y MXN.
* **Cron Jobs y Actualización Continua:** Actualiza los precios en la base de datos de manera automática entre las 6:00 AM y las 10:00 PM (Hora de Caracas), asegurando que los datos siempre sean vigentes.
* **Historial Permanente:** Almacena todo el registro histórico de tasas en MongoDB. Permite realizar búsquedas exactas por fecha y generar arreglos de datos listos para integrarse en librerías de gráficas.
* **Lógica Inteligente de Fines de Semana:** El sistema es capaz de detectar y manejar las tasas "futuras". Por ejemplo, reconoce la tasa publicada el viernes por la tarde y la asigna correctamente como la tasa de apertura para el día lunes.
* **Content Negotiation Nativo:** La API detecta desde dónde se hace la solicitud. Si se visita desde un navegador, renderiza una interfaz interactiva tipo "API Explorer". Si la llamada proviene de Axios/Fetch o Postman, retorna un JSON estructurado.

## 🛠️ Tecnologías Utilizadas

* **Backend & Servidor:** Node.js, Express.js
* **Base de Datos:** MongoDB (Mongoose para modelado de datos)
* **Scraping y Peticiones Web:** Cheerio (parseo de HTML), Node-fetch, Axios
* **Tareas Programadas:** Node-cron
* **Frontend y Vistas:** EJS (Server-Side Rendering), Bootstrap 5

## 🌐 Uso de la API Pública (Lista para usar)

Si deseas integrar las tasas de cambio en tu propio proyecto sin tener que configurar, instalar o alojar esta API, puedes consumir directamente la instancia pública desplegada en la nube con actualizaciones automáticas:

**URL Base:** `https://api-dollar-0f0i.onrender.com`

**Endpoint principal:** 👉 `https://api-dollar-0f0i.onrender.com/api/dolar/ves`

*💡 Tip: Puedes utilizar esta URL base para probar cualquiera de los endpoints descritos en la sección de documentación.*

## ⚙️ Instalación y Configuración Local

Si deseas correr tu propia instancia de la API o contribuir al proyecto, sigue estos pasos:

1. **Clonar el repositorio y entrar al directorio:**
   ```bash
   git clone https://github.com/Rem0925/API_DOLLAR.git
   cd API_DOLLAR
   ```

2. **Instalar las dependencias:**
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno:**
   Crea un archivo llamado `.env` en la raíz del proyecto y añade tu URI de conexión a MongoDB, puertos y las URLs de DolarApi:
   ```env
   PORT=3000
   MONGO_URI=mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/<tu-bd>?retryWrites=true&w=majority
   TRM_API_URL=...
   CLP_API_URL=...
   BRL_API_URL=...
   MXN_API_URL=...
   ```

4. **Iniciar el servidor:**
   ```bash
   npm start
   ```
   > **Nota de Seguridad SSL:** El script de inicio de Node.js utiliza el flag `cross-env NODE_TLS_REJECT_UNAUTHORIZED=0`. Esto es un requisito necesario para evitar el rechazo de certificados SSL al hacer scraping a las páginas gubernamentales (como la del BCV) que frecuentemente presentan problemas de certificados caducados.

---

## 📡 Documentación Completa de la API

La API fue diseñada para ser sencilla, predictible y fácil de integrar. A continuación, se detallan todos los casos de uso disponibles.

### 1. Obtener la Tasa Actual
Devuelve los valores vigentes del dólar (del Banco Central y Binance P2P), del Euro, y las demás monedas regionales vía DolarApi.

* **Endpoint:** `GET /api/dolar/ves`
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "fecha": "27/03/26 - 08:30 PM",
    "bcv": "35.95",
    "euro": "39.12",
    "binance": "38.50",
    "binance_venta": "38.60",
    "cop": "3850.50",
    "clp": "920.10",
    "brl": "4.9520",
    "mxn": "17.05",
    "tieneProximo": false,
    "esTasaProxima": false,
    "conversion": {}
  }
  ```

### 2. Consultar Histórico por Fecha Exacta
Ideal para aplicaciones de contabilidad o facturación que necesitan saber a qué precio estaba el dólar en un día específico del pasado.

* **Endpoint:** `GET /api/dolar/ves?fecha=YYYY-MM-DD`
* **Ejemplo:** `/api/dolar/ves?fecha=2026-03-25`
* **Respuesta Exitosa (`200 OK`):** Retorna exactamente la misma estructura de datos del punto 1, pero correspondientes al día solicitado.

### 3. Obtener Tasa del Próximo Día Hábil
Fuerza al sistema a devolver la tasa proyectada o de apertura del siguiente día hábil. Útil los viernes por la tarde cuando el BCV publica la tasa que aplicará para el día lunes.

* **Endpoint:** `GET /api/dolar/ves?proximo=true`
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "fecha": "30/03/26 - 08:00 AM",
    "bcv": "36.10",
    "euro": "39.20",
    "binance": "38.65",
    "binance_venta": "38.70",
    "tieneProximo": false,
    "esTasaProxima": true,
    "conversion": {}
  }
  ```

### 4. Consultar Días Disponibles en un Mes (Modo Calendario)
Esta funcionalidad es excelente para pintar calendarios interactivos en aplicaciones frontend o móviles. Devuelve un arreglo con los días numéricos que tienen registros almacenados en un mes y año específicos.

* **Endpoint:** `GET /api/dolar/ves?modo=calendario&mes={MES}&anio={AÑO}`
* **Parámetros:** 
  * `mes`: Índice del mes al estilo JavaScript (0 = Enero, 1 = Febrero ... 11 = Diciembre).
  * `anio`: Año en formato de 4 dígitos (ej. 2026).
* **Ejemplo:** `/api/dolar/ves?modo=calendario&mes=2&anio=2026` (Busca en el mes de Marzo de 2026)
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "dias": [1, 2, 3, 4, 5, 8, 9, 10, 11, 12]
  }
  ```

### 5. Obtener Datos para Gráficas
Devuelve un histórico ordenado cronológicamente (desde el más antiguo hasta el más reciente) limitado a los últimos 30 días registrados. Está formateado específicamente para alimentar de manera fácil gráficas de líneas, de barras o dashboards financieros.

* **Endpoint:** `GET /api/dolar/historial`
* **Respuesta Exitosa (`200 OK`):**
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

### 6. Configuración de Monedas
Retorna el arreglo dinámico con todas las propiedades visuales de las monedas (Íconos, Colores, Símbolos) para que la app frontend las renderice de forma automática.

* **Endpoint:** `GET /api/dolar/config`
* **Respuesta Exitosa (`200 OK`):** Un array JSON con la configuración de renderizado de cada moneda soportada.

---

## 💻 API Explorer Integrado (Frontend)

La página principal dejó de ser una simple calculadora. Si abres el endpoint principal en un navegador de escritorio o móvil, el servidor no retornará un JSON directamente, sino que renderizará automáticamente una aplicación visual estilo **API Explorer** que incluye:

- **Documentación Interactiva:** Un panel lateral (Sidebar) para navegar entre todos los endpoints disponibles (Tasa actual, Histórico, Calendario, Configuración).
- **Depurador en Tiempo Real:** Puedes ejecutar peticiones directamente desde la interfaz y ver la respuesta JSON formateada, con resaltado de sintaxis, simulando el comportamiento de herramientas como Postman o Swagger.
- **Formularios Dinámicos:** Los parámetros necesarios para endpoints específicos (como elegir el mes y año para el modo calendario o la fecha para el historial) se pueden ingresar mediante controles visuales intuitivos.

---

## 🧹 Mantenimiento Automático (Cron Jobs)

Para mantener la base de datos rápida y optimizar los costos de alojamiento, el sistema se "autolimpia".
Existe un cron job configurado para ejecutarse silenciosamente **el día 1 de cada mes a la medianoche**. 

Este proceso analiza la colección en MongoDB y **elimina de forma permanente cualquier registro histórico que tenga más de 1 año de antigüedad**. Esto previene el crecimiento descontrolado de la base de datos y mantiene los tiempos de consulta al mínimo.
