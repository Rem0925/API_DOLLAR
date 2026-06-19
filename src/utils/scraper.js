import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import https from 'https';

const URL_BCV = 'https://www.bcv.org.ve/';
const URL_BINANCE = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const URL_TRM = process.env.TRM_API_URL;
const URL_CLP = process.env.CLP_API_URL;
const URL_BRL = process.env.BRL_API_URL;
const URL_MXN = process.env.MXN_API_URL;

const agent = new https.Agent({ rejectUnauthorized: false });

let cacheDolarApi = {};

async function obtenerDesdeDolarApi(url) {
    try {
        const response = await fetch(url, { timeout: 10000 });
        if (response.ok) {
            const data = await response.json();
            // mx/cl usan "venta", br usa "venda", co usa "valor"
            const valor = data.venta || data.venda || data.valor;
            if (valor) {
                cacheDolarApi[url] = parseFloat(valor);
                return cacheDolarApi[url];
            }
        }
    } catch (error) {
        // Silencioso, si falla retorna el caché
    }
    return cacheDolarApi[url] || null;
}

async function obtenerPromedioBinance(tradeType = "BUY") {
    try {
        const headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
        };

        const payload = {
            "asset": "USDT",
            "fiat": "VES",
            "merchantCheck": false,
            "page": 1,
            "payTypes": [], 
            "publisherType": null,
            "rows": 10, 
            "tradeType": tradeType
        };

        const respuesta = await fetch(URL_BINANCE, { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await respuesta.json();

        if (data.data && data.data.length > 0) {
            const precios = data.data.map(ad => parseFloat(ad.adv.price));
            const suma = precios.reduce((a, b) => a + b, 0);
            return (suma / precios.length);
        }
        return null;
    } catch (error) {
        console.error(`Error en Binance ${tradeType}:`, error.message);
        return null;
    }
}

async function obtenerPrecioDolar() {
    try {
        // --- 1. PETICIONES EN FILA INDIA PARA NO ALERTAR A BINANCE EN RENDER ---
        const respuestaBCV = await fetch(URL_BCV, { agent });
        
        const precioBinanceCompra = await obtenerPromedioBinance("BUY");
        
        // Pausa táctica de 1.5 segundos para parecer un humano
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const precioBinanceVenta = await obtenerPromedioBinance("SELL");
        
        const trm = await obtenerDesdeDolarApi(URL_TRM);
        const clp = await obtenerDesdeDolarApi(URL_CLP);
        const brl = await obtenerDesdeDolarApi(URL_BRL);
        const mxn = await obtenerDesdeDolarApi(URL_MXN);

        // --- LÓGICA BCV ---
        const dataBCV = await respuestaBCV.text();
        const $ = cheerio.load(dataBCV);

        const selectorPrecioEu = '#euro .centrado strong';
        const selectorPrecio = '#dolar .centrado strong'; 
        const selectorFechaValor = '.date-display-single';

        const elementoPrecio = $(selectorPrecio).first();
        const elementoPrecioEu = $(selectorPrecioEu).first();
        const elementoFecha = $(selectorFechaValor).first();

        const fechaISO = elementoFecha.attr('content'); 
        let fechaValorFinal = fechaISO ? new Date(fechaISO) : new Date();

        let resultado = {
            fecha: new Date().toLocaleString('es-VE', { 
                day: '2-digit', month: '2-digit', year: '2-digit',
                timeZone: 'America/Caracas' 
            }),
            fuente_bcv: `Banco Central de Venezuela`,
            fuente_binance: `Binance P2P (Promedio 10 órdenes)`,
            bcv: null,
            euro: null,
            binance: null,
            binance_venta: null, 
            cop: null,
            clp: null,
            brl: null,
            mxn: null,
            fechaValor: fechaValorFinal
        };

        if (elementoPrecio.length > 0 && elementoPrecioEu.length > 0) {
            let precioStr = elementoPrecio.text().trim();
            let percioEu = elementoPrecioEu.text().trim();
            let precioLimpioEu = parseFloat(percioEu.replace(',', '.').trim());
            let precioLimpio = precioStr.replace(',', '.').trim();
            const precioBCV = parseFloat(precioLimpio);
            
            if (!isNaN(precioBCV) && precioBinanceCompra !== null){
                resultado.bcv = precioBCV.toFixed(2);
                resultado.binance = precioBinanceCompra.toFixed(2);
                // Si por alguna razón extrema Binance vuelve a fallar, usa el de compra de respaldo
                resultado.binance_venta = precioBinanceVenta ? precioBinanceVenta.toFixed(2) : precioBinanceCompra.toFixed(2);
                resultado.euro = precioLimpioEu.toFixed(2);
                if (trm) resultado.cop = trm.toFixed(2);
                if (clp) resultado.clp = clp.toFixed(2);
                if (brl) resultado.brl = brl.toFixed(4); // usualmente BRL requiere más decimales, usamos 4
                if (mxn) resultado.mxn = mxn.toFixed(2);
            }
        }
        return resultado;

    } catch (error) {
        console.error("Error general:", error.message);
        return { error: `Error al obtener las tasas: ${error.message}` };
    }
}

export default obtenerPrecioDolar;