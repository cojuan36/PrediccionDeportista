import { demoRows, readSegment, references, segmentParts, splitSegment, sports } from "./deportes.mjs";
import { eventKey, fromCsv, toCsv } from "./csv.mjs";
import { drawChart } from "./grafica.mjs";
import { comparableRows, forecast, normalizeGroup, readFields, readNumber, validDate } from "./pronostico.mjs";

const storageKey = "ritmo.1";
const pageSize = 8;
const number = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
const smallNumber = new Intl.NumberFormat("es-MX", { maximumSignificantDigits: 3 });
const calendar = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" });
const byId = (id) => document.getElementById(id);
const form = byId("scenario-form");
const displayDate = (value) => calendar.format(new Date(value + "T00:00:00Z"));
const numericText = (value) => Math.abs(value) < .1 ? smallNumber.format(value) : number.format(value);
const formatValue = (value, spec) => [numericText(value), spec.unit].filter(Boolean).join(" ");

function today(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, "0")).join("-");
}

function el(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

function message(id, content = "", error = false) {
  const target = byId(id);
  target.textContent = content;
  target.hidden = !content;
  target.classList.toggle("error-text", error);
}

function readState(raw) {
  if (raw === null) return { custom: [], athletes: [], sportId: sports[0].id, athleteId: "" };
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.custom) || !Array.isArray(data.athletes)) {
    throw new Error("El historial guardado tiene un formato que no se reconoce.");
  }
  return data;
}

let state = readState(null);
let saved = null;
let storageError = "";
let currentPage = 0;
let scenarioKey = "";
let chartData;
let reference;
let referenceFailed = false;
let variableIndex = 0;
let editingId;

try {
  saved = localStorage.getItem(storageKey);
  state = readState(saved);
} catch {
  storageError = "No se pudo abrir el historial de este navegador. Revisa su configuración de almacenamiento.";
}

function persist(next) {
  if (storageError) throw new Error(storageError);
  try {
    const latest = localStorage.getItem(storageKey);
    if (latest !== saved) {
      state = readState(latest);
      saved = latest;
      render();
      throw new Error("Se actualizó el historial en otra pestaña. Revisa los datos e inténtalo de nuevo.");
    }
    const serialized = JSON.stringify(next);
    localStorage.setItem(storageKey, serialized);
    saved = serialized;
    state = next;
  } catch (error) {
    if (error.name === "QuotaExceededError" || error.name === "SecurityError") {
      throw new Error("El navegador no pudo guardar los cambios. Revisa el espacio disponible y los permisos.");
    }
    throw error;
  }
}

const allSports = () => [...sports, ...state.custom];
const sportById = (id) => allSports().find((sport) => sport.id === id);
const currentSport = () => sportById(state.sportId) ?? sports[0];
const profilesFor = (sport) => state.athletes.filter((athlete) => athlete.sportId === sport.id);
const currentAthlete = () => {
  const profiles = profilesFor(currentSport());
  return profiles.find((athlete) => athlete.id === state.athleteId) ?? profiles[0];
};
const currentMetric = () => {
  const { metrics } = currentSport();
  return metrics.find(({ key }) => key === currentAthlete()?.metricKey) ?? metrics[0];
};
const rowsFor = (athlete) => athlete?.rows ?? [];
const swapAthlete = (updated) => state.athletes.map((athlete) => athlete.id === updated.id ? updated : athlete);
const compareDates = (a, b) => b.date.localeCompare(a.date);

function handle(target, action) {
  try {
    message(target);
    action();
  } catch (error) {
    message(target, error.message, true);
  }
}

function options(select, items, value, placeholder) {
  const entries = items.map(({ label, key }) => el("option", { value: key }, label));
  if (placeholder) entries.unshift(el("option", { value: "" }, placeholder));
  select.replaceChildren(...entries);
  select.value = value;
}

function labelFor(spec) {
  return spec.unit ? spec.label + " (" + spec.unit + ")" : spec.label;
}

function inputField(label, name, value, attributes = {}) {
  const input = el("input", { name, ...attributes });
  input.value = value ?? "";
  return el("label", {}, label, input);
}

function numericField(spec, prefix, values) {
  return inputField(labelFor(spec), prefix + spec.key, values?.[spec.key], { inputmode: "decimal" });
}

function segmentFields(sport, defaults, metricKeys) {
  return segmentParts(sport).map((part, index) => {
    const name = "segment" + index;
    const initial = defaults[index] || part.default || "";
    if (part.options) {
      const select = el("select", { name, required: "" });
      options(select, part.options.map((label) => ({ label, key: label })), initial, "Selecciona");
      return el("label", {}, part.label, select);
    }
    const required = !part.optional || metricKeys.includes("tiempo");
    const label = labelFor(part) + (part.optional && !required ? " · solo carreras" : "");
    const attrs = { maxlength: 80, placeholder: part.example };
    if (required) attrs.required = "";
    if (Number.isFinite(part.min)) attrs.inputmode = "decimal";
    return inputField(label, name, initial, attrs);
  });
}

function formSegment(sport, data, metricKeys) {
  return readSegment(sport, segmentParts(sport).map((_, index) => data.get("segment" + index)), metricKeys);
}

function fieldset(title, inputs) {
  return el("fieldset", {}, el("legend", {}, title), el("div", { class: "form-grid" }, ...inputs));
}

function renderSelectors(sport, athlete, metric) {
  options(byId("sport"), allSports().map(({ id, name }) => ({ key: id, label: name })), sport.id);
  options(byId("athlete"), profilesFor(sport).map(({ id, name }) => ({ key: id, label: name })), athlete?.id ?? "",
    athlete ? undefined : "Sin deportistas");
  byId("athlete").disabled = !athlete;
  byId("metric").disabled = !athlete;
  options(byId("metric"), sport.metrics, metric.key);
  message("profile-note", athlete?.demo ? "Perfil de ejemplo · Datos sintéticos para explorar el cálculo." : "");
  if (storageError) message("status", storageError, true);
}

function renderScenario(sport, athlete, metric) {
  const target = byId("scenario-fields");
  const key = JSON.stringify([sport.id, athlete?.id, metric.key]);
  const draft = key === scenarioKey ? new FormData(form) : new FormData();
  scenarioKey = key;
  target.className = "scenario-fields";
  const latest = rowsFor(athlete).filter((row) => Number.isFinite(row.values[metric.key])).sort(compareDates)[0];
  const defaults = splitSegment(sport, latest?.group ?? "");
  const segment = segmentParts(sport).map((_, index) => draft.get("segment" + index) || defaults[index]);
  const previous = athlete?.demo && sport.example
    ? { [sport.example.variable]: Math.round((sport.example.range[0] + sport.example.range[1]) / 2) }
    : {};
  for (const spec of sport.fields) {
    if (draft.has("context-" + spec.key)) previous[spec.key] = draft.get("context-" + spec.key);
  }
  const fields = [
    inputField("Fecha del evento", "date", draft.get("date") ?? today(1), { type: "date", min: today(), required: "" }),
    ...segmentFields(sport, segment, [metric.key]),
  ];
  if (sport.fields.length) {
    fields.push(fieldset("Condiciones previas · opcionales", sport.fields.map((spec) => numericField(spec, "context-", previous))));
  }
  target.replaceChildren(...fields);
  form.querySelector("button[type='submit']").disabled = !athlete;
  target.querySelectorAll("input, select").forEach((input) => { input.disabled = !athlete; });
  message("forecast-status");
}

function readScenario(sport, metric) {
  const data = new FormData(form);
  const date = data.get("date");
  if (!validDate(date) || date < today()) throw new Error("Indica una fecha de hoy en adelante.");
  return {
    date, metric, group: formSegment(sport, data, [metric.key]),
    context: readFields(data, sport.fields, "context-"),
  };
}

function renderChart(history, estimate, metric, targetDate) {
  const canvas = byId("chart");
  chartData = history.length ? { history, estimate, metric, targetDate } : null;
  byId("plot").hidden = !chartData;
  byId("forecast-legend").hidden = !estimate;
  if (!chartData) return;
  const description = metric.label + ". Últimos " + Math.min(14, history.length) + " resultados comparables."
    + (estimate ? " Estimación de " + formatValue(estimate.value, metric) + "." : "");
  canvas.setAttribute("aria-label", description);
  drawChart(canvas, chartData);
}

function emptyResult(title, body, history = [], metric = currentMetric()) {
  byId("method").hidden = true;
  byId("result-summary").replaceChildren(el("div", { class: "empty" }, el("strong", {}, title), el("p", {}, body)));
  byId("explanation").replaceChildren();
  renderChart(history, null, metric);
}

function renderPending(athlete, sport, metric) {
  byId("result-subtitle").textContent = metric.label;
  if (!athlete) {
    const action = sport.example ? "También puedes cargar un ejemplo con resultados sintéticos desde el historial."
      : "Crea un perfil y registra o importa los resultados que quieras comparar.";
    emptyResult("Crea un perfil para empezar", action);
    if (sport.example) {
      const example = el("button", { type: "button", class: "button secondary" }, "Probar con un ejemplo");
      example.addEventListener("click", () => byId("demo").click());
      byId("result-summary").firstElementChild.append(example);
    }
    return;
  }
  let history = [];
  try {
    const data = new FormData(form);
    const group = formSegment(sport, data, [metric.key]);
    if (validDate(data.get("date"))) history = comparableRows(rowsFor(athlete), { group, date: data.get("date"), metric });
  } catch {
    // The scenario is still being filled in.
  }
  emptyResult("Prepara tu estimación", "Elige las condiciones del próximo evento y pulsa Calcular estimación.", history, metric);
}

const methods = { recent: "Promedio reciente", context: "Condiciones similares" };
const reasons = {
  empty: "La proyección pondera los resultados más recientes. Puedes agregar condiciones previas para probar si ayudan.",
  unusable: "Se usó el promedio reciente con la evidencia disponible para las condiciones ingresadas.",
  overlap: "Se usó el promedio reciente porque hay menos de ocho antecedentes con estas condiciones registradas juntas.",
  tests: "Se usó el promedio reciente porque aún faltan pruebas históricas comparables para evaluar el método contextual.",
  no_gain: "El promedio reciente obtuvo un error igual o menor en las pruebas comparables.",
};
function stat(label, value) {
  return el("div", { class: "stat" }, el("span", {}, label), el("strong", {}, value));
}

function renderEstimate(result, scenario, sport) {
  const { metric, date, group } = scenario;
  if (result.status === "insufficient") {
    const count = result.history.length;
    emptyResult("Historial insuficiente",
      "Hay " + count + " de " + result.minimumHistory + " resultados requeridos para "
      + metric.label + " en «" + group + "» antes del " + displayDate(date) + ". Registra o importa los que faltan.",
      result.history, metric);
    return;
  }

  const { validation, comparison, diagnostic } = result;
  const tag = byId("method");
  tag.textContent = methods[result.method];
  tag.hidden = false;
  const metricCard = el("div", { class: "metric-card" },
    el("div", {}, el("p", {}, "Estimación · " + displayDate(date)),
      el("div", { class: "metric-value" }, el("strong", {}, numericText(result.value)), el("small", {}, metric.unit))),
    el("div", { class: "result-range" }, el("p", {}, "Rango estimado"),
      el("strong", {}, result.range ? result.range.map(numericText).join("–") + " " + metric.unit : "Pendiente"),
      result.range ? el("p", {}, "Percentil 80 del error histórico") : el("p", {}, "Requiere 20 pruebas históricas")));
  byId("result-summary").replaceChildren(metricCard, el("div", { class: "stats" },
    stat("Resultados comparables", String(result.history.length)),
    stat("Eventos evaluados", String(validation.count)),
    stat("Error absoluto medio", validation.mae === null ? "Pendiente" : formatValue(validation.mae, metric))));

  const fieldByKey = (key) => sport.fields.find((spec) => spec.key === key);
  const label = (key) => fieldByKey(key)?.label ?? key;
  const modelText = result.method === "context"
    ? "Los antecedentes se eligieron por cercanía en " + result.features.map(label).join(", ") + "."
    : reasons[diagnostic.reason];
  const explanation = el("div", { class: "explanation" }, el("p", {}, modelText));
  if (comparison?.count) {
    explanation.append(el("p", {}, comparison.count + " pruebas comparables. Error medio de "
      + formatValue(comparison.contextMae, metric) + " con condiciones similares y "
      + formatValue(comparison.recentMae, metric) + " con el promedio reciente."));
  }
  if (validation.count) {
    explanation.append(el("p", {}, validation.contextualTests + " de " + validation.count
      + " pruebas del procedimiento usaron condiciones similares."));
  }
  for (const item of diagnostic.ignored) {
    const field = fieldByKey(item.key);
    const why = {
      few: () => "hay " + item.count + " valores registrados y se requieren ocho",
      constant: () => "su valor no varió en los antecedentes disponibles",
      outside: () => "el valor ingresado está fuera del rango observado (" + formatValue(item.min, field) + "–" + formatValue(item.max, field) + ")",
    };
    explanation.append(el("p", {}, label(item.key) + " quedó fuera de la comparación porque " + why[item.reason]() + "."));
  }
  const used = result.used.map((row, index) => {
    const conditions = result.features?.map((key) => label(key) + " " + formatValue(row.context[key], fieldByKey(key)));
    return el("li", {}, displayDate(row.date) + (row.name ? " · " + row.name : "")
      + " · " + formatValue(row.values[metric.key], metric)
      + " · " + (conditions ? conditions.join(", ") : "peso " + (index + 1)));
  });
  explanation.append(el("details", {}, el("summary", {}, "Ver " + used.length + " antecedentes utilizados"),
    el("ul", {}, ...used)));
  byId("explanation").replaceChildren(explanation);
  renderChart(result.history, result, metric, date);
}

function runForecast() {
  const athlete = currentAthlete();
  if (!athlete) return;
  const sport = currentSport();
  const scenario = readScenario(sport, currentMetric());
  renderEstimate(forecast(rowsFor(athlete), scenario), scenario, sport);
}

function renderHistory(sport, athlete, metric) {
  const rows = rowsFor(athlete).slice().sort(compareDates);
  byId("history-intro").textContent = athlete
    ? athlete.name + " · " + rows.length + (rows.length === 1 ? " evento" : " eventos")
    : "Crea un perfil para registrar o importar resultados.";
  byId("demo").disabled = !sport.example;
  byId("demo").title = sport.example ? "Abre un perfil con historial sintético" : "Los ejemplos están disponibles en los deportes iniciales";
  byId("import-csv").disabled = !athlete;
  byId("add-event").disabled = !athlete;
  byId("export-csv").disabled = !rows.length;
  byId("csv-help").hidden = false;
  const customColumns = sport.parts ? "" : " Columnas de este deporte. "
    + [...sport.metrics, ...sport.fields].map((spec) => spec.key + " = " + labelFor(spec)).join(" · ") + ".";
  byId("csv-instructions").textContent = "Usa fechas AAAA-MM-DD y escribe el segmento como «" + sport.segment
    + "»" + (sport.example ? " (ej. «" + sport.example.group + "»)" : "")
    + ". Conserva los encabezados. Deja celdas vacías cuando falten datos. Usa el nombre del evento para distinguir resultados de una misma fecha y segmento."
    + customColumns;
  const target = byId("history-table");
  byId("pagination").hidden = rows.length <= pageSize;
  if (!rows.length) {
    target.replaceChildren(el("div", { class: "empty" }, el("strong", {}, "Aún no hay resultados"),
      el("p", {}, athlete ? "Registra un evento o importa varios desde la plantilla." : "Selecciona Nuevo deportista para empezar.")));
    return;
  }
  const pages = Math.ceil(rows.length / pageSize);
  currentPage = Math.min(currentPage, pages - 1);
  const offset = currentPage * pageSize;
  const page = rows.slice(offset, offset + pageSize);
  byId("prev").disabled = currentPage === 0;
  byId("next").disabled = currentPage + 1 >= pages;
  byId("page-detail").textContent = (offset + 1) + "–" + (offset + page.length) + " de " + rows.length;
  const headings = ["Fecha", sport.segment, "Evento", metric.label, "Condiciones previas", "Acciones"]
    .map((heading) => el("th", { scope: "col" }, heading));
  const data = page.map((row) => {
    const value = row.values[metric.key];
    const conditions = sport.fields.filter((spec) => Number.isFinite(row.context[spec.key]))
      .map((spec) => spec.label + " " + formatValue(row.context[spec.key], spec));
    const edit = el("button", {
      type: "button", class: "row-action", "data-edit": row.id,
      "aria-label": "Editar resultado del " + displayDate(row.date) + (row.name ? ", " + row.name : ""),
    }, "Editar");
    return el("tr", { role: "row" }, el("td", { class: "table-date" }, displayDate(row.date)), el("td", {}, row.group),
      el("td", { class: row.name || row.synthetic ? "table-event" : "table-event empty-cell" }, row.name || (row.synthetic ? "Sintético" : "—")),
      el("td", { class: "table-value" }, Number.isFinite(value) ? formatValue(value, metric) : "—"),
      el("td", { class: conditions.length ? "table-context" : "table-context empty-cell" }, conditions.join(" · ") || "—"),
      el("td", {}, edit));
  });
  target.replaceChildren(el("div", { class: "table-scroll", tabindex: 0, "aria-label": "Tabla de resultados" },
    el("table", { role: "table", "aria-label": "Historial de " + athlete.name },
      el("thead", {}, el("tr", {}, ...headings)), el("tbody", { role: "rowgroup" }, ...data))));
}

function sourceLink(url, label = "Consultar fuente") {
  return el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, label);
}

function renderSources(sport) {
  byId("sport-context").textContent = sport.context || "Define el segmento y conserva las mismas unidades en cada registro.";
  const ordered = [...new Set([...(sport.references ?? []), ...Object.keys(references)])];
  const cards = ordered.map((key) => {
    const source = references[key];
    const card = el("article", { class: "source" }, el("small", {}, source.use), el("h3", {}, source.name),
      el("p", {}, source.detail));
    if (key === "statsbomb") {
      if (reference) {
        card.append(el("p", { class: "reference-stat" }, number.format(reference.shots) + " tiros en " + reference.matches
          + " partidos · " + reference.meanXg.toFixed(4) + " xG de media y "
          + reference.medianXg.toFixed(4) + " de mediana por tiro."),
        el("p", {}, "Revisión " + reference.revision.slice(0, 8) + " · reproducible con actualizar_fuente.py."));
      } else if (referenceFailed) {
        card.append(el("p", { class: "error-text" }, "No se pudo leer la referencia local."));
      }
      card.append(el("img", { src: "./statsbomb.png", alt: "StatsBomb", width: 100 }));
    }
    card.append(el("p", {}, source.terms), sourceLink(source.url));
    if (source.extra) card.append(sourceLink(source.extra.url, source.extra.label));
    return card;
  });
  byId("source-list").replaceChildren(...cards);
}

function render() {
  const sport = currentSport();
  const athlete = currentAthlete();
  const metric = currentMetric();
  renderSelectors(sport, athlete, metric);
  renderScenario(sport, athlete, metric);
  renderPending(athlete, sport, metric);
  renderHistory(sport, athlete, metric);
  renderSources(sport);
}

function onForm(id, errorId, action) {
  byId(id).addEventListener("submit", (event) => {
    event.preventDefault();
    handle(errorId, () => action(new FormData(event.currentTarget)));
  });
}

function requiredText(data, name, errorMessage) {
  const value = data.get(name)?.trim();
  if (!value) throw new Error(errorMessage);
  return value;
}

function openAthlete() {
  byId("athlete-form").reset();
  message("athlete-error");
  options(byId("athlete-sport"), allSports().map(({ id, name }) => ({ key: id, label: name })), currentSport().id);
  options(byId("athlete-metric"), currentSport().metrics, currentMetric().key);
  byId("athlete-dialog").showModal();
}

byId("add-athlete").addEventListener("click", openAthlete);
byId("athlete-sport").addEventListener("change", ({ target }) => {
  const sport = sportById(target.value);
  options(byId("athlete-metric"), sport.metrics, sport.metrics[0].key);
});
onForm("athlete-form", "athlete-error", (data) => {
  const name = requiredText(data, "name", "Ingresa un nombre o alias.");
  const sport = sportById(data.get("sport"));
  if (profilesFor(sport).some((athlete) => normalizeGroup(athlete.name) === normalizeGroup(name))) {
    throw new Error("Ya existe un deportista con ese nombre para este deporte.");
  }
  const athlete = { id: crypto.randomUUID(), name, sportId: sport.id, metricKey: data.get("metric"), rows: [] };
  persist({ ...state, athletes: [...state.athletes, athlete], sportId: sport.id, athleteId: athlete.id });
  byId("athlete-dialog").close();
  currentPage = 0;
  message("history-status");
  render();
});

function addVariable() {
  const container = byId("custom-variables");
  if (container.children.length >= 10) return;
  const id = String(++variableIndex);
  const remove = el("button", { type: "button", class: "row-action", "aria-label": "Quitar variable" }, "Quitar");
  const row = el("div", { class: "custom-variable", "data-variable": id },
    inputField("Variable", "variable-" + id, "", { maxlength: 60, placeholder: "Ej. Volumen semanal" }),
    inputField("Unidad", "unit-" + id, "", { maxlength: 18, placeholder: "Ej. m" }), remove);
  remove.addEventListener("click", () => {
    row.remove();
    byId("add-variable").disabled = false;
    byId("add-variable").focus();
  });
  container.append(row);
  byId("add-variable").disabled = container.children.length >= 10;
  return row;
}

byId("add-variable").addEventListener("click", () => addVariable()?.querySelector("input").focus());
byId("add-sport").addEventListener("click", () => {
  byId("sport-form").reset();
  byId("custom-variables").replaceChildren();
  variableIndex = 0;
  addVariable();
  message("sport-error");
  byId("sport-dialog").showModal();
});
onForm("sport-form", "sport-error", (data) => {
  const name = requiredText(data, "name", "Ingresa el nombre del deporte.");
  if (allSports().some((sport) => normalizeGroup(sport.name) === normalizeGroup(name))) {
    throw new Error("Ya existe un deporte con ese nombre.");
  }
  const bounds = { min: -1e12, max: 1e12 };
  const min = readNumber(data.get("min"), { ...bounds, label: "valor mínimo" });
  const max = readNumber(data.get("max"), { ...bounds, label: "valor máximo" });
  if (min >= max) throw new Error("El máximo debe ser mayor que el mínimo.");
  const variableNames = new Set();
  const fields = [...byId("custom-variables").children].flatMap(({ dataset }) => {
    const label = data.get("variable-" + dataset.variable).trim();
    const unit = data.get("unit-" + dataset.variable).trim();
    if (!label && unit) throw new Error("Agrega un nombre a cada variable que tenga unidad.");
    if (!label) return [];
    const normalized = normalizeGroup(label);
    if (variableNames.has(normalized)) throw new Error("Usa nombres distintos para las variables.");
    variableNames.add(normalized);
    return [{ key: "variable_" + variableNames.size, label, unit, ...bounds }];
  });
  const sport = {
    id: crypto.randomUUID(), name, fields,
    segment: requiredText(data, "segment", "Indica cómo se llama el segmento de comparación."),
    metrics: [{ key: "resultado", label: requiredText(data, "metric", "Ingresa el nombre de la métrica."),
      unit: requiredText(data, "unit", "Ingresa la unidad de medida."), min, max }],
  };
  persist({ ...state, custom: [...state.custom, sport], sportId: sport.id, athleteId: "" });
  byId("sport-dialog").close();
  currentPage = 0;
  message("history-status");
  render();
  openAthlete();
});

function openEvent(row) {
  const sport = currentSport();
  const athlete = currentAthlete();
  if (!athlete) return;
  editingId = row?.id;
  const target = byId("event-fields");
  const defaultGroup = row?.group ?? rowsFor(athlete).slice().sort(compareDates)[0]?.group ?? "";
  const inputs = [
    inputField("Fecha del resultado", "date", row?.date ?? today(), { type: "date", max: today(), required: "" }),
    inputField("Nombre del evento · opcional", "event-name", row?.name, { maxlength: 80, placeholder: "Ej. Rival, torneo o sesión" }),
    ...segmentFields(sport, splitSegment(sport, defaultGroup), []),
  ];
  target.replaceChildren(el("div", { class: "form-grid" }, ...inputs),
    fieldset("Resultados observados", sport.metrics.map((spec) => numericField(spec, "result-", row?.values))));
  if (sport.fields.length) {
    target.append(fieldset("Condiciones previas · opcionales", sport.fields.map((spec) => numericField(spec, "context-", row?.context))));
  }
  byId("event-title").textContent = editingId ? "Editar resultado" : "Registrar resultado";
  message("event-error", athlete.demo ? "Este resultado se guardará como sintético." : "");
  byId("event-dialog").showModal();
}

byId("add-event").addEventListener("click", () => openEvent());
byId("history-table").addEventListener("click", ({ target }) => {
  const id = target.closest("button[data-edit]")?.dataset.edit;
  if (id) openEvent(rowsFor(currentAthlete()).find((row) => row.id === id));
});

function rowWithId(row) {
  return { ...row, id: crypto.randomUUID() };
}

onForm("event-form", "event-error", (data) => {
  const sport = currentSport();
  const athlete = currentAthlete();
  const rows = rowsFor(athlete);
  if (!athlete || (editingId && !rows.some((row) => row.id === editingId))) {
    throw new Error("El perfil o resultado cambió. Abre el formulario de nuevo.");
  }
  const date = data.get("date");
  if (!validDate(date) || date > today()) throw new Error("Ingresa una fecha válida de hoy o anterior.");
  const values = readFields(data, sport.metrics, "result-");
  if (!Object.keys(values).length) throw new Error("Registra al menos un resultado real.");
  const row = {
    date, group: formSegment(sport, data, Object.keys(values)), name: data.get("event-name").trim(),
    values, context: readFields(data, sport.fields, "context-"), synthetic: Boolean(athlete.demo),
  };
  if (rows.some((record) => record.id !== editingId && eventKey(record) === eventKey(row))) {
    throw new Error("Ya hay un resultado con esa fecha, segmento y nombre. Edita el existente o identifica el otro evento por su nombre.");
  }
  const updated = editingId ? rows.map((record) => record.id === editingId ? { ...row, id: editingId } : record)
    : [...rows, rowWithId(row)];
  persist({ ...state, athletes: swapAthlete({ ...athlete, rows: updated }) });
  byId("event-dialog").close();
  if (!editingId) currentPage = 0;
  message("history-status", editingId ? "Resultado actualizado." : "Resultado registrado.");
  render();
});

function downloadCsv(prefix, rows) {
  const sport = currentSport();
  const file = new Blob([toCsv(sport, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const slug = sport.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  el("a", { href: url, download: prefix + "-" + slug + ".csv" }).click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

byId("template").addEventListener("click", () => downloadCsv("plantilla", []));
byId("export-csv").addEventListener("click", () => downloadCsv("historial", rowsFor(currentAthlete()).slice().sort(compareDates)));
byId("import-csv").addEventListener("click", () => byId("csv-file").click());

function sameFields(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

byId("csv-file").addEventListener("change", async ({ target }) => {
  const file = target.files[0];
  target.value = "";
  const sport = currentSport();
  const profile = currentAthlete();
  if (!file || !profile) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("La importación admite archivos de hasta 5 MB.");
    const content = await file.text();
    if (currentAthlete()?.id !== profile.id) throw new Error("El perfil activo cambió durante la importación.");
    const imported = fromCsv(content, sport, today());
    const athlete = currentAthlete();
    const rows = rowsFor(athlete);
    const known = new Map(rows.map((row) => [eventKey(row), row]));
    const fresh = [];
    for (const row of imported) {
      if (row.synthetic !== Boolean(athlete.demo)) {
        throw new Error(athlete.demo ? "Importa resultados propios en un perfil personal."
          : "Este archivo tiene resultados sintéticos. Usa el perfil de ejemplo del deporte.");
      }
      const previous = known.get(eventKey(row));
      if (!previous) fresh.push(rowWithId(row));
      else if (!sameFields(previous.values, row.values) || !sameFields(previous.context, row.context)) {
        throw new Error("Ya existe un resultado diferente para el " + displayDate(row.date) + " en «" + row.group
          + "». Edita el registro existente o corrige el CSV antes de importarlo.");
      }
    }
    if (fresh.length) {
      persist({ ...state, athletes: swapAthlete({ ...athlete, rows: [...rows, ...fresh] }) });
      currentPage = 0;
      render();
    }
    const skipped = imported.length - fresh.length;
    message("history-status", fresh.length + (fresh.length === 1 ? " resultado importado." : " resultados importados.")
      + (skipped ? " Duplicados omitidos: " + skipped + "." : ""));
  } catch (error) {
    message("history-status", error.message, true);
  }
});

byId("demo").addEventListener("click", () => handle("history-status", () => {
  const sport = currentSport();
  let demo = profilesFor(sport).find((profile) => profile.demo);
  if (!demo) {
    demo = { id: crypto.randomUUID(), name: "Ejemplo sintético", sportId: sport.id,
      metricKey: sport.metrics[0].key, demo: true, rows: demoRows(sport, today()).map(rowWithId) };
    persist({ ...state, athletes: [...state.athletes, demo], athleteId: demo.id, sportId: sport.id });
  } else {
    persist({ ...state, athleteId: demo.id, sportId: sport.id });
  }
  currentPage = 0;
  scenarioKey = "";
  render();
  runForecast();
  message("history-status", "Perfil de ejemplo seleccionado. Sus resultados son sintéticos.");
}));

byId("sport").addEventListener("change", ({ target }) => handle("status", () => {
  const sport = sportById(target.value);
  persist({ ...state, sportId: sport.id, athleteId: profilesFor(sport)[0]?.id ?? "" });
  currentPage = 0;
  message("history-status");
  render();
}));
byId("athlete").addEventListener("change", ({ target }) => handle("status", () => {
  persist({ ...state, athleteId: target.value });
  currentPage = 0;
  message("history-status");
  render();
}));
byId("metric").addEventListener("change", ({ target }) => handle("status", () => {
  const athlete = currentAthlete();
  persist({ ...state, athletes: swapAthlete({ ...athlete, metricKey: target.value }) });
  currentPage = 0;
  message("history-status");
  render();
}));

for (const delta of [-1, 1]) {
  byId(delta < 0 ? "prev" : "next").addEventListener("click", () => {
    currentPage += delta;
    renderHistory(currentSport(), currentAthlete(), currentMetric());
  });
}
document.querySelectorAll("button[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
form.addEventListener("input", () => {
  renderPending(currentAthlete(), currentSport(), currentMetric());
  message("forecast-status");
});
onForm("scenario-form", "forecast-status", runForecast);

function syncNavigation() {
  const active = location.hash || "#estimador";
  document.querySelectorAll(".nav-link").forEach((link) => {
    const selected = link.hash === active;
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

window.addEventListener("hashchange", syncNavigation);
window.addEventListener("storage", (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  if (saved === event.newValue) return;
  try {
    state = readState(event.newValue);
    saved = event.newValue;
    storageError = "";
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    render();
    message("status", "El historial se actualizó en otra pestaña.");
  } catch {
    storageError = "El historial de otra pestaña tiene un formato que no se reconoce.";
    message("status", storageError, true);
  }
});
new ResizeObserver(() => drawChart(byId("chart"), chartData)).observe(byId("chart"));

render();
syncNavigation();
fetch("./referencia.json").then((response) => {
  if (!response.ok) throw new Error("Referencia no disponible");
  return response.json();
}).then((data) => {
  reference = data;
  renderSources(currentSport());
}).catch(() => {
  referenceFailed = true;
  renderSources(currentSport());
});
