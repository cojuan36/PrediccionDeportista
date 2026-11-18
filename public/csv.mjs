import { normalizeGroup, readNumber, validDate } from "./pronostico.mjs";
import { readSegment, splitSegment } from "./deportes.mjs";

function parse(text, separator) {
  const rows = [];
  let row = [];
  let cell = "";
  let mode = "start";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (mode === "quoted") {
      if (char !== '"') cell += char;
      else if (text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else mode = "closed";
    } else if (char === separator) {
      row.push(cell);
      cell = "";
      mode = "start";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      mode = "start";
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else if (char === '"' && mode === "start") {
      mode = "quoted";
    } else {
      if (mode === "closed" || char === '"') throw new Error("Revisa las comillas del CSV.");
      mode = "plain";
      cell += char;
    }
  }
  if (mode === "quoted") throw new Error("El CSV contiene comillas sin cerrar.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function quote(value) {
  return '"' + String(value ?? "").replaceAll('"', '""') + '"';
}

const formulaStart = /^' *[=+@-]|^'*[=+@-]/;
const safeText = (value) => formulaStart.test(value) ? "'" + value : value;
const restoreText = (value) => value.startsWith("'") && formulaStart.test(value.slice(1)) ? value.slice(1) : value;

export function eventKey(row) {
  return JSON.stringify([row.date, normalizeGroup(row.group), normalizeGroup(row.name ?? "")]);
}

export function toCsv(sport, data) {
  const columns = [...sport.metrics, ...sport.fields];
  const header = ["fecha", "segmento", "evento", ...columns.map(({ key }) => key), "origen"];
  const rows = data.map((row) => [
    row.date, safeText(row.group), safeText(row.name ?? ""),
    ...columns.map(({ key }) => row.values[key] ?? row.context[key] ?? ""),
    row.synthetic ? "sintetico" : "propio",
  ]);
  return "\uFEFF" + [header, ...rows].map((row) => row.map(quote).join(";")).join("\r\n") + "\r\n";
}

export function fromCsv(content, sport, today) {
  const text = content.replace(/^\uFEFF/, "");
  const separator = text.split(/\r\n|\n|\r/, 1)[0].includes(";") ? ";" : ",";
  const [header, ...records] = parse(text, separator);
  if (!header || records.length === 0) throw new Error("El CSV necesita un encabezado y al menos un registro.");
  if (records.length > 5000) throw new Error("El CSV admite hasta 5000 registros por importación.");
  const columns = header.map((value) => value.trim().toLowerCase());
  const allowed = ["fecha", "segmento", "evento", "origen", ...sport.metrics, ...sport.fields].map((item) =>
    typeof item === "string" ? item : item.key);
  if (new Set(columns).size !== columns.length || columns.some((key) => !allowed.includes(key))
    || !columns.includes("fecha") || !sport.metrics.some(({ key }) => columns.includes(key))) {
    throw new Error("El encabezado no coincide con este deporte. Descarga su plantilla para ver las columnas.");
  }
  const seen = new Set();
  return records.map((record, index) => {
    try {
      if (record.length !== columns.length) throw new Error("Número incorrecto de columnas.");
      const cells = Object.fromEntries(columns.map((key, column) => [key, record[column].trim()]));
      if (!validDate(cells.fecha) || cells.fecha > today) {
        throw new Error("Ingresa una fecha válida y no futura con formato AAAA-MM-DD.");
      }
      const pick = (specs) => Object.fromEntries(specs.flatMap((spec) =>
        cells[spec.key] ? [[spec.key, readNumber(cells[spec.key], spec)]] : []));
      const values = pick(sport.metrics);
      if (Object.keys(values).length === 0) throw new Error("Ingresa al menos un resultado real.");
      const rawGroup = restoreText(cells.segmento ?? "");
      const name = restoreText(cells.evento ?? "");
      if (/[\r\n]/.test(rawGroup + name) || name.length > 80) {
        throw new Error("Usa un segmento y un nombre de evento sin saltos de línea. El nombre admite hasta 80 caracteres.");
      }
      if (cells.origen && !["propio", "sintetico"].includes(cells.origen)) {
        throw new Error("El origen debe ser propio o sintetico.");
      }
      const group = readSegment(sport, splitSegment(sport, rawGroup), Object.keys(values));
      const row = { date: cells.fecha, group, name, values, context: pick(sport.fields), synthetic: cells.origen === "sintetico" };
      const key = eventKey(row);
      if (seen.has(key)) throw new Error("Hay dos registros con la misma fecha, segmento y nombre de evento.");
      seen.add(key);
      return row;
    } catch (error) {
      throw new Error(`Registro ${index + 1} del CSV. ${error.message}`);
    }
  });
}
