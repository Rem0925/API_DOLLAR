import Tasa from "../models/Tasa.js";
import ConfigMoneda from "../models/ConfigMoneda.js";
import PremiumCode from "../models/PremiumCode.js";
import obtenerPrecioDolar from "../utils/scraper.js";

const obtenerUltimoCheckpoint = () => {
  const ahora = new Date().toLocaleString("en-US", {
    timeZone: "America/Caracas",
  });
  const fechaActual = new Date(ahora);
  const horarios = [9, 13, 16, 20];
  let ultimoCheckpoint = null;

  for (let hora of horarios) {
    let candidato = new Date(fechaActual);
    candidato.setHours(hora, 0, 0, 0);
    if (fechaActual >= candidato) {
      ultimoCheckpoint = candidato;
    }
  }

  if (!ultimoCheckpoint) {
    ultimoCheckpoint = new Date(fechaActual);
    ultimoCheckpoint.setDate(ultimoCheckpoint.getDate() - 1);
    ultimoCheckpoint.setHours(20, 0, 0, 0);
  }
  return ultimoCheckpoint;
};

export const getTasas = async (req, res) => {
  try {
    const { fecha, modo, mes, anio, proximo } = req.query;

    const ahoraVzla = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Caracas" }),
    );
    const finHoy = new Date(ahoraVzla);
    finHoy.setHours(23, 59, 59, 999); // Límite para detectar tasas "futuras"

    const diaSemana = ahoraVzla.getDay(); // 0=Dom, 5=Vie, 6=Sáb
    const esFinDeSemana = diaSemana === 5 || diaSemana === 6 || diaSemana === 0;

    // --- MODO CALENDARIO: Busca en ambos campos para no perder días ---
    if (modo === 'calendario') {
        const year = parseInt(anio);
        const month = parseInt(mes);
        const inicioMes = new Date(Date.UTC(year, month, 1, 4, 0, 0, 0));
        // Cambiamos a $lt (menor estricto) para no incluir el primer milisegundo del mes siguiente
        const finMes = new Date(Date.UTC(year, month + 1, 1, 4, 0, 0, 0));

        const registros = await Tasa.find({
            $or: [
                { fechaActualizacion: { $gte: inicioMes, $lt: finMes } },
                { fechaValor: { $gte: inicioMes, $lt: finMes } }
            ]
        }).select('fechaActualizacion fechaValor');

        // Formateador estricto para la zona horaria de Caracas
        const formatter = new Intl.DateTimeFormat('es-VE', { 
            timeZone: 'America/Caracas', 
            day: 'numeric' 
        });

        const diasConData = new Set();

        registros.forEach(r => {
            // Todo en un solo IF: Que exista la fecha Y esté dentro del mes Y NO sea del futuro
            if (r.fechaActualizacion && r.fechaActualizacion >= inicioMes && r.fechaActualizacion < finMes && r.fechaActualizacion <= finHoy) {
                diasConData.add(parseInt(formatter.format(new Date(r.fechaActualizacion))));
            }
            
            // Lo mismo para la fechaValor
            if (r.fechaValor && r.fechaValor >= inicioMes && r.fechaValor < finMes && r.fechaValor <= finHoy) {
                diasConData.add(parseInt(formatter.format(new Date(r.fechaValor))));
            }
        });
        
        const diasOrdenados = [...diasConData].sort((a, b) => a - b);
        return res.json({ dias: diasOrdenados });
    }

    let tasaData;

    if (fecha) {
      // Búsqueda histórica: Prioriza registros guardados en ese día, con fallback a fechaValor
      const partes = fecha.split("-");
      const year = parseInt(partes[0]);
      const month = parseInt(partes[1]) - 1;
      const day = parseInt(partes[2]);
      const inicioDia = new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
      const finDia = new Date(Date.UTC(year, month, day + 1, 4, 0, 0, 0));

      tasaData = await Tasa.findOne({
        fechaActualizacion: { $gte: inicioDia, $lt: finDia },
      }).sort({ fechaActualizacion: -1 });

      if (!tasaData) {
        tasaData = await Tasa.findOne({
          fechaValor: { $gte: inicioDia, $lt: finDia },
        }).sort({ fechaValor: -1, fechaActualizacion: -1 });
      }
    } else {
      const ultimoRegistro = await Tasa.findOne().sort({
        fechaActualizacion: -1,
      });

      if (proximo === "true") {
        tasaData = ultimoRegistro;
      } else {
        // Si el registro más nuevo es para una fecha futura (mañana o próximo día hábil)
        if (
          ultimoRegistro &&
          ultimoRegistro.fechaValor > finHoy
        ) {
          const registroVigente = await Tasa.findOne({
            fechaValor: { $lte: finHoy },
          }).sort({ fechaValor: -1, fechaActualizacion: -1 });

          if (registroVigente) {
            // COMBINACIÓN: Usamos Binance del registro más nuevo, pero BCV/Euro del registro vigente hoy.
            tasaData = {
              ...ultimoRegistro.toObject(),
              bcv: registroVigente.bcv,
              euro: registroVigente.euro,
              fechaValor: registroVigente.fechaValor,
            };
          } else {
            tasaData = ultimoRegistro;
          }
        } else {
          // Si no es fecha futura, usamos el último normal
          tasaData = ultimoRegistro;
        }
      }

      const debeHaberActualizado = obtenerUltimoCheckpoint();
      const fechaUltimaBD = tasaData
        ? new Date(tasaData.fechaActualizacion)
        : new Date(0);

      if (
        !tasaData ||
        (proximo !== "true" && fechaUltimaBD < debeHaberActualizado)
      ) {
        const liveData = await obtenerPrecioDolar();
        if (!liveData.error) {
          const nuevoDoc = {
            bcv: parseFloat(liveData.bcv),
            binance: parseFloat(liveData.binance),
            binance_venta: parseFloat(liveData.binance_venta || liveData.binance), 
            euro: parseFloat(liveData.euro),
            cop: parseFloat(liveData.cop) || null,
            clp: parseFloat(liveData.clp) || null,
            brl: parseFloat(liveData.brl) || null,
            mxn: parseFloat(liveData.mxn) || null,
            fechaActualizacion: new Date(),
            fechaValor: liveData.fechaValor,
          };
          try {
            const creado = await Tasa.create(nuevoDoc);
            // Aplicar fusión inmediata si el nuevo registro es futuro
            if (creado.fechaValor > finHoy && proximo !== "true") {
              const vig = await Tasa.findOne({
                fechaValor: { $lte: finHoy },
              }).sort({ fechaValor: -1 });
              tasaData = vig
                ? {
                    ...creado.toObject(),
                    bcv: vig.bcv,
                    euro: vig.euro,
                    fechaValor: vig.fechaValor,
                  }
                : creado;
            } else {
              tasaData = creado;
            }
          } catch (e) {
            tasaData = nuevoDoc;
          }
        }
      }
    }

    const tasaFutura = await Tasa.findOne({
      fechaValor: { $gt: ahoraVzla },
    }).sort({ fechaValor: 1 });

    // --- LÓGICA INTELIGENTE PARA MOSTRAR LA FECHA CORRECTA ---
    let fechaParaMostrar = tasaData ? new Date(tasaData.fechaActualizacion) : new Date();

    if (tasaData) {
        if (fecha) {
            // Aplicando tu idea: Forzamos la fecha exacta que pidió la App en el calendario
            const partes = fecha.split('-');
            const year = parseInt(partes[0]);
            const month = parseInt(partes[1]) - 1;
            const day = parseInt(partes[2]);
            
            // Creamos la fecha al mediodía (12:00) UTC. Así, cuando el formateador de Caracas 
            // le reste 4 horas, seguirán siendo las 08:00 AM del MISMO DÍA, 
            // garantizando 100% que nunca brincará al día anterior o siguiente en la App.
            fechaParaMostrar = new Date(Date.UTC(year, month, day, 12, 0, 0));
        } else if (proximo === 'true') {
            // Si estamos viendo la tasa del lunes por adelantado, mostramos la fecha del lunes
            fechaParaMostrar = new Date(tasaData.fechaValor);
        }
    }

    const resultado = tasaData ? {
        // Usamos 'fechaParaMostrar' para el Día/Mes/Año y 'fechaActualizacion' para la Hora exacta
        fecha: `${fechaParaMostrar.toLocaleDateString('es-VE', { 
            day: '2-digit', 
            month: '2-digit', 
            year: '2-digit', 
            timeZone: 'America/Caracas'
        })} - ${new Date(tasaData.fechaActualizacion).toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Caracas'
        })}`,
        bcv: tasaData.bcv.toFixed(2),
        binance: tasaData.binance.toFixed(2),
        binance_venta: tasaData.binance_venta ? tasaData.binance_venta.toFixed(2) : tasaData.binance.toFixed(2),
        euro: tasaData.euro.toFixed(2),
        cop: tasaData.cop ? tasaData.cop.toFixed(2) : null,
        clp: tasaData.clp ? tasaData.clp.toFixed(2) : null,
        brl: tasaData.brl ? tasaData.brl.toFixed(4) : null,
        mxn: tasaData.mxn ? tasaData.mxn.toFixed(2) : null,
        tieneProximo: !!tasaFutura && proximo !== "true",
        esTasaProxima: proximo === "true",
        conversion: {}
    } : {};

    res.format({
      json: () => res.json(resultado),
      html: () =>
        res.render("index", {
          precios: resultado,
          error: null,
          fechaBusqueda: fecha,
        }),
      default: () => res.json(resultado),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error de servidor" });
  }
};

// --- FUNCIÓN DE GRÁFICA CORREGIDA PARA DATOS MIXTOS ---
export const getHistorialGrafica = async (req, res) => {
  try {
    const historial = await Tasa.aggregate([
      // 1. Ordenamos por fechaValor
      { $sort: { fechaValor: -1 } },
      // 2. Agrupamos por día
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$fechaValor",
              timezone: "America/Caracas",
            },
          },
          bcv: { $first: "$bcv" },
          binance: { $first: "$binance" },
          binance_venta: { $first: "$binance_venta" },
          euro: { $first: "$euro" },
          cop: { $first: "$cop" },
          clp: { $first: "$clp" },
          brl: { $first: "$brl" },
          mxn: { $first: "$mxn" },
          fechaReferencia: { $first: "$fechaValor" },
        },
      },
      // 3. Ordenamos de más nuevo a más viejo para el límite
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]);

    // 4. Invertimos para que la gráfica se dibuje de izquierda a derecha
    const dataGrafica = historial.reverse().map((t) => ({
      fecha: new Date(t.fechaReferencia).toLocaleDateString("es-VE", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Caracas",
      }),
      bcv: t.bcv,
      binance: t.binance,
      binance_venta: t.binance_venta || t.binance, 
      euro: t.euro,
      cop: t.cop,
      clp: t.clp,
      brl: t.brl,
      mxn: t.mxn,
    }));

    res.json(dataGrafica);
  } catch (error) {
    console.error("Error en API Historial:", error);
    res.status(500).json({ error: "Error obteniendo historial" });
  }
};

export const getConfigMonedas = async (req, res) => {
  try {
    const config = await ConfigMoneda.find({}, { _id: 0, __v: 0 }); // Excluye _id y __v para un JSON más limpio
    res.json(config);
  } catch (error) {
    console.error("Error obteniendo configuración:", error);
    res.status(500).json({ error: "Error obteniendo configuración de monedas" });
  }
};

export const activateVip = async (req, res) => {
  try {
    const { token, deviceId } = req.body;

    if (!token || !deviceId) {
      return res.status(400).json({ error: "Faltan datos requeridos (token, deviceId)" });
    }

    const premium = await PremiumCode.findOne({ code: token });

    if (!premium || !premium.isActive) {
      return res.status(400).json({ error: "Código premium inválido o inactivo" });
    }

    if (premium.linkedDeviceId === null) {
      premium.linkedDeviceId = deviceId;
      await premium.save();
      return res.status(200).json({ message: "Dispositivo vinculado exitosamente" });
    }

    if (premium.linkedDeviceId === deviceId) {
      return res.status(200).json({ message: "Dispositivo ya estaba vinculado" });
    }

    // Si el linkedDeviceId no coincide, rechazamos la petición
    return res.status(403).json({ error: "El código ya está vinculado a otro dispositivo" });

  } catch (error) {
    console.error("Error en activateVip:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const linkVip = (req, res) => {
  const { token } = req.params;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Activando VeGreen Premium...</title>
    <style>
        body {
            background-color: #121212;
            color: #E5E7EB;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        h2 { margin-bottom: 20px; }
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(229, 231, 235, 0.2);
            border-left-color: #10B981;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        #openBtn {
            background-color: #10B981;
            color: #121212;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="spinner"></div>
    <h2>Activando VeGreen Premium...</h2>
    <a href="vegreen://vip?token=${token}" id="openBtn" style="display: none;">Abrir en la App</a>

    <script>
        window.location.replace("vegreen://vip?token=${token}");
        setTimeout(() => {
            document.getElementById('openBtn').style.display = 'block';
        }, 1500);
    </script>
</body>
</html>
  `;
  res.send(html);
};