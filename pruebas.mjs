import assert from "node:assert/strict";
import test from "node:test";
import { fromCsv, toCsv } from "./public/csv.mjs";
import { demoRows, readSegment, sports, splitSegment } from "./public/deportes.mjs";
import { forecast } from "./public/pronostico.mjs";

const football = sports.find(({ id }) => id === "futbol");
const target = { date: "2026-11-19", group: "Delantero", metric: football.metrics[0] };
const today = "2026-11-18";

test("simula todos los resultados de una fecha usando únicamente fechas anteriores", () => {
  const rows = [1, 2, 3, 4, 4].map((day) => ({
    date: "2026-11-0" + day,
    group: "Delantero",
    values: { tiros: day === 4 ? 24 : 0 },
    context: {},
  }));
  const result = forecast(rows, { ...target, context: {} });
  assert.equal(result.validation.count, 2);
  assert.equal(result.validation.mae, 24);
  assert.equal(result.range, null);
  const tooEarly = forecast(rows, { ...target, date: "2026-11-03", context: {} });
  assert.equal(tooEarly.status, "insufficient");
  assert.equal(tooEarly.history.length, 2);
});

test("usa condiciones similares si reducen el error y evita extrapolar", () => {
  const rows = demoRows(football, today);
  const low = forecast(rows, { ...target, context: { minutos: 54 } });
  const high = forecast(rows, { ...target, context: { minutos: 87 } });
  const outside = forecast(rows, { ...target, context: { minutos: 120 } });
  assert.equal(low.method, "context");
  assert.ok(low.comparison.contextMae < low.comparison.recentMae);
  assert.ok(low.value < high.value);
  assert.equal(outside.method, "recent");
  assert.equal(outside.diagnostic.ignored[0].reason, "outside");
  assert.equal(low.validation.count, 27);
  assert.ok(low.range[0] <= low.value && low.value <= low.range[1]);
});

test("conserva ceros, valores exactos, celdas vacías y el origen al reimportar el CSV", () => {
  const rows = [{
    date: today, group: "Delantero", name: 'Fecha, "copa"; ida', synthetic: true,
    values: { tiros: 0, xg: 1e-8 }, context: { descanso: 0 },
  }];
  assert.deepEqual(fromCsv(toCsv(football, rows), football, today), rows);
  assert.throws(() => fromCsv('fecha,segmento,tiros\n2026-11-18,Dela"ntero,0', football, today), /comillas/);
});

test("valida las pruebas y formatos que cambian el significado de una marca", () => {
  const athletics = sports.find(({ id }) => id === "atletismo");
  const powerlifting = sports.find(({ id }) => id === "powerlifting");
  assert.throws(() => readSegment(athletics, ["Carrera"], ["tiempo"]), /Distancia/);
  assert.throws(() => readSegment(powerlifting, ["Raw", "83 kg", "B"], ["total"]), /formato/);
  assert.equal(readSegment(powerlifting, splitSegment(powerlifting, "Raw / 83 kg / B"), ["banca"]), "Raw / 83 kg / B");
});
