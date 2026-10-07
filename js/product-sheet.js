// Find shoe images within a photographed product sheet.
function detectShoes(pixels, w, h) {
  const gray = new Float32Array(w * h),
    integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      let i = y * w + x,
        j = i * 4;
      gray[i] = .299 * pixels[j] + .587 * pixels[j + 1] + .114 * pixels[j + 2];
      sum += gray[i];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + sum
    }
  }
  const mask = new Uint8Array(w * h);
  let radius = 14;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        j = i * 4,
        max = Math.max(pixels[j], pixels[j + 1], pixels[j + 2]),
        min = Math.min(pixels[j], pixels[j + 1], pixels[j + 2]),
        sat = max ? (max - min) / max : 0;
      const x0 = Math.max(0, x - radius),
        x1 = Math.min(w, x + radius + 1),
        y0 = Math.max(0, y - radius),
        y1 = Math.min(h, y + radius + 1);
      const avg = (integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w +
        1) + x0] + integral[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      if ((sat > .24 && max > 55 && gray[i] < 210) || (gray[i] < avg - 40 && gray[i] < 145)) mask[
        i] = 1
    }
  const spread = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++)
      if (mask[y * w + x])
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) spread[(y + dy) * w + x + dx] = 1;
  const boxes = [],
    queue = new Int32Array(w * h);
  for (let i = 0; i < spread.length; i++) {
    if (!spread[i]) continue;
    spread[i] = 0;
    let start = 0,
      end = 1;
    queue[0] = i;
    let minx = w,
      miny = h,
      maxx = 0,
      maxy = 0,
      area = 0;
    while (start < end) {
      const n = queue[start++],
        x = n % w,
        y = Math.floor(n / w);
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
      area++;
      for (const d of [-1, 1, -w, w]) {
        const z = n + d;
        if (z < 0 || z >= spread.length || Math.abs(z % w - x) > 1 || !spread[z]) continue;
        spread[z] = 0;
        queue[end++] = z
      }
    }
    const bw = maxx - minx + 1,
      bh = maxy - miny + 1;
    if (bw > w * .045 && bw < w * .31 && bh > h * .018 && bh < h * .115 && bw / bh > 1.25 && bw /
      bh < 4.8 && area > bw * bh * .13) {
      const pad = Math.max(3, Math.round(bw * .05));
      boxes.push({
        x: Math.max(0, minx - pad) / w,
        y: Math.max(0, miny - pad) / h,
        w: Math.min(w - minx + pad, bw + pad * 2) / w,
        h: Math.min(h - miny + pad, bh + pad * 2) / h
      })
    }
  }
  const aligned = boxes.filter(a => boxes.filter(b => Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) <
    .03).length >= 3);
  const selected = aligned.length >= 3 ? aligned : boxes;
  selected.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const rows = [];
  for (const b of selected) {
    const cy = b.y + b.h / 2;
    let row = rows.find(r => Math.abs(r.cy - cy) < .03);
    if (!row) {
      row = {
        cy,
        boxes: []
      };
      rows.push(row)
    }
    row.boxes.push(b)
  }
  return rows.flatMap(r => r.boxes.sort((a, b) => a.x - b.x)).slice(0, 100)
}
