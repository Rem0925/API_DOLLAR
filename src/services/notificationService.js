import axios from "axios";
import Tasa from "../models/Tasa.js";
import ConfigMoneda from "../models/ConfigMoneda.js";
import PushToken from "../models/PushToken.js";
import Notificacion from "../models/Notificacion.js";
import NotificacionEstado from "../models/NotificacionEstado.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN_REGEX =
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,120}\]$/;
const CARACAS_TZ = "America/Caracas";

let evalMutex = Promise.resolve();

export const formatNumeroVE = (val) => {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (!Number.isFinite(num)) return "0,00";
  return num.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatPctVE = (pct, decimals = 2) => {
  const num = typeof pct === "string" ? parseFloat(pct) : pct;
  if (!Number.isFinite(num)) return decimals === 1 ? "0,0" : "0,00";
  return num.toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const formatPct1Dec = (pct) => formatPctVE(pct, 1);

const formatSignedPct = (pct) => {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.005) return "0,00%";
  const sign = pct > 0 ? "+" : "-";
  return `${sign}${formatPctVE(Math.abs(pct), 2)}%`;
};

export const getUnidadMoneda = (monedaConfig = {}) => {
  if (
    monedaConfig.category === "Bolívares" ||
    monedaConfig.isBasedOnBcv ||
    monedaConfig.id === "euro_bcv"
  ) {
    return "Bs";
  }
  const sym =
    typeof monedaConfig.symbol === "string" ? monedaConfig.symbol.trim() : "";
  if (/^[A-Z]{2,5}$/.test(sym)) {
    return sym;
  }
  const shortTitle =
    typeof monedaConfig.shortTitle === "string"
      ? monedaConfig.shortTitle.trim()
      : "";
  return shortTitle || sym;
};

export const getFechaCaracasInfo = (dateInput) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = new Intl.DateTimeFormat("es-VE", {
    timeZone: CARACAS_TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);

  const getPart = (type) => parts.find((p) => p.type === type)?.value || "";
  const rawWeekday = getPart("weekday");
  const diaSemana = rawWeekday
    ? rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1)
    : "";
  const day = getPart("day");
  const month = getPart("month");
  const year = getPart("year");

  return {
    isoKey: `${year}-${month}-${day}`,
    diaSemana,
    ddmm: `${day}/${month}`,
  };
};

const getFinHoyCaracas = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CARACAS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parseInt(parts.find((p) => p.type === "year").value, 10);
  const month = parseInt(parts.find((p) => p.type === "month").value, 10) - 1;
  const day = parseInt(parts.find((p) => p.type === "day").value, 10);

  // America/Caracas es UTC-4 fijo (sin DST): 23:59:59.999 VE == 03:59:59.999 UTC del día siguiente
  return new Date(Date.UTC(year, month, day + 1, 3, 59, 59, 999));
};

export const construirNotificacionTasaProxima = ({
  fechaValor,
  nuevoBcv,
  anteriorBcv,
  nuevoEuro,
  anteriorEuro,
}) => {
  const { diaSemana, ddmm } = getFechaCaracasInfo(fechaValor);
  const pctBcv =
    anteriorBcv > 0 ? ((nuevoBcv - anteriorBcv) / anteriorBcv) * 100 : 0;
  const pctEuro =
    anteriorEuro > 0 ? ((nuevoEuro - anteriorEuro) / anteriorEuro) * 100 : 0;

  const titulo = `Actualización BCV · ${diaSemana} ${ddmm}`;
  const lineas = [
    `Dólar BCV: ${formatNumeroVE(nuevoBcv)} Bs (${formatSignedPct(pctBcv)})`,
  ];
  if (Number.isFinite(nuevoEuro) && nuevoEuro > 0) {
    lineas.push(
      `Euro BCV: ${formatNumeroVE(nuevoEuro)} Bs (${formatSignedPct(pctEuro)})`,
    );
  }

  return { titulo, cuerpo: lineas.join("\n") };
};

export const construirNotificacionAlza = (alzas = []) => {
  if (!Array.isArray(alzas) || alzas.length === 0) {
    return null;
  }

  if (alzas.length === 1) {
    const a = alzas[0];
    return {
      titulo: `Alza en ${a.title} (+${formatPct1Dec(a.pct)}%)`,
      cuerpo: `Cotiza en ${formatNumeroVE(a.valorActual)} ${a.unidad} (antes ${formatNumeroVE(a.valorAnterior)} ${a.unidad})`.trim(),
    };
  }

  const titulo = `Incremento en ${alzas.length} monedas (+10%)`;
  const lineas = alzas
    .slice(0, 3)
    .map(
      (a) =>
        `${a.title}: ${formatNumeroVE(a.valorActual)} ${a.unidad} (+${formatPct1Dec(a.pct)}%)`,
    );
  if (alzas.length > 3) {
    lineas.push(`y ${alzas.length - 3} más en VeGreen`);
  }

  return { titulo, cuerpo: lineas.join("\n") };
};

export const enviarPushMasivo = async ({ titulo, cuerpo, datos = {} }) => {
  try {
    const tokensDocs = await PushToken.find({ muted: false })
      .select("token appVariant -_id")
      .lean();

    const groups = new Map();
    for (const doc of tokensDocs) {
      const t = doc?.token;
      if (typeof t !== "string" || t.length > 160 || !EXPO_TOKEN_REGEX.test(t)) {
        continue;
      }
      const variant =
        doc?.appVariant === "development" ? "development" : "production";
      if (!groups.has(variant)) {
        groups.set(variant, []);
      }
      groups.get(variant).push(t);
    }

    if (groups.size === 0) return;

    const uniqueTag =
      datos?.tag ||
      `${datos?.tipo || "vegreen"}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const messageData = { ...(datos || {}), tag: uniqueTag };

    const invalidTokens = new Set();
    const chunkSize = 100;

    for (const [, variantTokens] of groups.entries()) {
      for (let i = 0; i < variantTokens.length; i += chunkSize) {
        const chunk = variantTokens.slice(i, i + chunkSize);
        const messages = chunk.map((token) => ({
          to: token,
          title: titulo,
          body: cuerpo,
          data: messageData,
          sound: "default",
          priority: "high",
          channelId: "default",
        }));

        try {
          const resp = await axios.post(EXPO_PUSH_URL, messages, {
            headers: {
              Accept: "application/json",
              "Accept-encoding": "gzip, deflate",
              "Content-Type": "application/json",
            },
            timeout: 10000,
          });

          const tickets = resp.data?.data;
          if (Array.isArray(tickets)) {
            tickets.forEach((ticket, idx) => {
              if (
                ticket?.status === "error" &&
                ticket?.details?.error === "DeviceNotRegistered" &&
                chunk[idx]
              ) {
                invalidTokens.add(chunk[idx]);
              }
            });
          }
        } catch (chunkErr) {
          console.error("Error enviando lote Expo Push:", chunkErr.message);
        }
      }
    }

    if (invalidTokens.size > 0) {
      await PushToken.deleteMany({ token: { $in: [...invalidTokens] } });
    }
  } catch (error) {
    console.error("Error en enviarPushMasivo:", error.message);
  }
};

const ejecutarEvaluacionInterna = async (nuevoDoc, ultimaTasaPrevia = null) => {
  if (!nuevoDoc) return;

  try {
    let estado = await NotificacionEstado.findById("global");
    if (!estado) {
      estado = new NotificacionEstado({ _id: "global" });
    }
    if (!estado.referenciasMonedas) {
      estado.referenciasMonedas = new Map();
    }

    const pushesPendientes = [];
    const finHoy = getFinHoyCaracas();
    const fechaValorDoc = nuevoDoc.fechaValor
      ? new Date(nuevoDoc.fechaValor)
      : null;

    // 1. Nueva Tasa Próxima (BCV y Euro)
    if (fechaValorDoc && fechaValorDoc > finHoy) {
      const { isoKey } = getFechaCaracasInfo(fechaValorDoc);
      const bcvNuevo = parseFloat(nuevoDoc.bcv);
      const euroNuevo = parseFloat(nuevoDoc.euro);

      const cambioTasaProxima =
        isoKey !== estado.ultimaFechaValorBcvNotificada ||
        (Number.isFinite(bcvNuevo) && bcvNuevo !== estado.ultimoBcvNotificado) ||
        (Number.isFinite(euroNuevo) &&
          euroNuevo !== estado.ultimoEuroNotificado);

      if (cambioTasaProxima && Number.isFinite(bcvNuevo) && bcvNuevo > 0) {
        const tasaVigente = await Tasa.findOne({
          fechaValor: { $lte: finHoy },
        }).sort({ fechaValor: -1, fechaActualizacion: -1 });

        const refAnterior = tasaVigente || ultimaTasaPrevia;
        const anteriorBcv = parseFloat(refAnterior?.bcv) || 0;
        const anteriorEuro = parseFloat(refAnterior?.euro) || 0;

        const { titulo, cuerpo } = construirNotificacionTasaProxima({
          fechaValor: fechaValorDoc,
          nuevoBcv: bcvNuevo,
          anteriorBcv,
          nuevoEuro: euroNuevo,
          anteriorEuro,
        });

        const datos = {
          tipo: "tasa_proxima",
          fechaValor: isoKey,
          bcv: bcvNuevo,
          euro: euroNuevo,
        };

        const notifDoc = await Notificacion.create({
          tipo: "tasa_proxima",
          titulo,
          cuerpo,
          datos,
        });

        estado.ultimaFechaValorBcvNotificada = isoKey;
        estado.ultimoBcvNotificado = bcvNuevo;
        estado.ultimoEuroNotificado = Number.isFinite(euroNuevo)
          ? euroNuevo
          : null;

        pushesPendientes.push({
          titulo,
          cuerpo,
          datos: { ...datos, id: String(notifDoc._id) },
        });
      }
    }

    // 2. Alza >= 10% en cualquier moneda configurada en ConfigMoneda
    const monedas = await ConfigMoneda.find({}).lean();
    const alzas = [];

    for (const m of monedas) {
      if (!m?.apiField) continue;
      const val = parseFloat(nuevoDoc[m.apiField]);
      if (!Number.isFinite(val) || val <= 0) continue;

      const ref = estado.referenciasMonedas.get(m.apiField);
      if (!Number.isFinite(ref) || ref <= 0) {
        estado.referenciasMonedas.set(m.apiField, val);
        continue;
      }

      if (val < ref) {
        estado.referenciasMonedas.set(m.apiField, val);
        continue;
      }

      const pct = ((val - ref) / ref) * 100;
      if (pct >= 10) {
        alzas.push({
          id: m.id,
          title: m.title,
          apiField: m.apiField,
          valorActual: val,
          valorAnterior: ref,
          pct,
          unidad: getUnidadMoneda(m),
        });
        estado.referenciasMonedas.set(m.apiField, val);
      }
    }

    if (alzas.length > 0) {
      const msgAlza = construirNotificacionAlza(alzas);
      if (msgAlza) {
        const datos = { tipo: "alza_moneda", monedas: alzas };
        const notifDoc = await Notificacion.create({
          tipo: "alza_moneda",
          titulo: msgAlza.titulo,
          cuerpo: msgAlza.cuerpo,
          datos,
        });
        pushesPendientes.push({
          titulo: msgAlza.titulo,
          cuerpo: msgAlza.cuerpo,
          datos: { ...datos, id: String(notifDoc._id) },
        });
      }
    }

    // Guardar estado ANTES de realizar llamadas HTTP lentas a Expo Push
    estado.ultimaActualizacion = new Date();
    await estado.save();

    for (const p of pushesPendientes) {
      await enviarPushMasivo(p);
    }
  } catch (error) {
    console.error("Error en evaluarYEnviarNotificaciones:", error.message);
  }
};

export const evaluarYEnviarNotificaciones = (
  nuevoDoc,
  ultimaTasaPrevia = null,
) => {
  const run = evalMutex.then(() =>
    ejecutarEvaluacionInterna(nuevoDoc, ultimaTasaPrevia),
  );
  evalMutex = run.catch(() => {});
  return run;
};
