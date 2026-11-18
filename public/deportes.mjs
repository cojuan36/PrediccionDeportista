import { normalizeGroup, readNumber } from "./pronostico.mjs";

const metric = (key, label, unit, min, max) => ({ key, label, unit, min, max });
const field = metric;
const descanso = field("descanso", "Descanso previo", "días", 0, 365);
const sueno = field("sueno", "Sueño previo", "h", 0, 24);
const rival = field("nivel_rival", "Nivel del rival (1–5)", "", 1, 5);
const minutes = (max) => field("minutos", "Minutos previstos", "min", 0, max);
const text = (label, example) => ({ label, example });
const choice = (label, options) => ({ label, options });

export const sports = [
  {
    id: "futbol", name: "Fútbol", segment: "Posición",
    parts: [choice("Posición", ["Portero", "Defensa", "Lateral", "Mediocampista", "Extremo", "Delantero", "Otra posición"])],
    metrics: [
      metric("tiros", "Tiros", "tiros", 0, 100),
      metric("xg", "Goles esperados acumulados (xG)", "xG", 0, 100),
      metric("goles", "Goles", "goles", 0, 100),
      metric("pases", "Pases completados", "pases", 0, 600),
      metric("atajadas", "Atajadas", "atajadas", 0, 100),
    ],
    fields: [minutes(150), rival, descanso, sueno],
    context: "Registra el xG como la suma del xG asignado a los tiros del jugador. Mantén el mismo proveedor y criterio sobre penaltis. Para el nivel del rival, usa la misma escala antes de cada partido (1 bajo, 5 alto).",
    references: ["statsbomb"],
    example: { group: "Delantero", variable: "minutos", range: [40, 95], base: 1, amplitude: 5 },
  },
  {
    id: "baloncesto", name: "Baloncesto", segment: "Posición",
    parts: [choice("Posición", ["Base", "Escolta", "Alero", "Ala-pívot", "Pívot", "Otra posición"])],
    metrics: [
      metric("puntos", "Puntos", "pts", 0, 300),
      metric("rebotes", "Rebotes", "rebotes", 0, 100),
      metric("asistencias", "Asistencias", "asist.", 0, 100),
      metric("efg", "Porcentaje efectivo de campo (eFG)", "%", 0, 150),
    ],
    fields: [minutes(90), rival, descanso, sueno],
    context: "eFG% = 100 × (tiros de campo anotados + 0,5 × triples anotados) / tiros de campo intentados. Si no hubo intentos, deja la métrica vacía. Usa 1 para un rival de nivel bajo y 5 para uno de nivel alto.",
    references: ["nba"],
    example: { group: "Escolta", variable: "minutos", range: [15, 39], base: 6, amplitude: 22 },
  },
  {
    id: "tenis", name: "Tenis", segment: "Superficie / Formato",
    parts: [
      choice("Superficie", ["Dura", "Arcilla", "Césped", "Alfombra", "Otra superficie"]),
      choice("Formato", ["Al mejor de 3", "Al mejor de 5", "Set único", "Otro formato"]),
    ],
    metrics: [
      metric("primer_servicio", "Porcentaje de puntos ganados con primer servicio", "%", 0, 100),
      metric("aces", "Aces", "aces", 0, 100),
      metric("dobles_faltas", "Dobles faltas", "faltas", 0, 100),
    ],
    fields: [field("ranking_rival", "Ranking previo del rival", "puesto", 1, 10000), descanso, sueno],
    context: "Cuenta los aces y las dobles faltas por partido. Divide los puntos ganados con primer servicio entre los primeros servicios válidos y multiplica por 100. Deja el porcentaje vacío si no hubo primeros servicios válidos.",
    references: ["tennis"],
    example: { group: "Dura / Al mejor de 3", variable: "descanso", range: [1, 7], base: 59, amplitude: 17 },
  },
  {
    id: "atletismo", name: "Atletismo", segment: "Prueba / Distancia",
    parts: [
      text("Prueba", "Ej. Carrera en ruta, salto de longitud"),
      { label: "Distancia de carrera", unit: "m", min: 1, max: 1000000, optional: true, example: "Ej. 5000" },
    ],
    metrics: [
      metric("tiempo", "Tiempo de carrera", "s", 0.01, 1000000),
      metric("distancia", "Marca de salto o lanzamiento", "m", 0.01, 1000),
    ],
    fields: [
      field("volumen", "Volumen de entrenamiento en 7 días", "", 0, 100000),
      field("temperatura", "Temperatura prevista", "°C", -50, 65),
      descanso, sueno,
    ],
    context: "Registra el tiempo en segundos y las distancias en metros. Usa el mismo nombre para una misma prueba. Para el volumen de entrenamiento, mantén la misma unidad en cada prueba (por ejemplo km en carreras o intentos en saltos).",
    references: ["athletics"],
    example: { group: "Carrera en ruta / 5000", variable: "volumen", range: [20, 50], base: 1410, amplitude: -150 },
  },
  {
    id: "powerlifting", name: "Powerlifting", segment: "Modalidad / Categoría / Formato",
    parts: [
      choice("Modalidad", ["Raw", "Wraps", "Single-ply", "Multi-ply", "Unlimited", "Straps", "Otra modalidad"]),
      text("Categoría", "Ej. 83 kg, división abierta"),
      { ...choice("Formato de competición", ["SBD", "BD", "SD", "SB", "S", "B", "D"]), default: "SBD" },
    ],
    metrics: [
      metric("total", "Total SBD en competición", "kg", 0.01, 2000),
      metric("sentadilla", "Mejor sentadilla válida", "kg", 0.01, 1000),
      metric("banca", "Mejor press de banca válido", "kg", 0.01, 1000),
      metric("peso_muerto", "Mejor peso muerto válido", "kg", 0.01, 1000),
    ],
    fields: [field("peso_corporal", "Peso corporal previo", "kg", 20, 400), descanso, sueno],
    context: "Compara resultados del mismo equipamiento, categoría y formato. El total SBD suma el mejor intento válido de sentadilla, banca y peso muerto. Deja vacía una marca sin intento válido.",
    references: ["powerlifting"],
    example: { group: "Raw / 83 kg / SBD", variable: "peso_corporal", range: [75, 82], base: 440, amplitude: 45 },
  },
];

export const references = {
  statsbomb: {
    name: "StatsBomb Open Data", use: "Referencia pública · fútbol",
    detail: "Eventos de tiro con el xG asignado por StatsBomb. El resumen local del Mundial masculino 2022 excluye penaltis y tandas. Describe ese torneo profesional y contextualiza el xG por tiro.",
    url: "https://github.com/hudl/open-data", terms: "Términos de StatsBomb. Atribución y logotipo de la fuente.",
  },
  nba: {
    name: "NBA Stats", use: "Definiciones · baloncesto",
    detail: "Glosario oficial para puntos, asistencias, rebotes y porcentaje efectivo de campo (eFG%). Las definiciones corresponden a las estadísticas de la NBA.",
    url: "https://www.nba.com/stats/help/glossary", terms: "Glosario web de NBA Stats · consulta, sin datos locales.",
  },
  tennis: {
    name: "Tennis Abstract Match Charting Project", use: "Definiciones y referencia pública · tenis",
    detail: "Colección colaborativa de partidos profesionales, punto por punto. Se consultó el reporte de la final masculina de Wimbledon del 14 de julio de 2024, con desglose de aces, dobles faltas y primer servicio.",
    url: "https://github.com/JeffSackmann/tennis_MatchChartingProject",
    extra: { label: "Reporte de Wimbledon 2024", url: "https://www.tennisabstract.com/charting/20240714-M-Wimbledon-F-Novak_Djokovic-Carlos_Alcaraz.html" },
    terms: "Proyecto de Tennis Abstract y colaboradores · CC BY-NC-SA 4.0. Consulta, sin datos locales.",
  },
  athletics: {
    name: "World Athletics", use: "Referencia pública · atletismo",
    detail: "Tablas oficiales de puntuación de abril de 2025 para interpretar marcas por prueba, con resultados de 2022–2024 incluidos en la revisión. La aplicación entrega segundos o metros.",
    extra: { label: "Tablas de puntuación 2025", url: "https://worldathletics.org/download/download?filename=4f77dcb3-2945-4c58-ad8b-955a999b13e8.pdf&urlslug=World+Athletics+Scoring+Tables+of+Athletics" },
    url: "https://worldathletics.org/news/news/scoring-tables-2025", terms: "World Athletics · consulta, sin tablas locales.",
  },
  powerlifting: {
    name: "OpenPowerlifting", use: "Definiciones y referencia pública · powerlifting",
    detail: "Se consultó el CSV OpenIPF de federaciones afiliadas a la IPF (14 nov 2026, revisión 6b8787a8) para comprobar formato, equipamiento, categoría y marcas. El peso de competición del CSV corresponde al pesaje. Aquí se captura el peso conocido antes del evento.",
    url: "https://openpowerlifting.gitlab.io/opl-csv/bulk-csv.html",
    extra: { label: "Documentación del CSV", url: "https://openpowerlifting.gitlab.io/opl-csv/bulk-csv-docs.html" },
    terms: "Datos de dominio público según OpenPowerlifting · consulta, sin datos locales.",
  },
  validation: {
    name: "Forecasting: Principles and Practice", use: "Método de evaluación",
    detail: "Evaluación con orígenes móviles en el tiempo. Cada pronóstico de prueba usa únicamente las observaciones disponibles antes de su fecha.",
    url: "https://otexts.com/fpp3/toolbox.html#tscv", terms: "Rob J. Hyndman y George Athanasopoulos · 3.ª edición, sección 5.10.",
  },
};

export function segmentParts(sport) {
  return sport.parts ?? [text(sport.segment, "Ej. 100 m libre")];
}

export function splitSegment(sport, group) {
  return sport.parts ? group.split(/\s*\/\s*/) : [group];
}

export function readSegment(sport, values, metricKeys) {
  const parts = segmentParts(sport);
  if (values.length > parts.length) {
    throw new Error(`Usa el formato de segmento «${sport.segment}».`);
  }
  const selected = parts.map((part, index) => {
    const value = ((values[index] ?? "").trim() || part.default || "").replace(/\s+/g, " ");
    if (!value && part.optional && !metricKeys.includes("tiempo")) return "";
    if (!value) throw new Error(`Ingresa «${part.label}» para identificar eventos comparables.`);
    if (part.options) {
      const format = sport.id === "tenis" && index === 1 && /^[35] sets$/i.test(value)
        ? `Al mejor de ${value[0]}` : value;
      const option = part.options.find((item) => normalizeGroup(item) === normalizeGroup(format));
      if (!option) throw new Error(`«${part.label}» admite: ${part.options.join(", ")}.`);
      return option;
    }
    if (Number.isFinite(part.min)) return String(readNumber(value, part));
    if (value.length > 80 || (sport.parts && value.includes("/"))) {
      throw new Error(`Revisa «${part.label}». Usa hasta 80 caracteres y evita el separador «/» en este campo.`);
    }
    return value;
  });
  if (sport.id === "powerlifting") {
    const competition = selected[2];
    const includesLift = { sentadilla: "S", banca: "B", peso_muerto: "D" };
    if (metricKeys.some((key) => key === "total" ? competition !== "SBD" : !competition.includes(includesLift[key]))) {
      throw new Error("Selecciona un formato de competición que incluya los levantamientos de la métrica.");
    }
  }
  return selected.filter(Boolean).join(" / ");
}

export function demoRows(sport, dateString) {
  if (!sport.example) return [];
  const { group, variable, range, base, amplitude } = sport.example;
  const metricKey = sport.metrics[0].key;
  const contexts = [0.15, 0.84, 0.48, 0.95, 0.24, 0.66, 0.41, 0.78, 0.36, 0.9];
  return Array.from({ length: 30 }, (_, index) => {
    const position = contexts[index % contexts.length];
    const date = new Date(dateString + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - (31 - index) * 3);
    const noise = ((index * 7 % 5) - 2) * Math.abs(amplitude) / 30;
    return {
      date: date.toISOString().slice(0, 10), group, name: "", synthetic: true,
      values: { [metricKey]: Math.round(base + amplitude * position + noise) },
      context: { [variable]: Math.round(range[0] + (range[1] - range[0]) * position) },
    };
  });
}
