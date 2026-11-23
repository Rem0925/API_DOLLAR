import PushToken from "../models/PushToken.js";
import Notificacion from "../models/Notificacion.js";

export const EXPO_TOKEN_REGEX =
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,120}\]$/;

const createRateLimiter = ({ windowMs = 60_000, max = 30 } = {}) => {
  const hits = new Map();
  let lastSweep = Date.now();

  return (req, res, next) => {
    const now = Date.now();

    if (now - lastSweep > windowMs || hits.size > 5000) {
      for (const [ip, entry] of hits.entries()) {
        if (now > entry.resetAt) {
          hits.delete(ip);
        }
      }
      if (hits.size > 5000) {
        hits.clear();
      }
      lastSweep = now;
    }

    const key = String(req.ip || req.socket?.remoteAddress || "unknown");
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      return res
        .status(429)
        .json({ error: "Demasiadas solicitudes, intenta más tarde" });
    }

    return next();
  };
};

export const rateLimitPush = createRateLimiter({ windowMs: 60_000, max: 20 });
export const rateLimitNotificaciones = createRateLimiter({
  windowMs: 60_000,
  max: 60,
});

export const registrarPushToken = async (req, res) => {
  try {
    const {
      token,
      platform = "android",
      muted = false,
      appVariant = "production",
    } = req.body || {};

    if (
      typeof token !== "string" ||
      token.length > 160 ||
      !EXPO_TOKEN_REGEX.test(token)
    ) {
      return res.status(400).json({ error: "Token Expo inválido" });
    }

    const safePlatform = platform === "ios" ? "ios" : "android";
    const safeVariant =
      appVariant === "development" ? "development" : "production";
    const mutedBool = Boolean(muted);

    await PushToken.findOneAndUpdate(
      { token },
      {
        $set: {
          token,
          platform: safePlatform,
          muted: mutedBool,
          appVariant: safeVariant,
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

    if (
      typeof token !== "string" ||
      token.length > 160 ||
      !EXPO_TOKEN_REGEX.test(token)
    ) {
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
      titulo: String(n.titulo || ""),
      cuerpo: String(n.cuerpo || ""),
      datos: n.datos || {},
      fechaCreacion: n.fechaCreacion,
    }));

    return res.json(resultado);
  } catch (error) {
    console.error("Error en getNotificaciones:", error.message);
    return res.status(500).json({ error: "Error obteniendo notificaciones" });
  }
};
