// Read printed product codes locally and pair them with nearby shoe crops.
let sheetOCRLibrary;
let sheetCodeRun = 0;

function loadSheetOCR() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!sheetOCRLibrary) sheetOCRLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => {
      sheetOCRLibrary = null;
      script.remove();
      reject(Error('OCR download failed'));
    };
    document.head.append(script);
  });
  return sheetOCRLibrary;
}

function printedCodeTokens(data, width, height) {
  const tokens = [];
  for (const block of data.blocks || [])
    for (const paragraph of block.paragraphs || [])
      for (const line of paragraph.lines || [])
        for (const word of line.words || []) {
          const text = (word.text || '').trim().toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '');
          if (!/^[A-Z0-9]{6}$/.test(text) || (word.confidence || 0) < 40 || !word.bbox) continue;
          const b = word.bbox;
          tokens.push({
            code: text,
            confidence: word.confidence,
            x: (b.x0 + b.x1) / 2 / width,
            y: (b.y0 + b.y1) / 2 / height
          });
        }
  return tokens;
}

function pairPrintedCodes(crops, tokens) {
  const edges = [];
  crops.forEach((crop, i) => {
    if (validProductId(crop.code)) return;
    const b = crop.box,
      cx = b.x + b.w / 2,
      cy = b.y + b.h / 2;
    // Stop at the next row, so its code cannot be assigned to this shoe.
    const next = crops.filter(p => p !== crop && Math.abs(p.box.x + p.box.w / 2 - cx) < Math.max(b.w, .06) && p.box.y > cy).map(p => p.box.y);
    const bottom = Math.min(b.y + b.h + Math.max(b.h * .9, .055), ...next);
    tokens.forEach((t, j) => {
      const dx = Math.abs(t.x - cx);
      if (dx > Math.max(b.w * .65, .035) || t.y < b.y - Math.max(b.h * .65, .04) || t.y >= bottom) return;
      const distance = t.y >= cy ? Math.abs(t.y - (b.y + b.h)) : Math.abs(t.y - b.y) + .025;
      edges.push({
        i,
        j,
        score: dx * 2 + distance + (/\d/.test(t.code) ? 0 : .06) + (100 - t.confidence) * .0002
      });
    });
  });
  edges.sort((a, b) => a.score - b.score);
  const usedCrops = new Set(),
    usedTokens = new Set();
  for (const e of edges)
    if (!usedCrops.has(e.i) && !usedTokens.has(e.j)) {
      crops[e.i].code = tokens[e.j].code;
      usedCrops.add(e.i);
      usedTokens.add(e.j);
    }
}
async function readSheetCodes() {
  if (!cropImage || !candidates.length) return;
  const run = ++sheetCodeRun,
    image = cropImage,
    crops = candidates;
  let worker;
  $('#importCrops').disabled = true;
  $('#sheetProgress').textContent = 'Reading printed product codes…';
  try {
    const OCR = await loadSheetOCR();
    worker = await OCR.createWorker('eng', 1, {
      logger: m => {
        if (run === sheetCodeRun && image === cropImage && m.status === 'recognizing text') $('#sheetProgress').textContent = 'Reading product codes… ' + Math.round(m.progress * 100) + '%';
      }
    });
    await worker.setParameters({
      tessedit_pageseg_mode: '11',
      user_defined_dpi: '300'
    });
    const canvas = document.createElement('canvas');
    const scale = Math.min(2, 2400 / image.width);
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const {
      data
    } = await worker.recognize(canvas, {}, {
      text: true,
      blocks: true
    });
    if (run !== sheetCodeRun || image !== cropImage || crops !== candidates) return;
    pairPrintedCodes(crops, printedCodeTokens(data, canvas.width, canvas.height));
    // Unreadable codes are excluded rather than invented or attached to a wrong shoe.
    for (const p of crops)
      if (!validProductId(p.code)) p.selected = false;
    renderCandidates();
    const found = crops.filter(p => validProductId(p.code)).length;
    $('#sheetProgress').textContent = found + ' of ' + crops.length + ' product codes read automatically. Check the previews.' + (found < crops.length ? ' Unreadable codes are unchecked; try a clearer photo or correct those previews.' : '');
  } catch {
    if (run === sheetCodeRun && image === cropImage && crops === candidates) {
      renderCandidates();
      $('#sheetProgress').textContent = 'Product codes could not be read. Check your internet connection and try Detect again, or use a clearer photo.';
    }
  } finally {
    if (worker) await worker.terminate();
    if (run === sheetCodeRun && image === cropImage && crops === candidates) $('#importCrops').disabled = !crops.some(p => p.selected && validProductId(p.code));
  }
}
