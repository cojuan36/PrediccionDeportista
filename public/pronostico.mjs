const minimumHistory = 3;
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const absError = (actual, predicted) => Math.abs(actual - predicted);
const clamp = (value, metric) => Math.min(metric.max, Math.max(metric.min, value));

export function normalizeGroup(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function comparableRows(rows, { date, group, metric }) {
  return rows
    .filter((row) => row.date < date && normalizeGroup(row.group) === normalizeGroup(group)
      && Number.isFinite(row.values[metric.key]))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function base(history, metric) {
  const used = history.slice(-5);
  const total = used.reduce((sum, row, index) => sum + (index + 1) * row.values[metric.key], 0);
  return { value: total / (used.length * (used.length + 1) / 2), used };
}

function observedRange(rows, key) {
  const values = rows.map((row) => row.context[key]).filter(Number.isFinite);
  return { key, min: Math.min(...values), max: Math.max(...values), count: values.length };
}

function similar(history, metric, context) {
  const recent = history.slice(-80);
  const ignored = [];
  const features = Object.keys(context).filter((key) => {
    const range = observedRange(recent, key);
    if (range.count < 8) ignored.push({ key, reason: "few", count: range.count });
    else if (context[key] < range.min || context[key] > range.max) ignored.push({ ...range, reason: "outside" });
    else if (range.min === range.max) ignored.push({ key, reason: "constant" });
    else return true;
    return false;
  });
  const complete = recent.filter((row) =>
    features.every((key) => Number.isFinite(row.context[key])));
  const ranges = features.map((key) => observedRange(complete, key));
  if (!Object.keys(context).length) return { reason: "empty", ignored };
  if (!features.length) return { reason: "unusable", ignored };
  if (complete.length < 8) return { reason: "overlap", ignored, count: complete.length };
  const outside = ranges.filter(({ key, min, max }) => context[key] < min || context[key] > max);
  if (outside.length) {
    return { reason: "unusable", ignored: [...ignored, ...outside.map((range) => ({ ...range, reason: "outside" }))] };
  }
  const varying = ranges.filter(({ key, min, max }) => {
    if (min !== max) return true;
    ignored.push({ key, reason: "constant" });
    return false;
  });
  if (varying.length === 0) return { reason: "unusable", ignored };
  const used = complete.map((row) => ({
    row,
    distance: average(varying.map(({ key, min, max }) =>
      Math.abs(row.context[key] - context[key]) / (max - min))),
  })).sort((a, b) => a.distance - b.distance || b.row.date.localeCompare(a.row.date)).slice(0, 5);
  return {
    value: average(used.map(({ row }) => row.values[metric.key])),
    used: used.map(({ row }) => row),
    features: varying.map(({ key }) => key),
    ignored,
  };
}

// Events on the same calendar date have unknown ordering.
function beforeEvent(history, index) {
  const date = history[index].date;
  while (index > 0 && history[index - 1].date === date) index -= 1;
  return history.slice(0, index);
}

function contextAt(row, features) {
  return Object.fromEntries(features.filter((key) => Number.isFinite(row.context[key]))
    .map((key) => [key, row.context[key]]));
}

function selectModel(history, metric, context) {
  const baseline = base(history, metric);
  const contextual = similar(history, metric, context);
  const fallback = { ...baseline, method: "recent", diagnostic: contextual };
  if (!contextual.features) return fallback;
  const { features } = contextual;
  const pastComparisons = [];
  for (let index = Math.max(8, history.length - 20); index < history.length; index += 1) {
    const actual = history[index];
    const pastContext = contextAt(actual, features);
    if (Object.keys(pastContext).length !== features.length) continue;
    const past = beforeEvent(history, index);
    const estimate = similar(past, metric, pastContext);
    if (estimate.features?.length !== features.length) continue;
    pastComparisons.push({
      recent: absError(actual.values[metric.key], base(past, metric).value),
      context: absError(actual.values[metric.key], estimate.value),
    });
  }
  const count = pastComparisons.length;
  const comparison = {
    count,
    contextMae: count ? average(pastComparisons.map((row) => row.context)) : null,
    recentMae: count ? average(pastComparisons.map((row) => row.recent)) : null,
  };
  if (count >= 6 && comparison.contextMae < comparison.recentMae) {
    return { ...contextual, method: "context", comparison, diagnostic: contextual };
  }
  return { ...fallback, comparison, diagnostic: { ...contextual, reason: count < 6 ? "tests" : "no_gain" } };
}

export function forecast(rows, { date, group, metric, context }) {
  const history = comparableRows(rows, { date, group, metric });
  if (history.length < minimumHistory) return { status: "insufficient", history, minimumHistory };
  const selected = selectModel(history, metric, context);
  const features = Object.keys(context);
  const validation = [];
  let contextualTests = 0;
  for (let index = Math.max(minimumHistory, history.length - 30); index < history.length; index += 1) {
    const actual = history[index];
    const past = beforeEvent(history, index);
    if (past.length < minimumHistory) continue;
    const simulated = selectModel(past, metric, contextAt(actual, features));
    if (simulated.method === "context") contextualTests += 1;
    validation.push(absError(actual.values[metric.key], clamp(simulated.value, metric)));
  }
  const value = clamp(selected.value, metric);
  const result = {
    ...selected, status: "ready", value, history,
    last: history.at(-1).values[metric.key],
    validation: { count: validation.length, mae: validation.length ? average(validation) : null, contextualTests },
    range: null,
  };
  if (validation.length >= 20) {
    const errors = validation.slice().sort((a, b) => a - b);
    const distance = errors[Math.ceil(errors.length * 0.8) - 1];
    result.range = [clamp(value - distance, metric), clamp(value + distance, metric)];
  }
  return result;
}

export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function readNumber(value, spec) {
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    throw new Error(`Ingresa un número válido para «${spec.label}».`);
  }
  const number = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(number) || number < spec.min || number > spec.max) {
    throw new Error(`«${spec.label}» admite valores entre ${spec.min} y ${spec.max}.`);
  }
  return number;
}

export function readFields(form, specs, prefix) {
  return Object.fromEntries(specs.flatMap((spec) => {
    const value = form.get(prefix + spec.key)?.trim();
    return value ? [[spec.key, readNumber(value, spec)]] : [];
  }));
}
