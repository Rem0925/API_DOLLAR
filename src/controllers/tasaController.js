import Tasa from "../models/Tasa.js";
import ConfigMoneda from "../models/ConfigMoneda.js";
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
      // Búsqueda histórica: Prioriza fechaValor, cae en fechaActualizacion
      const partes = fecha.split("-");
      const year = parseInt(partes[0]);
      const month = parseInt(partes[1]) - 1;
      const day = parseInt(partes[2]);
      const inicioDia = new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
      const finDia = new Date(Date.UTC(year, month, day + 1, 4, 0, 0, 0));

      tasaData = await Tasa.findOne({
        $or: [
          { fechaValor: { $gte: inicioDia, $lte: finDia } },
          { fechaActualizacion: { $gte: inicioDia, $lte: finDia } },
        ],
      }).sort({ fechaValor: -1, fechaActualizacion: -1 });
    } else {
      const ultimoRegistro = await Tasa.findOne().sort({
        fechaActualizacion: -1,
      });

      if (proximo === "true") {
        tasaData = ultimoRegistro;
      } else {
        // MODO NORMAL (Viernes/Fin de semana)
        if (
          ultimoRegistro &&
          ultimoRegistro.fechaValor > finHoy &&
          esFinDeSemana
        ) {
          const registroVigente = await Tasa.findOne({
            fechaValor: { $lte: finHoy },
          }).sort({ fechaValor: -1, fechaActualizacion: -1 });

          if (registroVigente) {
            // C. COMBINACIÓN MÁGICA:
            // Usamos Binance del registro más nuevo, pero BCV/Euro del registro del viernes.
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
        tieneProximo: esFinDeSemana && !!tasaFutura && proximo !== "true",
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