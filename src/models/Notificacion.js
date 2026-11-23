import mongoose from "mongoose";

const notificacionSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["tasa_proxima", "alza_moneda"],
    required: true,
  },
  titulo: { type: String, required: true },
  cuerpo: { type: String, required: true },
  datos: { type: mongoose.Schema.Types.Mixed, default: {} },
  fechaCreacion: { type: Date, default: Date.now, index: true },
});

const Notificacion = mongoose.model("Notificacion", notificacionSchema);

export default Notificacion;
