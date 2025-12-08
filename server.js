import express from 'express'; 
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import obtenerPrecioDolar from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json());

app.get('/api/dolar/ves', async (req, res) => {

    const monto_usd = req.query.Usd ? parseFloat((req.query.Usd).replace(',', '.').trim()) : 0;
    const monto_bs = req.query.Bs ? parseFloat((req.query.Bs).replace(',', '.').trim()) : 0;
    const monto_usdt = req.query.Usdt ? parseFloat((req.query.Usdt).replace(',', '.').trim()) : 0;
    const monto_eu = req.query.Eu ? parseFloat((req.query.Eu).replace(',', '.').trim()) : 0;


    if ((req.query.Usd && isNaN(monto_usd)) || 
        (req.query.Bs && isNaN(monto_bs)) || 
        (req.query.Usdt && isNaN(monto_usdt)) || 
        (req.query.Eu && isNaN(monto_eu))) {
        return res.status(400).json({ error: "Los parámetros de monto deben ser números válidos." });
    }

    const resultado = await obtenerPrecioDolar(monto_usd, monto_bs, monto_usdt, monto_eu);

    if (resultado.error) {
        return res.status(500).format({
            json: () => res.json(resultado),
            html: () => res.render('index', { precios: {}, error: resultado.error })
        });
    }

    res.format({
        json: function () {
            res.status(200).json(resultado);
        },
        
        html: function () {
            res.render('index', { 
                precios: resultado, 
                error: null 
            });
        },
        
        default: function () {
            res.status(200).json(resultado);
        }
    });
});

app.get('/', (req, res) => {
    res.redirect('/api/dolar/ves');
});

app.listen(PORT, () => {
    console.log(`🚀 API lista en http://localhost:${PORT}/api/dolar/ves`);
});