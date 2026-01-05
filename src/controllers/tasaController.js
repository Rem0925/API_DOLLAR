import Tasa from '../models/Tasa.js';
import obtenerPrecioDolar from '../utils/scraper.js';

const obtenerUltimoCheckpoint = () => {
    const ahora = new Date().toLocaleString("en-US", { timeZone: "America/Caracas" });
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

        // --- MODO CALENDARIO: Busca en ambos campos para no perder días ---
        if (modo === 'calendario') {
            const year = parseInt(anio);
            const month = parseInt(mes);
            const inicioMes = new Date(Date.UTC(year, month, 1, 4, 0, 0, 0));
            const finMes = new Date(Date.UTC(year, month + 1, 1, 4, 0, 0, 0));

            const registros = await Tasa.find({
                $or: [
                    { fechaActualizacion: { $gte: inicioMes, $lte: finMes } },
                    { fechaValor: { $gte: inicioMes, $lte: finMes } }
                ]
            }).select('fechaActualizacion fechaValor');

            const diasConData = registros.map(r => {
                const f = r.fechaValor || r.fechaActualizacion;
                return new Date(f).getDate();
            });
            
            return res.json({ dias: [...new Set(diasConData)] });
        }

        let tasaData;
        const ahoraVzla = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Caracas" }));
        ahoraVzla.setHours(0, 0, 0, 0);

        if (fecha) {
            // Búsqueda histórica: Prioriza fechaValor, cae en fechaActualizacion
            const partes = fecha.split('-');
            const year = parseInt(partes[0]);
            const month = parseInt(partes[1]) - 1; 
            const day = parseInt(partes[2]);
            const inicioDia = new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
            const finDia = new Date(Date.UTC(year, month, day + 1, 4, 0, 0, 0));

            tasaData = await Tasa.findOne({
                $or: [
                    { fechaValor: { $gte: inicioDia, $lte: finDia } },
                    { fechaActualizacion: { $gte: inicioDia, $lte: finDia } }
                ]
            }).sort({ fechaValor: -1, fechaActualizacion: -1 });
        } 
        else {
            if(proximo === "true"){
                tasaData = await Tasa.findOne({ fechaValor: { $exists: true } }).sort({ fechaValor: -1 });
            } else {
                tasaData = await Tasa.findOne().sort({ fechaActualizacion: -1 });
            }

            const debeHaberActualizado = obtenerUltimoCheckpoint();
            const fechaUltimaBD = tasaData ? new Date(tasaData.fechaActualizacion) : new Date(0);

            if (!tasaData || (proximo !== "true" && fechaUltimaBD < debeHaberActualizado)) {
                const liveData = await obtenerPrecioDolar();
                if (!liveData.error) {
                    const nuevoDoc = {
                        bcv: parseFloat(liveData.bcv),
                        binance: parseFloat(liveData.binance),
                        euro: parseFloat(liveData.euro),
                        fechaActualizacion: new Date(),
                        fechaValor: liveData.fechaValor
                    };
                    try {
                        await Tasa.create(nuevoDoc);
                        tasaData = nuevoDoc;
                    } catch (e) { tasaData = nuevoDoc; }
                }
            }
        }

        const tasaFutura = await Tasa.findOne({
            fechaValor: { $gt: ahoraVzla }
        }).sort({ fechaValor: 1 });

        const resultado = tasaData ? {
            fecha: new Date(tasaData.fechaValor || tasaData.fechaActualizacion).toLocaleString('es-VE', { 
                day: '2-digit', month: '2-digit', year: '2-digit', 
                timeZone: 'America/Caracas'
            }),
            bcv: tasaData.bcv.toFixed(2),
            euro: tasaData.euro.toFixed(2),
            binance: tasaData.binance.toFixed(2),
            tieneProximo: !!tasaFutura && proximo !== 'true',
            esTasaProxima: proximo === 'true',
            conversion: {}
        } : {};

        res.format({
            json: () => res.json(resultado),
            html: () => res.render('index', { precios: resultado, error: null, fechaBusqueda: fecha }),
            default: () => res.json(resultado)
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
            {
                // PASO 1: Aseguramos que los campos sean tratados como fechas y creamos la unificada
                $addFields: {
                    fechaConvertidaValor: { $toDate: "$fechaValor" },
                    fechaConvertidaAct: { $toDate: "$fechaActualizacion" }
                }
            },
            {
                $addFields: {
                    // Prioridad: fechaValor -> fechaActualizacion
                    fechaReal: { $ifNull: ["$fechaConvertidaValor", "$fechaConvertidaAct"] }
                }
            },
            // PASO 2: Ordenamos antes de agrupar para que $first agarre el registro más reciente del día
            { $sort: { fechaReal: -1 } },
            {
                // PASO 3: Agrupamos por año-mes-día en la zona horaria de Venezuela
                $group: {
                    _id: { 
                        $dateToString: { 
                            format: "%Y-%m-%d", 
                            date: "$fechaReal", 
                            timezone: "America/Caracas" 
                        } 
                    },
                    bcv: { $first: "$bcv" },
                    binance: { $first: "$binance" },
                    euro: { $first: "$euro" },
                    fechaReferencia: { $first: "$fechaReal" }
                }
            },
            // PASO 4: Ordenamos cronológicamente para el gráfico
            { $sort: { _id: -1 } },
            { $limit: 30 }
        ]);
            
        // Transformamos para el frontend
        const dataGrafica = historial.reverse().map(t => ({
            fecha: new Date(t.fechaReferencia).toLocaleDateString('es-VE', { 
                day: '2-digit', 
                month: '2-digit',
                timeZone: 'America/Caracas'
            }),
            bcv: t.bcv,
            binance: t.binance,
            euro: t.euro
        }));

        res.json(dataGrafica);
    } catch (error) {
        console.error("Error en API Historial:", error);
        res.status(500).json({ error: 'Error obteniendo historial' });
    }
};