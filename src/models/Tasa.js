import mongoose from 'mongoose';

const tasaSchema = new mongoose.Schema({
    bcv: { type: Number, required: true },
    binance: { type: Number, required: true },
    euro: { type: Number, required: true },
    fechaActualizacion: { type: Date, default: Date.now, index: true },
    fechaValor: { type: Date, required: true, index: true }
}); 

const Tasa = mongoose.model('Tasa', tasaSchema);

export default Tasa;