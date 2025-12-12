import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

//URLS
const URL_BCV = 'https://www.bcv.org.ve/'; 
const URL_BINANCE = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

async function obtenerPromedioBinance() {
    try {
        const headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        };

        const payload = {
            "asset": "USDT",
            "fiat": "VES",
            "merchantCheck": false,
            "page": 1,
            "payTypes": [], 
            "publisherType": null,
            "rows": 20, 
            "tradeType": "BUY"
        };

        const respuesta = await fetch(URL_BINANCE, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        const data = await respuesta.json();

        if (data.data && data.data.length > 0) {
            const precios = data.data.map(ad => parseFloat(ad.adv.price));
            const suma = precios.reduce((a, b) => a + b, 0);
            const promedio = (suma / precios.length);
            return promedio;
        }
        return null;

    } catch (error) {
        console.error("Error obteniendo Binance:", error.message);
        return null;
    }
}

async function obtenerPrecioDolar() {
    try {
        const [respuestaBCV, precioBinanceStr] = await Promise.all([
            fetch(URL_BCV),
            obtenerPromedioBinance()
        ]);

        // --- LÓGICA BCV ---
        const dataBCV = await respuestaBCV.text();
        const $ = cheerio.load(dataBCV);
        const selectorPrecioEu = '#euro .centrado strong';
        const selectorPrecio = '#dolar .centrado strong'; 
        const elementoPrecio = $(selectorPrecio).first();
        const elementoPrecioEu = $(selectorPrecioEu).first();
        
        // Objeto base de respuesta
        let resultado = {
            fecha: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit'}),
            fuente_bcv: `Banco Central de Venezuela`,
            fuente_binance: `Binance P2P (Promedio 10 órdenes)`,
            bcv: null,
            euro: null,
            binance: null,
        };

        // Procesar BCV
        if (elementoPrecio.length > 0 && elementoPrecioEu.length > 0) {
            let precioStr = elementoPrecio.text().trim();
            let percioEu = elementoPrecioEu.text().trim();
            let precioLimpioEu = parseFloat(percioEu.replace(',', '.').trim());
            let precioLimpio = precioStr.replace(',', '.').trim();
            const precioBCV = parseFloat(precioLimpio);
            const precioBinance = parseFloat(precioBinanceStr);

            if (!isNaN(precioBCV) && !isNaN(precioBinanceStr)){
                resultado.bcv = precioBCV.toFixed(2);
                resultado.binance = precioBinance.toFixed(2);
                resultado.euro = precioLimpioEu.toFixed(2);
            }
        }
        return resultado;

    } catch (error) {
        console.error("Error general:", error.message);
        return { 
            error: `Error al obtener las tasas: ${error.message}` 
        };
    }
}

export default obtenerPrecioDolar;