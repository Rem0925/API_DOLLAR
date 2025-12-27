import cron from 'node-cron';
import Tasa from '../models/Tasa.js';
import obtenerPrecioDolar from '../utils/scraper.js';

export const iniciarCronJobs = () => {

    // 1. ACTUALIZACIÓN PROGRAMADA (13:00 y 16:00)
    cron.schedule('0 9,13,16,20 * * *', async () => {
        console.log('CRON: Buscando nuevos precios...');
        try {
            const datos = await obtenerPrecioDolar();
            if (!datos || datos.error) return;

            const ultimaTasa = await Tasa.findOne().sort({ fechaActualizacion: -1 });

            const nuevasTasas = {
                bcv: parseFloat(datos.bcv),
                binance: parseFloat(datos.binance),
                euro: parseFloat(datos.euro)
            };

            // Solo guarda si cambiaron los valores
            if (!ultimaTasa ||
                ultimaTasa.bcv !== nuevasTasas.bcv ||
                ultimaTasa.binance !== nuevasTasas.binance) {

                const ahora = new Date();
                const nuevoDoc = {
                    ...nuevasTasas,
                    fechaActualizacion: ahora
                };

                await Tasa.create(nuevoDoc);
                console.log(` Precios actualizados en Cron. ID: ${nuevoDoc._id}`);
            } else {
                console.log('Precios sin cambios');
            }
        } catch (error) {
            console.error('Error Cron Update:', error.message);
        }
    },{
        scheduled: true,
        timezone: "America/Caracas" // IMPORTANTE: Para asegurar que sean las horas de Venezuela
    });

    // 2. LIMPIEZA AUTOMÁTICA (Día 1 de cada mes)
    cron.schedule('0 0 1 * *', async () => {
        const fechaLimite = new Date();
        fechaLimite.setFullYear(fechaLimite.getFullYear() - 1);
        await Tasa.deleteMany({ fechaActualizacion: { $lt: fechaLimite } });
    }, {
        timezone: "America/Caracas"
    });
};