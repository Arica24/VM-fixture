// Editable architectural fixture. All dimensions are fractions of the wall.
function fixtureBackdropMarkup() {
  return '<svg class="rack-background" viewBox="0 0 1200 900" aria-label="Beige illustrated wall and floor"><path fill="#eee6d8" d="M0 0H1200V760H0Z"/><path fill="#d8cbb7" d="M0 760H1200V900H0Z"/><path fill="none" stroke="#726b60" stroke-width="2" d="M0 760H1200M0 900L220 760M1200 900L980 760"/></svg>';
}

function fixturePolygons(o) {
  return o.kind === 'pillar' ? [
    [0, 6, 68, 6, 68, 100, 0, 100],
    [68, 6, 100, 0, 100, 94, 68, 100],
    [0, 6, 32, 0, 100, 0, 68, 6]
  ] : [
    [0, 30, 80, 30, 100, 0, 20, 0],
    [0, 30, 80, 30, 80, 100, 0, 100],
    [80, 30, 100, 0, 100, 70, 80, 100]
  ];
}

function fixtureShades(o) {
  return [colour(o.fill), o.kind === 'pillar' ? '#b9ad98' : '#9d978d', '#f8f3e9'];
}
const illustrationObjectMarkup = objectMarkup;
objectMarkup = function(o) {
  if (!['pillar', 'shelf'].includes(o.kind)) return illustrationObjectMarkup(o);
  const shades = fixtureShades(o);
  const polygons = fixturePolygons(o).map((p, i) => `<polygon points="${p.join(' ')}" fill="${o.transparent?'none':shades[i]}"/>`).join('');
  return `<div class="photo-object ${o.id===photoSelection?'photo-selected':''}" data-object="${esc(o.id)}" style="left:${o.x*100}%;top:${o.y*100}%;width:${o.w*100}%;height:${o.h*100}%" role="button" tabindex="0" aria-label="${o.kind}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" stroke="${colour(o.stroke)}" stroke-width="${o.strokeWidth||1}" vector-effect="non-scaling-stroke">${polygons}</svg>${o.id===photoSelection?'<span class="resize-handle" data-resize></span>':''}</div>`;
};

function makeFixtureColumn(x) {
  const rail = {
    id: uid(),
    kind: 'pillar',
    x,
    y: .045,
    w: .018,
    h: .79,
    fill: '#e9dfcd',
    stroke: '#635e55',
    strokeWidth: 1
  };
  return [rail, ...Array.from({
    length: 7
  }, (_, i) => ({
    id: uid(),
    kind: 'shelf',
    parent: rail.id,
    x: x - .02,
    y: .225 + i * .078,
    w: .07,
    h: .022,
    fill: '#ddd6c8',
    stroke: '#635e55',
    strokeWidth: 1
  }))];
}

function transformFixtureChildren(o, original, children) {
  for (const before of children) {
    const child = photoObjects().find(v => v.id === before.id);
    if (!child) continue;
    child.x = clamp(o.x + (before.x - original.x) * o.w / original.w, 0, 1 - before.w);
    child.y = clamp(o.y + (before.y - original.y) * o.h / original.h, 0, 1 - before.h);
  }
}
const illustrationBoard = board;
board = function() {
  if (fixtureMode() && !plan().modelObjects) plan().modelObjects = Array.from({
    length: 12
  }, (_, i) => makeFixtureColumn(.055 + i * .077)).flat();
  illustrationBoard();
  for (const id of ['addPillar', 'addShelf', 'fixtureAd']) $('#' + id).hidden = !fixtureMode();
  for (const id of ['addBar', 'addRow', 'removeRow']) $('#' + id).hidden = photoMode();
};
const illustrationInspector = inspector;
inspector = function() {
  illustrationInspector();
  if (!photoMode()) return;
  const o = selectedPhotoObject();
  if (o?.kind === 'shoe' && product(o.product)?.kind !== 'advertisement') {
    const label = document.createElement('label');
    label.textContent = 'Product code (six characters)';
    const input = document.createElement('input');
    input.value = product(o.product).code;
    input.maxLength = 6;
    input.onchange = () => {
      const code = normaliseProductId(input.value);
      if (!validProductId(code)) {
        toast('Enter six letters or numbers.');
        input.value = product(o.product).code;
        return;
      }
      change(() => product(o.product).code = code);
    };
    $('#inspectorBody').prepend(input);
    $('#inspectorBody').prepend(label);
  }
  if (!o || o.kind !== 'pillar') return;
  const resize = (key, value) => change(() => {
    const before = structuredClone(o),
      children = photoObjects().filter(v => v.parent === o.id).map(v => structuredClone(v));
    o[key] = clamp(value, .02, 1 - o[key === 'w' ? 'x' : 'y']);
    transformFixtureChildren(o, before, children);
  });
  $('#objectWidth').onchange = e => resize('w', Number(e.target.value) / 100);
  $('#objectHeight').onchange = e => resize('h', Number(e.target.value) / 100);
  $('#objectCopy').onclick = () => {
    const children = photoObjects().filter(v => v.parent === o.id).map(v => structuredClone(v));
    const copy = structuredClone(o);
    copy.id = uid();
    copy.x = clamp(o.x + .08, 0, 1 - o.w);
    change(() => {
      plan()[objectStoreKey()].push(copy, ...children.map(v => ({
        ...v,
        id: uid(),
        parent: copy.id,
        x: clamp(v.x + copy.x - o.x, 0, 1 - v.w)
      })));
      photoSelection = copy.id;
    });
  };
  $('#objectDelete').onclick = () => change(() => {
    plan()[objectStoreKey()] = photoObjects().filter(v => v.id !== o.id && v.parent !== o.id);
    photoSelection = null;
  });
};
$('#addPillar').onclick = () => {
  const objects = makeFixtureColumn(.48);
  photoSelection = objects[0].id;
  chosen = null;
  change(() => plan().modelObjects.push(...objects));
};
$('#addShelf').onclick = () => {
  const rail = selectedPhotoObject();
  addPhotoObject({
    id: uid(),
    kind: 'shelf',
    parent: rail?.kind === 'pillar' ? rail.id : undefined,
    x: rail?.kind === 'pillar' ? clamp(rail.x - .02, 0, .93) : .45,
    y: .5,
    w: .07,
    h: .022,
    fill: $('#drawingColour').value,
    stroke: '#635e55',
    strokeWidth: 1
  });
};
$('#fixtureAd').onclick = () => {
  let ad = state.products.find(p => p.kind === 'advertisement' && p.code === 'Advertisement');
  if (!ad) {
    ad = {
      id: uid(),
      kind: 'advertisement',
      code: 'Advertisement',
      image: 'assets/advertisement.svg'
    };
    change(() => state.products.push(ad));
  }
  addPhotoShoe(ad.id, .5, .42);
};

function drawFixtureBackdrop(ctx, w, h) {
  ctx.fillStyle = '#eee6d8';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d8cbb7';
  ctx.fillRect(0, h * 760 / 900, w, h * 140 / 900);
  ctx.strokeStyle = '#726b60';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h * 760 / 900);
  ctx.lineTo(w, h * 760 / 900);
  ctx.stroke();
}

function drawFixturePart(ctx, o, width, height) {
  const shades = fixtureShades(o);
  fixturePolygons(o).forEach((points, i) => {
    ctx.beginPath();
    for (let j = 0; j < points.length; j += 2) {
      const x = (o.x + points[j] / 100 * o.w) * width,
        y = (o.y + points[j + 1] / 100 * o.h) * height;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = shades[i];
    if (!o.transparent) ctx.fill();
    ctx.stroke();
  });
}
open();
