import Tasa from '../models/Tasa.js';
import obtenerPrecioDolar from '../utils/scraper.js';

export const getTasas = async (req, res) => {
    try {
        // 1. Buscar en BD
        let tasaData = await Tasa.findOne().sort({ fechaActualizacion: -1 });

        // Fallback: Si la BD está vacía, scrapear al momento
        if (!tasaData) {
            const liveData = await obtenerPrecioDolar();
            if (!liveData.error) {
                tasaData = {
                    bcv: parseFloat(liveData.bcv),
                    binance: parseFloat(liveData.binance),
                    euro: parseFloat(liveData.euro),
                    fechaActualizacion: new Date()
                };
                await Tasa.create(tasaData); // Guardar para la próxima
            }
        }

        if (!tasaData) return res.status(503).send("Servicio iniciando...");

        // 2. Calcular conversiones (lo que hacía tu server.js antes)
        const monto_usd = req.query.Usd ? parseFloat((req.query.Usd).replace(',', '.').trim()) : 0;
        const monto_bs = req.query.Bs ? parseFloat((req.query.Bs).replace(',', '.').trim()) : 0;
        const monto_usdt = req.query.Usdt ? parseFloat((req.query.Usdt).replace(',', '.').trim()) : 0;
        const monto_eu = req.query.Eu ? parseFloat((req.query.Eu).replace(',', '.').trim()) : 0;

        // Objeto compatible con tu index.ejs original
        const resultado = {
            fecha: new Date(tasaData.fechaActualizacion).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit'}),
            bcv: tasaData.bcv.toFixed(2),
            euro: tasaData.euro.toFixed(2),
            binance: tasaData.binance.toFixed(2),
            conversion: {}
        };

        if (monto_bs > 0) resultado.conversion.bcv_total_ves = (monto_bs / tasaData.bcv).toFixed(2);
        else if (monto_usd > 0) resultado.conversion.bcv_total_usd = (tasaData.bcv * monto_usd).toFixed(2);
        else if (monto_usdt > 0) resultado.conversion.bcv_total_usdt = (tasaData.binance * monto_usdt).toFixed(2);
        else if (monto_eu > 0) resultado.conversion.bcv_total_eur = (tasaData.euro * monto_eu).toFixed(2);

        // 3. Renderizar la vista
        res.format({
            json: () => res.json(resultado),
            html: () => res.render('index', { precios: resultado, error: null }), // Aquí cargamos tu vista
            default: () => res.json(resultado)
        });

    } catch (error) {
        console.error(error);
        res.render('index', { precios: {}, error: "Error de servidor" });
    }
};