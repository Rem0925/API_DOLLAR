import mongoose from "mongoose";

const notificacionEstadoSchema = new mongoose.Schema({
  _id: { type: String, default: "global" },
  ultimaFechaValorBcvNotificada: { type: String, default: null },
  ultimoBcvNotificado: { type: Number, default: null },
  ultimoEuroNotificado: { type: Number, default: null },
  referenciasMonedas: { type: Map, of: Number, default: {} },
  ultimaActualizacion: { type: Date, default: Date.now },
});

const NotificacionEstado = mongoose.model(
  "NotificacionEstado",
  notificacionEstadoSchema,
);

export default NotificacionEstado;
