import mongoose from 'mongoose';

const tasaSchema = new mongoose.Schema({
    bcv: { type: Number, required: true },
    binance: { type: Number, required: true },
    binance_venta: { type: Number, required: false },
    euro: { type: Number, required: true },
    cop: { type: Number, required: false },
    clp: { type: Number, required: false },
    brl: { type: Number, required: false },
    mxn: { type: Number, required: false },
    fechaActualizacion: { type: Date, default: Date.now, index: true },
    fechaValor: { type: Date, required: true, index: true }
}); 

const Tasa = mongoose.model('Tasa', tasaSchema);

export default Tasa;