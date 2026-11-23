import PushToken from "../models/PushToken.js";
import Notificacion from "../models/Notificacion.js";

const EXPO_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

export const registrarPushToken = async (req, res) => {
  try {
    const {
      token,
      platform = "android",
      muted = false,
      appVariant = "production",
    } = req.body || {};

    if (typeof token !== "string" || !EXPO_TOKEN_REGEX.test(token)) {
      return res.status(400).json({ error: "Token Expo inválido" });
    }

    const mutedBool = Boolean(muted);
    await PushToken.findOneAndUpdate(
      { token },
      {
        $set: {
          token,
          platform: String(platform || "android"),
          muted: mutedBool,
          appVariant: String(appVariant || "production"),
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    return res.json({ ok: true, muted: mutedBool });
  } catch (error) {
    console.error("Error en registrarPushToken:", error.message);
    return res.status(500).json({ error: "Error registrando token" });
  }
};

export const actualizarMutePush = async (req, res) => {
  try {
    const { token, muted } = req.body || {};

    if (typeof token !== "string" || !EXPO_TOKEN_REGEX.test(token)) {
      return res.status(400).json({ error: "Token Expo inválido" });
    }
    if (typeof muted !== "boolean") {
      return res.status(400).json({ error: "El campo muted debe ser boolean" });
    }

    await PushToken.findOneAndUpdate(
      { token },
      { $set: { muted, lastSeenAt: new Date() } },
    );

    return res.json({ ok: true, muted });
  } catch (error) {
    console.error("Error en actualizarMutePush:", error.message);
    return res.status(500).json({ error: "Error actualizando silencio" });
  }
};

export const getNotificaciones = async (req, res) => {
  try {
    const docs = await Notificacion.find({})
      .sort({ fechaCreacion: -1 })
      .limit(30)
      .lean();

    const resultado = docs.map((n) => ({
      id: String(n._id),
      tipo: n.tipo,
      titulo: n.titulo,
      cuerpo: n.cuerpo,
      datos: n.datos || {},
      fechaCreacion: n.fechaCreacion,
    }));

    return res.json(resultado);
  } catch (error) {
    console.error("Error en getNotificaciones:", error.message);
    return res.status(500).json({ error: "Error obteniendo notificaciones" });
  }
};
