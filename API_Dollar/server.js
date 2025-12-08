import express from 'express'; 
import cors from 'cors';
import obtenerPrecioDolar from './scraper.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/api/dolar/ves', async (req, res) => {
    const monto_usd = req.query.montoUsd ?  parseFloat((req.query.montoUsd).replace(',', '.').trim()) : 0;
    const monto_bs = req.query.montoBs ? parseFloat((req.query.montoBs).replace(',', '.').trim()) : 0;
    const monto_usdt = req.query.montoUsdt ? parseFloat((req.query.montoUsdt).replace(',', '.').trim()) : 0;

    if ((req.query.montoUsd && isNaN(monto_usd)) && (req.query.montoBs && isNaN(monto_bs))) {
        return res.status(400).json({ error: "El parámetro 'montoUsd, montoBs, montoUsdt' debe ser un número." });
    }

    const resultado = await obtenerPrecioDolar(monto_usd,monto_bs,monto_usdt);

    if (resultado.error) {
        return res.status(500).json(resultado);
    }

    return res.status(200).json(resultado);
});

app.listen(PORT, () => {
    console.log(`🚀 API lista en http://localhost:${PORT}/api/dolar/ves`);
});