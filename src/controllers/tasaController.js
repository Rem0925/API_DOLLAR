import Tasa from '../models/Tasa.js';
import obtenerPrecioDolar from '../utils/scraper.js';

export const getTasas = async (req, res) => {
    try {
        const { fecha, modo, mes, anio } = req.query;

        // ---------------------------------------------------------
        // MODO 1: API DE CALENDARIO (Solo se ejecuta por AJAX)
        // ---------------------------------------------------------
        if (modo === 'calendario') {
            const year = parseInt(anio);
            const month = parseInt(mes); // 0 = Enero

            // Definir rango del mes solicitado
            const inicioMes = new Date(year, month, 1, 0, 0, 0);
            const finMes = new Date(year, month + 1, 0, 23, 59, 59)

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

        // A. Si piden fecha histórica
        if (fecha) {
            const partes = fecha.split('-');
            const year = parseInt(partes[0]);
            const month = parseInt(partes[1]) - 1; 
            const day = parseInt(partes[2]);

            // Creamos la fecha usando argumentos numéricos -> HORA LOCAL
            const inicioDia = new Date(year, month, day, 0, 0, 0, 0);
            const finDia = new Date(year, month, day, 23, 59, 59, 999);

            tasaData = await Tasa.findOne({
                fechaActualizacion: { $gte: inicioDia, $lte: finDia }
            }).sort({ fechaActualizacion: -1 });
        } 
        // B. Si es Home (Último precio)
        else {
            tasaData = await Tasa.findOne().sort({ fechaActualizacion: -1 });

            // Lógica de actualización automática si la data es vieja (> 1h)
            const ahora = new Date();
            const ultimaActualizacion = tasaData ? new Date(tasaData.fechaActualizacion) : null;
            const horasDiferencia = ultimaActualizacion ? (ahora - ultimaActualizacion) / (1000 * 60 * 60) : 999;

            if (!tasaData || horasDiferencia > 4.0) {
                const liveData = await obtenerPrecioDolar();
                
                if (!liveData.error) {
                    const nuevaFecha = new Date();
                    const nuevoDoc = {
                        bcv: parseFloat(liveData.bcv),
                        binance: parseFloat(liveData.binance),
                        euro: parseFloat(liveData.euro),
                        fechaActualizacion: nuevaFecha
                    };
                    
                    try {
                        await Tasa.create(nuevoDoc);
                        tasaData = nuevoDoc;
                    } catch (e) {
                        // Si falla el guardado (duplicado), mostramos el objeto igual
                        tasaData = nuevoDoc; 
                    }
                }
            }
        }

        // Preparar respuesta para la vista
        const resultado = tasaData ? {
            fecha: new Date(tasaData.fechaActualizacion).toLocaleDateString('es-VE', { 
                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute:'2-digit'
            }),
            bcv: tasaData.bcv.toFixed(2),
            euro: tasaData.euro.toFixed(2),
            binance: tasaData.binance.toFixed(2),
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