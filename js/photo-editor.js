// Photo canvas: move shoes, draw shapes, resize objects and edit rack labels.
let photoSelection = null;
const fixtureMode = () => !plan().view || plan().view === 'model';
const objectStoreKey = () => fixtureMode() ? 'modelObjects' : 'objects';
const photoObjects = () => plan()[objectStoreKey()] || [];
const photoMode = () => plan().view !== 'grid';
const selectedPhotoObject = () => photoObjects().find(o => o.id === photoSelection);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const colour = value => /^#[a-f0-9]{6}$/i.test(value) ? value : '#333333';
const oldBoard = board;
const oldInspector = inspector;
const oldZoom = applyZoom;
const oldPNG = $('#pngBtn').onclick;

function objectMarkup(o) {
  const selected = o.id === photoSelection;
  let content;
  if (o.kind === 'shoe') {
    const p = product(o.product);
    if (!p) return '';
    content = p.kind === 'advertisement' ?
      `<div class="photo-ad">${esc(p.code)}</div>` :
      `<div class="photo-shoe"><img src="${esc(p.image)}" alt="${esc(p.code)}" style="transform:rotate(${o.rotation || 0}deg)"><span>${esc(p.code)}</span></div>`;
  } else if (o.kind === 'text') {
    content =
      `<div class="photo-text" style="color:${colour(o.fill)};font-size:${o.font || 26}px">${esc(o.text)}</div>`;
  } else {
    const fill = o.transparent ? 'none' : colour(o.fill);
    const stroke = colour(o.stroke);
    const width = o.strokeWidth || 3;
    let shape;
    if (o.kind === 'rect') shape = `<rect x="1" y="1" width="98" height="98" fill="${fill}"/>`;
    if (o.kind === 'ellipse') shape = `<ellipse cx="50" cy="50" rx="48" ry="48" fill="${fill}"/>`;
    if (o.kind === 'line') shape =
      `<line x1="2" y1="${o.reverse ? 98 : 2}" x2="98" y2="${o.reverse ? 2 : 98}"/>`;
    if (o.kind === 'pen') shape =
      `<polyline fill="none" points="${(o.points || []).map(p => `${p[0]*100},${p[1]*100}`).join(' ')}"/>`;
    content =
      `<svg viewBox="0 0 100 100" preserveAspectRatio="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${shape || ''}</svg>`;
  }
  return `<div class="photo-object ${selected ? 'photo-selected' : ''}" data-object="${esc(o.id)}" style="left:${o.x*100}%;top:${o.y*100}%;width:${o.w*100}%;height:${o.h*100}%" tabindex="0" role="button" aria-label="${esc(o.kind === 'text' ? o.text : o.kind + ' object')}">${content}${selected ? '<span class="resize-handle" data-resize aria-label="Resize"></span>' : ''}</div>`;
}

board = function() {
  if (!photoMode()) {
    $('#board').classList.remove('photo-board');
    $('#drawingTool').disabled = true;
    $('#drawingColour').disabled = true;
    $('#wallView').value = 'grid';
    oldBoard();
    return;
  }
  $('#wallView').value = fixtureMode() ? 'model' : 'photo';
  $('#drawingTool').disabled = false;
  $('#drawingColour').disabled = false;
  $('#board').classList.add('photo-board');
  $('#board').innerHTML =
    '<div id="photoScene" class="photo-scene">' + (fixtureMode() ? fixtureBackdropMarkup() : '<img class="rack-background" src="assets/rack-render.png" alt="3D-style illustration of empty shoe display rails and shelves" draggable="false">') + '<div id="photoObjects">' +
    photoObjects().map(objectMarkup).join('') + '</div></div>';
  $('#stats').textContent =
    `${photoObjects().length} objects · ${photoObjects().filter(o => o.kind === 'shoe').length} products`;
  $('#desktopHint').textContent =
    'Choose a product and click its place, or choose a drawing tool.';
  $('#mobileHint').textContent = 'Choose a product, then tap the rack. Use Details to edit.';
  $('#referenceBtn').hidden = true;
  applyZoom();
  wirePhotoCanvas();
};

applyZoom = function() {
  if (!state || !photoMode()) return oldZoom();
  let zoom = Number($('#zoom').value);
  if ($('#zoom').value === 'fit') {
    const wrap = $('.boardwrap');
    zoom = Math.min(1, Math.max(.2, Math.min(((wrap.clientWidth || 900) - 30) / 1200, ((wrap
      .clientHeight || 700) - 30) / 900)));
  }
  $('#board').style.zoom = zoom;
};
$('#zoom').onchange = applyZoom;
window.addEventListener('resize', applyZoom);

$('#wallView').onchange = event => {
  photoSelection = null;
  chosen = null;
  position = null;
  change(() => plan().view = event.target.value);
};
$('#drawingTool').onchange = () => {
  chosen = null;
  position = null;
  photoSelection = null;
  board();
  inspector();
  tab('wall');
};

function addPhotoObject(o) {
  photoSelection = o.id;
  chosen = null;
  position = null;
  $('#drawingTool').value = 'select';
  change(() => {
    if (!plan()[objectStoreKey()]) plan()[objectStoreKey()] = [];
    plan()[objectStoreKey()].push(o);
  });
}

function addPhotoShoe(productId, x, y) {
  const p = product(productId);
  if (!p) return;
  const ad = p.kind === 'advertisement';
  addPhotoObject({
    id: uid(),
    kind: 'shoe',
    product: productId,
    x: clamp(x - .055, 0, .89),
    y: clamp(y - .04, 0, .88),
    w: .11,
    h: ad ? .147 : .08,
    rotation: 0
  });
}

function wirePhotoCanvas() {
  const scene = $('#photoScene');
  const point = event => {
    const rect = scene.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  };
  scene.ondragover = event => event.preventDefault();
  scene.ondrop = event => {
    event.preventDefault();
    const p = point(event);
    const id = event.dataTransfer.getData('text/plain');
    if (product(id)) addPhotoShoe(id, p.x, p.y);
  };
  scene.onpointerdown = event => {
    if (event.button !== 0) return;
    const start = point(event);
    const target = event.target.closest('[data-object]');
    const tool = $('#drawingTool').value;
    if (chosen && product(chosen)) {
      event.preventDefault();
      addPhotoShoe(chosen, start.x, start.y);
      return;
    }
    if (tool === 'text') {
      const text = prompt('Type your rack label', 'Rack label');
      if (text?.trim()) addPhotoObject({
        id: uid(),
        kind: 'text',
        text: text.slice(0, 500),
        x: clamp(start.x, 0, .78),
        y: clamp(start.y, 0, .92),
        w: .22,
        h: .08,
        fill: $('#drawingColour').value,
        font: 26
      });
      return;
    }
    let object, before, action;
    const points = [start];
    if (tool === 'select') {
      if (!target) {
        photoSelection = null;
        board();
        inspector();
        return;
      }
      photoSelection = target.dataset.object;
      object = selectedPhotoObject();
      before = JSON.stringify(state);
      action = event.target.closest('[data-resize]') ? 'resize' : 'move';
      // Preserve the captured element during the gesture.
      document.querySelectorAll('.photo-object').forEach(el => el.classList.toggle(
        'photo-selected', el.dataset.object === photoSelection));
      inspector();
    } else {
      before = JSON.stringify(state);
      action = 'draw';
      object = {
        id: uid(),
        kind: tool,
        x: start.x,
        y: start.y,
        w: .001,
        h: .001,
        fill: $('#drawingColour').value,
        stroke: $('#drawingColour').value,
        strokeWidth: 3,
        transparent: tool === 'line' || tool === 'pen'
      };
      if (!plan()[objectStoreKey()]) plan()[objectStoreKey()] = [];
      plan()[objectStoreKey()].push(object);
      photoSelection = object.id;
    }
    event.preventDefault();
    scene.setPointerCapture(event.pointerId);
    const original = structuredClone(object);
    const children = photoObjects().filter(v => v.parent === object.id).map(v => structuredClone(v));
    let moved = false;
    scene.onpointermove = moveEvent => {
      const p = point(moveEvent);
      const dx = p.x - start.x,
        dy = p.y - start.y;
      if (Math.abs(dx) + Math.abs(dy) > .003) moved = true;
      if (action === 'move') {
        object.x = clamp(original.x + dx, 0, 1 - object.w);
        object.y = clamp(original.y + dy, 0, 1 - object.h);
      }
      if (action === 'resize') {
        object.w = clamp(original.w + dx, .02, 1 - object.x);
        object.h = clamp(original.h + dy, .02, 1 - object.y);
      }
      if (action === 'move' || action === 'resize') transformFixtureChildren(object, original, children);
      if (action === 'draw') {
        if (tool === 'pen') points.push(p);
        const ps = tool === 'pen' ? points : [start, p];
        object.x = Math.min(...ps.map(p => p.x));
        object.y = Math.min(...ps.map(p => p.y));
        object.w = Math.max(.003, Math.max(...ps.map(p => p.x)) - object.x);
        object.h = Math.max(.003, Math.max(...ps.map(p => p.y)) - object.y);
        object.reverse = dx * dy < 0;
        if (tool === 'pen') object.points = points.map(p => [(p.x - object.x) / object.w, (p.y -
          object.y) / object.h]);
      }
      $('#photoObjects').innerHTML = photoObjects().map(objectMarkup).join('');
    };
    const finish = (cancelled = false) => {
      scene.onpointermove = null;
      scene.onpointerup = null;
      scene.onpointercancel = null;
      if (cancelled || action === 'draw' && !moved) {
        state = JSON.parse(before);
        photoSelection = null;
      } else if (moved) {
        history.push(before);
        if (history.length > 50) history.shift();
        future = [];
        revision++;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 500);
        $('#saveStatus').textContent = 'Unsaved changes';
      }
      $('#drawingTool').value = 'select';
      board();
      inspector();
    };
    scene.onpointerup = () => finish();
    scene.onpointercancel = () => finish(true);
  };
}

inspector = function() {
  if (!state || !photoMode()) return oldInspector();
  const o = selectedPhotoObject();
  if (!o) {
    $('#inspectorBody').innerHTML =
      '<div class="noselection muted">Choose a product and tap the rack to place it. Draw a shape or add text using the toolbar, then select it to edit.</div>';
    return;
  }
  const p = o.kind === 'shoe' ? product(o.product) : null;
  $('#inspectorBody').innerHTML =
    `<p class="muted">${esc(p?.code || o.kind)}</p>${o.kind==='text'?`<label for="objectText">Rack label</label><textarea id="objectText" maxlength="500" rows="3">${esc(o.text)}</textarea><label for="objectFont">Text size</label><input id="objectFont" type="number" min="12" max="120" value="${o.font||26}">`:''}<label for="objectWidth">Width (% of wall)</label><input id="objectWidth" type="number" min="2" max="100" step="1" value="${Math.round(o.w*100)}"><label for="objectHeight">Height (% of wall)</label><input id="objectHeight" type="number" min="2" max="100" step="1" value="${Math.round(o.h*100)}">${o.kind==='shoe'?`<label for="objectRotation">Shoe direction</label><select id="objectRotation"><option value="0">Horizontal</option><option value="90">Vertical — toe up</option><option value="270">Vertical — toe down</option></select>`:`<label for="objectFill">${o.kind==='text'?'Text colour':'Fill colour'}</label><input id="objectFill" type="color" value="${colour(o.fill)}">${o.kind!=='text'?`<label for="objectStroke">Line colour</label><input id="objectStroke" type="color" value="${colour(o.stroke)}"><label for="objectStrokeWidth">Line thickness</label><input id="objectStrokeWidth" type="number" min="1" max="15" value="${o.strokeWidth||3}"><label><input id="objectTransparent" type="checkbox" ${o.transparent?'checked':''}> No fill</label>`:''}`}<div class="actions"><button id="objectCopy">Duplicate</button><button id="objectDelete" class="danger">Delete</button></div><div class="actions"><button id="objectFront">Bring forward</button><button id="objectBack">Send backward</button></div><p class="muted">Drag the object to move it. Drag its corner handle to resize.</p>`;
  $('#objectWidth').onchange = e => change(() => o.w = clamp(Number(e.target.value) / 100, .02,
    1 - o.x));
  $('#objectHeight').onchange = e => change(() => o.h = clamp(Number(e.target.value) / 100, .02,
    1 - o.y));
  if (o.kind === 'text') {
    $('#objectText').onchange = e => change(() => o.text = e.target.value);
    $('#objectFont').onchange = e => change(() => o.font = clamp(Number(e.target.value), 12,
      120));
  }
  if (o.kind === 'shoe') {
    $('#objectRotation').value = String(o.rotation || 0);
    $('#objectRotation').onchange = e => change(() => o.rotation = Number(e.target.value));
  } else {
    $('#objectFill').onchange = e => change(() => o.fill = e.target.value);
    if (o.kind !== 'text') {
      $('#objectStroke').onchange = e => change(() => o.stroke = e.target.value);
      $('#objectStrokeWidth').onchange = e => change(() => o.strokeWidth = clamp(Number(e.target
        .value), 1, 15));
      $('#objectTransparent').onchange = e => change(() => o.transparent = e.target.checked);
    }
  }
  $('#objectCopy').onclick = () => {
    const copy = structuredClone(o);
    copy.id = uid();
    copy.x = clamp(o.x + .02, 0, 1 - o.w);
    copy.y = clamp(o.y + .02, 0, 1 - o.h);
    addPhotoObject(copy);
  };
  $('#objectDelete').onclick = () => {
    photoSelection = null;
    change(() => plan()[objectStoreKey()] = photoObjects().filter(v => v.id !== o.id));
  };
  $('#objectFront').onclick = () => change(() => {
    plan()[objectStoreKey()] = photoObjects().filter(v => v.id !== o.id);
    plan()[objectStoreKey()].push(o);
  });
  $('#objectBack').onclick = () => change(() => {
    plan()[objectStoreKey()] = photoObjects().filter(v => v.id !== o.id);
    plan()[objectStoreKey()].unshift(o);
  });
};

async function photoExport() {
  let image;
  if (!fixtureMode()) {
    image = new Image();
    image.src = 'assets/rack-render.png';
    await image.decode();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (fixtureMode()) drawFixtureBackdrop(ctx, 1600, 1200);
  else ctx.drawImage(image, 0, 0, 1600, 1200);
  for (const o of photoObjects()) {
    const x = o.x * 1600,
      y = o.y * 1200,
      w = o.w * 1600,
      h = o.h * 1200;
    ctx.save();
    ctx.fillStyle = colour(o.fill);
    ctx.strokeStyle = colour(o.stroke);
    ctx.lineWidth = (o.strokeWidth || 3) * 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (['pillar', 'shelf'].includes(o.kind)) {
      drawFixturePart(ctx, o, 1600, 1200);
    } else if (o.kind === 'shoe') {
      const p = product(o.product);
      if (!p) {
        ctx.restore();
        continue;
      }
      if (p.kind === 'advertisement') {
        ctx.fillStyle = 'white';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#888';
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#333';
        ctx.font = '22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.code, x + w / 2, y + h / 2, w - 8);
      } else {
        const shoe = new Image();
        shoe.src = p.image;
        await shoe.decode();
        const rot = o.rotation || 0;
        const scale = rot ? Math.min((h - 20) / shoe.width, w / shoe.height) : Math.min(w / shoe
          .width, (h - 20) / shoe.height);
        ctx.translate(x + w / 2, y + (h - 20) / 2);
        ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(shoe, -shoe.width * scale / 2, -shoe.height * scale / 2, shoe.width * scale,
          shoe.height * scale);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#333';
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.code, x + w / 2, y + h - 3, w);
      }
    } else if (o.kind === 'text') {
      ctx.font = `${(o.font||26)*1600/1200}px Arial`;
      o.text.split('\n').forEach((line, i) => ctx.fillText(line, x, y + (o.font || 26) * (i + 1) *
        1600 / 1200, w));
    } else {
      ctx.beginPath();
      if (o.kind === 'rect') ctx.rect(x, y, w, h);
      if (o.kind === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math
        .PI);
      if (o.kind === 'line') {
        ctx.moveTo(x, o.reverse ? y + h : y);
        ctx.lineTo(x + w, o.reverse ? y : y + h);
      }
      if (o.kind === 'pen') {
        (o.points || []).forEach((p, i) => i ? ctx.lineTo(x + p[0] * w, y + p[1] * h) : ctx
          .moveTo(x + p[0] * w, y + p[1] * h));
      }
      if (!o.transparent && ['rect', 'ellipse'].includes(o.kind)) ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  download(await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), filename() +
    '.png');
}
$('#pngBtn').onclick = async () => {
  if (!photoMode()) return oldPNG();
  $('#pngBtn').disabled = true;
  try {
    await photoExport();
    toast('Wall image downloaded.');
  } catch {
    toast('Could not export the photo wall. Please retry.');
  } finally {
    $('#pngBtn').disabled = false;
  }
};

// Reject malformed drawing data when an editable backup is imported.
const backupImport = $('#backupFile').onchange;
$('#backupFile').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    for (const p of data.plans || []) {
      for (const key of ['objects', 'modelObjects']) {
        if (p[key] !== undefined) {
          if (!Array.isArray(p[key]) || p[key].length > 1000) throw Error();
          for (const o of p[key]) {
            if (!['shoe', 'text', 'rect', 'ellipse', 'line', 'pen', 'pillar', 'shelf'].includes(o.kind) || typeof o
              .id !== 'string' || !['x', 'y', 'w', 'h'].every(k => Number.isFinite(o[k]) && o[
                k] >= 0 && o[k] <= 1) || o.w <= 0 || o.h <= 0) throw Error();
            if (o.rotation !== undefined && ![0, 90, 270].includes(o.rotation)) throw Error();
            if (o.font !== undefined && (!Number.isFinite(o.font) || o.font < 12 || o.font > 120))
              throw Error();
            if (o.strokeWidth !== undefined && (!Number.isFinite(o.strokeWidth) || o.strokeWidth <
                1 || o.strokeWidth > 15)) throw Error();
            if (o.kind === 'shoe' && !data.products.some(v => v.id === o.product)) throw Error();
            if (o.kind === 'text' && (typeof o.text !== 'string' || o.text.length > 500))
              throw Error();
            if (o.kind === 'pen' && (!Array.isArray(o.points) || o.points.length > 10000 || o
                .points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number
                  .isFinite(n) || n < 0 || n > 1)))) throw Error();
          }
        }
      }
    }
  } catch {
    toast('This backup contains invalid drawing data.');
    return;
  }
  photoSelection = null;
  await backupImport(event);
};
