const shortDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const axisNumber = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2, notation: "compact" });

export function drawChart(canvas, data) {
  if (!data) return;
  const { history, estimate, metric, targetDate } = data;
  const rows = history.slice(-14);
  const points = rows.map((row) => ({ date: row.date, value: row.values[metric.key] }));
  if (estimate) points.push({ date: targetDate, value: estimate.value });
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  const left = 44;
  const right = bounds.width - 18;
  const top = 15;
  const bottom = bounds.height - 29;
  const values = points.map(({ value }) => value);
  const dates = points.map(({ date }) => Date.parse(date + "T00:00:00Z"));
  const min = Math.min(...values, ...(estimate?.range ?? []));
  const max = Math.max(...values, ...(estimate?.range ?? []));
  const padding = Math.max((max - min) * 0.13, Math.abs(max) * 0.005, .0001);
  const low = min - padding;
  const high = max + padding;
  const start = dates[0];
  const period = dates.at(-1) - start;
  const x = (index) => period ? left + (dates[index] - start) * (right - left) / period : (left + right) / 2;
  const y = (value) => bottom - (value - low) * (bottom - top) / (high - low);

  ctx.font = "11px Segoe UI, sans-serif";
  ctx.fillStyle = "#556557";
  ctx.strokeStyle = "#e6ece3";
  for (let index = 0; index <= 3; index += 1) {
    const value = low + index * (high - low) / 3;
    const level = y(value);
    ctx.beginPath();
    ctx.moveTo(left, level);
    ctx.lineTo(right, level);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(axisNumber.format(value), left - 6, level + 4);
  }

  function path(items, color, dash, offset) {
    ctx.beginPath();
    items.forEach(({ value }, index) => {
      if (index === 0) ctx.moveTo(x(index + offset), y(value));
      else ctx.lineTo(x(index + offset), y(value));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  path(points.slice(0, rows.length), "#518161", [], 0);
  if (estimate) {
    path(points.slice(-2), "#739935", [4, 4], rows.length - 1);
    if (estimate.range) {
      const [lower, upper] = estimate.range;
      const center = x(rows.length);
      ctx.beginPath();
      ctx.moveTo(center, y(lower));
      ctx.lineTo(center, y(upper));
      for (const edge of [lower, upper]) {
        ctx.moveTo(center - 4, y(edge));
        ctx.lineTo(center + 4, y(edge));
      }
      ctx.strokeStyle = "#86a848";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  points.forEach(({ value }, index) => {
    const projected = index === rows.length;
    ctx.fillStyle = projected ? "#a4ce43" : "#518161";
    ctx.beginPath();
    ctx.arc(x(index), y(value), projected ? 4.8 : 2.9, 0, Math.PI * 2);
    ctx.fill();
  });
  const last = points.length - 1;
  const middle = dates.findIndex((date) => date >= start + period / 2);
  const dateIndices = period ? [0, last] : [0];
  if (middle > 0 && middle < last && x(middle) - left > 65 && right - x(middle) > 65) dateIndices.push(middle);
  ctx.fillStyle = "#556557";
  dateIndices.forEach((index) => {
    ctx.textAlign = period && index === 0 ? "left" : period && index === last ? "right" : "center";
    ctx.fillText(shortDate.format(new Date(points[index].date + "T00:00:00Z")), x(index), bottom + 19);
  });
}
