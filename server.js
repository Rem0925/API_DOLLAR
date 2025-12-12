import express from 'express'; 
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import { iniciarCronJobs } from './src/jobs/cronJob.js';
import { getTasas } from './src/controllers/tasaController.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Conectar BD y Cron
connectDB();
iniciarCronJobs();

// 2. Configurar Motor de Vistas (EJS)
app.set('view engine', 'ejs');
// Apuntamos a la carpeta views en la raíz
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json());

// 3. Rutas
app.get('/api/dolar/ves', getTasas);

app.get('/', (req, res) => {
    res.redirect('/api/dolar/ves');
});

app.listen(PORT, () => {
    console.log(`🚀 API Dolar corriendo en http://localhost:${PORT}`);
});