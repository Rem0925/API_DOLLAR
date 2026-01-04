import Tasa from '../models/Tasa.js';
import obtenerPrecioDolar from '../utils/scraper.js';

const obtenerUltimoCheckpoint = () => {
    // Hora actual en Venezuela
    const ahora = new Date().toLocaleString("en-US", { timeZone: "America/Caracas" });
    const fechaActual = new Date(ahora);
    
    // Horarios de actualización definidos (9, 13, 16, 20)
    const horarios = [9, 13, 16, 20];
    
    let ultimoCheckpoint = null;

    // Buscamos el horario más reciente que ya pasó hoy
    for (let hora of horarios) {
        let candidato = new Date(fechaActual);
        candidato.setHours(hora, 0, 0, 0); // Ajustamos a la hora exacta (ej: 09:00:00)

        // Si la hora actual es mayor o igual al candidato, ese es un posible checkpoint
        if (fechaActual >= candidato) {
            ultimoCheckpoint = candidato;
        }
    }

    // Si no ha pasado ninguna hora hoy (ej: son las 8:00 AM),
    // el último checkpoint fue ayer a las 20:00
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

        // ---------------------------------------------------------
        // MODO 1: API DE CALENDARIO (Solo se ejecuta por AJAX)
        // ---------------------------------------------------------
        if (modo === 'calendario') {
            const year = parseInt(anio);
            const month = parseInt(mes); // 0 = Enero

            // Definir rango del mes solicitado
            const inicioMes = new Date(Date.UTC(year, month, 1, 4, 0, 0, 0));
            const finMes = new Date(Date.UTC(year, month + 1, 1, 4, 0, 0, 0));

            // Búsqueda optimizada: Solo traemos el campo fechaActualizacion
            // Esto es muy ligero para la BD
            const registros = await Tasa.find({
                fechaActualizacion: { $gte: inicioMes, $lte: finMes }
            }).select('fechaActualizacion');

            // Extraemos solo el día del mes (1, 5, 20...)
            const diasConData = registros.map(r => new Date(r.fechaActualizacion).getDate());
            
            // Eliminamos duplicados
            const diasUnicos = [...new Set(diasConData)];

            return res.json({ dias: diasUnicos });
        }

        // ---------------------------------------------------------
        // MODO 2: RENDERIZADO DE PÁGINA (Carga Normal)
        // ---------------------------------------------------------
        let tasaData;
        const ahoraVzla = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Caracas" }));
        ahoraVzla.setHours(0, 0, 0, 0);

        // A. Si piden fecha histórica
        if (fecha) {
            const partes = fecha.split('-');
            const year = parseInt(partes[0]);
            const month = parseInt(partes[1]) - 1; 
            const day = parseInt(partes[2]);

            // Creamos la fecha usando argumentos numéricos -> HORA LOCAL
            const inicioDia = new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
            const finDia = new Date(Date.UTC(year, month, day + 1, 4, 0, 0, 0));

            tasaData = await Tasa.findOne({
                fechaActualizacion: { $gte: inicioDia, $lte: finDia }
            }).sort({ fechaActualizacion: -1 });
        } 
        // B. Si es Home (Último precio)
        else {
            if(proximo === "true"){
                tasaData = await Tasa.findOne().sort({ fechaValor: -1 });
            }else{
                tasaData = await Tasa.findOne().sort({ fechaActualizacion: -1 });
            }
            // 1. Calculamos cuándo debió ser la última actualización según horario Vzla
            const debeHaberActualizado = obtenerUltimoCheckpoint();
            
            // 2. Verificamos la fecha que tenemos en BD (convertimos a objeto Date js)
            const fechaUltimaBD = tasaData ? new Date(tasaData.fechaActualizacion) : new Date(0);

            // 3. CONDICIÓN: Si no hay datos O la data en BD es más vieja que el último checkpoint
            // Ejemplo: Son las 10am, el checkpoint fue 9am. Si en BD dice 8am, entra aquí.
            if (!tasaData || fechaUltimaBD < debeHaberActualizado) {
                
                console.log("⚠️ Detectada falta de actualización (Fallo de Cron). Actualizando...");
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
                        console.log("✅ Recuperación exitosa en Controller");
                    } catch (e) {
                        tasaData = nuevoDoc; 
                    }
                }
            }
        }
        const tasaFutura = await Tasa.findOne({
            fechaValor: { $gt: ahoraVzla }
        }).sort({ fechaValor: 1 });
        // Preparar respuesta para la vista
        const resultado = tasaData ? {
            // Mostramos la fecha para la cual es VÁLIDO el precio
            fecha: new Date(tasaData.fechaValor || tasaData.fechaActualizacion).toLocaleString('es-VE', { 
                day: '2-digit', month: '2-digit', year: '2-digit', 
                timeZone: 'America/Caracas'
            }),
            bcv: tasaData.bcv.toFixed(2),
            euro: tasaData.euro.toFixed(2),
            binance: tasaData.binance.toFixed(2),
            tieneProximo: !!tasaFutura && proximo !== 'true', // Indica si hay una tasa del lunes oculta
            esTasaProxima: proximo === 'true',
            conversion: {}
        } : {};

        // Cálculos de conversión si existen parámetros
        if (tasaData) {
            const monto_usd = req.query.Usd ? parseFloat((req.query.Usd).replace(',', '.').trim()) : 0;
            const monto_bs = req.query.Bs ? parseFloat((req.query.Bs).replace(',', '.').trim()) : 0;
            const monto_usdt = req.query.Usdt ? parseFloat((req.query.Usdt).replace(',', '.').trim()) : 0;
            const monto_eu = req.query.Eu ? parseFloat((req.query.Eu).replace(',', '.').trim()) : 0;

            if (monto_bs > 0) resultado.conversion.bcv_total_ves = (monto_bs / tasaData.bcv).toFixed(2);
            else if (monto_usd > 0) resultado.conversion.bcv_total_usd = (tasaData.bcv * monto_usd).toFixed(2);
            else if (monto_usdt > 0) resultado.conversion.bcv_total_usdt = (tasaData.binance * monto_usdt).toFixed(2);
            else if (monto_eu > 0) resultado.conversion.bcv_total_eur = (tasaData.euro * monto_eu).toFixed(2);
        }

        // Renderizar sin datos de calendario (se pedirán después)
        res.format({
            json: () => res.json(resultado),
            html: () => res.render('index', { 
                precios: resultado, 
                error: (!tasaData && fecha) ? `No hay datos para ${fecha}` : null,
                fechaBusqueda: fecha 
            }),
            default: () => res.json(resultado)
        });

    } catch (error) {
        console.error(error);
        if(req.query.modo === 'calendario') {
            return res.status(500).json({ error: 'Error interno obteniendo calendario' });
        }
        res.render('index', { precios: {}, error: "Error de servidor" , fechaBusqueda: null});
    }
};

export const getHistorialGrafica = async (req, res) => {
    try {
        const historial = await Tasa.aggregate([
            // 1. Ordenar por fecha descendente para que el $group tome el primero (más reciente)
            { $sort: { fechaValor: -1, fechaActualizacion: -1} },
            // 2. Agrupar por Día, Mes y Año (usando la zona horaria de Venezuela)
            {
                $group: {
                    _id: { 
                        $dateToString: { 
                            format: "%Y-%m-%d", 
                            date: "$fechaValor", 
                            timezone: "America/Caracas" 
                        } 
                    },
                    // Tomamos el primer documento de cada día (el más nuevo de ese día)
                    bcv: { $first: "$bcv" },
                    binance: { $first: "$binance" },
                    euro: { $first: "$euro" },
                    fechaValor: { $first: "$fechaValor" }
                }
            },
            // 3. Volver a ordenar por fecha para que el límite sea de los días más recientes
            { $sort: { fechaValor: -1 } },
            // 4. Ahora sí, limitamos a 30 DÍAS ÚNICOS
            { $limit: 30 }
        ]);
            
        // Reordenamos para la gráfica (antiguo -> nuevo)
        const dataGrafica = historial.reverse().map(t => ({
            fecha: new Date(t.fechaValor).toLocaleDateString('es-VE', { 
                day: '2-digit', 
                month: '2-digit',
                timeZone: 'America/Caracas' // Importante mantener consistencia
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