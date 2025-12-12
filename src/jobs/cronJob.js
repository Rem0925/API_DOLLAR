import cron from 'node-cron';
import Tasa from '../models/Tasa.js';
import obtenerPrecioDolar from '../utils/scraper.js';

export const iniciarCronJobs = () => {
    // Ejecutar a las 13:00 y 16:00 UTC (9 AM y 12 PM Venezuela aprox)
    cron.schedule('0 13,16 * * *', async () => {
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

            // Guardar solo si cambiaron los precios
            if (!ultimaTasa || 
                ultimaTasa.bcv !== nuevasTasas.bcv || 
                ultimaTasa.binance !== nuevasTasas.binance) {
                
                await Tasa.create(nuevasTasas);
                console.log('Precios actualizados en BD');
            } else {
                console.log('Precios sin cambios');
            }
        } catch (error) {
            console.error('Error Cron:', error.message);
        }
    });
};