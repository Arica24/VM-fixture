// VM Fixture: wall editing, product uploads, local saving and exports.
function normaliseProductId(value) {
  return String(value || "").trim().toUpperCase()
}

function validProductId(value) {
  return /^[A-Z0-9]{6}$/.test(value)
}

let state, etag = null,
  current, chosen = null,
  position = null,
  mode = 'copy',
  history = [],
  future = [],
  saveTimer, revision = 0,
  saving = false;
const $ = s => document.querySelector(s),
  uid = () => crypto.randomUUID(),
  esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } [c]));
const plan = () => state.plans.find(p => p.id === current),
  product = id => state.products.find(p => p.id === id),
  loc = (b, s) => plan().bars.find(x => x.id === b)?.slots.find(x => x.id === s);

function toast(t) {
  $('#toast').textContent = t;
  $('#toast').style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').style.display = 'none', 3500)
}

function tab(t) {
  document.body.dataset.tab = t;
  document.querySelectorAll('.mobiletabs button').forEach(b => b.classList.toggle('on', b.dataset
    .tab === t))
}

function change(fn) {
  history.push(JSON.stringify(state));
  if (history.length > 50) history.shift();
  future = [];
  fn();
  revision++;
  render();
  $('#saveStatus').textContent = 'Unsaved changes';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1000)
}

function travel(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(state));
  state = JSON.parse(from.pop());
  if (!plan()) current = state.plans[0].id;
  chosen = null;
  position = null;
  revision++;
  render();
  save()
}

function render() {
  if (!plan()) current = state.plans[0].id;
  $('#planSelect').innerHTML = state.plans.map(p =>
    `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#planSelect').value = current;
  catalog();
  board();
  inspector();
  $('#undo').disabled = !history.length;
  $('#redo').disabled = !future.length;
  $('#productCount').textContent = state.products.length
}

function catalog() {
  const q = $('#search').value.toLowerCase();
  $('#catalog').innerHTML = state.products.filter(p => p.code.toLowerCase().includes(q)).map(p =>
    `<button class="product ${chosen===p.id?'selected':''}" draggable="true" data-product="${esc(p.id)}" title="Place ${esc(p.code)}"><img src="${esc(p.kind==='advertisement'?adImage:p.image)}" alt="${esc(p.code)}" loading="lazy"><span class="code">${esc(p.code)}</span><small>${plan().bars.reduce((n,b)=>n+b.slots.filter(s=>s.product===p.id).length,0)}</small></button>`
  ).join('');
  if (!state.products.length) $('#catalog').innerHTML =
    '<div class="emptycatalog">Start with <strong>Upload a product sheet</strong> to turn your page into separate product pictures.</div>';
  $('#catalog').querySelectorAll('[data-product]').forEach(el => {
    el.onclick = () => {
      chosen = el.dataset.product;
      position = null;
      mode = 'copy';
      catalog();
      inspector();
      toast('Choose a wall position to place ' + product(chosen).code);
      if (innerWidth <= 700) tab('wall')
    };
    el.ondragstart = e => {
      chosen = el.dataset.product;
      position = null;
      mode = 'copy';
      e.dataTransfer.setData('text/plain', chosen);
      e.dataTransfer.effectAllowed = 'copy';
      catalog();
      inspector()
    }
  })
}

function slotHeight(s) {
  return (product(s.product)?.kind === 'advertisement' ? 118 : (s.rotation ? 155 : 91)) * (s
    .scale || 1)
}

function board() {
  const p = plan();
  $('#board').innerHTML = p.bars.map((b, i) =>
    `<div class="bar"><div class="barhead"><button data-bar-left="${b.id}" aria-label="Move bar ${i+1} left">‹</button><span class="barname">BAR ${String(i+1).padStart(2,'0')}</span><button data-bar-remove="${b.id}" aria-label="Remove bar ${i+1}">×</button></div>${b.slots.map((s,j)=>{const a=product(s.product);return `<button style="width:${118*(s.scale||1)}px;height:${slotHeight(s)}px" class="slot ${a?.kind==='advertisement'?'advertisement':''} ${a?'occupied':''} ${position?.bar===b.id&&position?.slot===s.id?'active':''}" data-bar="${b.id}" data-slot="${s.id}" ${a?'draggable="true"':''} aria-label="Bar ${i+1}, position ${j+1}${a?', '+esc(a.code):', empty'}">${a?`${a.kind==='advertisement'?`<span class="adcard">${esc(a.code)}</span>`:`<span class="shoeholder" style="height:${(s.rotation?125:64)*(s.scale||1)}px"><img style="width:${s.rotation?110:118}px;height:${s.rotation?60:64}px;transform:rotate(${s.rotation||0}deg) scale(${s.scale||1})" src="${esc(a.image)}" alt=""></span><span class="sku">${esc(a.code)}</span>`}`:`<span class="empty">${String(j+1).padStart(2,'0')} ＋</span>`}</button>`}).join('')}<button class="addslot" data-add-slot="${b.id}">＋ Position</button></div>`
  ).join('');
  applyZoom();
  $('#referenceBtn').hidden = !state.products.some(p => p.image.startsWith('/sample/'));
  const count = p.bars.reduce((n, b) => n + b.slots.length, 0),
    used = p.bars.reduce((n, b) => n + b.slots.filter(s => s.product).length, 0);
  $('#stats').textContent = `${p.bars.length} bars · ${count} positions · ${used} filled`;
  $('#board').querySelectorAll('.slot').forEach(el => {
    el.onclick = () => slotClick(el.dataset.bar, el.dataset.slot);
    el.ondragstart = e => {
      position = {
        bar: el.dataset.bar,
        slot: el.dataset.slot
      };
      chosen = loc(position.bar, position.slot).product;
      mode = e.altKey ? 'copy' : 'move';
      e.dataTransfer.setData('text/plain', chosen);
      e.dataTransfer.effectAllowed = 'copyMove';
      inspector()
    };
    el.ondragover = e => {
      e.preventDefault();
      el.classList.add('dragover')
    };
    el.ondragleave = () => el.classList.remove('dragover');
    el.ondrop = e => {
      e.preventDefault();
      el.classList.remove('dragover');
      if (chosen) place(el.dataset.bar, el.dataset.slot)
    }
  });
  $('#board').querySelectorAll('[data-add-slot]').forEach(el => el.onclick = () => change(() => p
    .bars.find(b => b.id === el.dataset.addSlot).slots.push({
      id: uid(),
      product: null
    })));
  $('#board').querySelectorAll('[data-bar-remove]').forEach(el => el.onclick = () => {
    if (p.bars.length === 1) return toast('Keep at least one bar.');
    const b = p.bars.find(x => x.id === el.dataset.barRemove);
    if (b.slots.some(s => s.product) && !confirm(
        'Remove this bar and its placements? Shoes stay in your collection.')) return;
    position = null;
    change(() => p.bars = p.bars.filter(x => x !== b))
  });
  $('#board').querySelectorAll('[data-bar-left]').forEach(el => el.onclick = () => {
    let i = p.bars.findIndex(x => x.id === el.dataset.barLeft);
    if (i > 0) change(() => [p.bars[i - 1], p.bars[i]] = [p.bars[i], p.bars[i - 1]])
  })
}

function slotClick(b, s) {
  if (chosen && (mode === 'move' || mode === 'copy')) return place(b, s);
  position = {
    bar: b,
    slot: s
  };
  chosen = loc(b, s).product;
  mode = 'select';
  board();
  catalog();
  inspector();
  if (innerWidth <= 700) tab('details')
}

function place(b, s) {
  const dest = loc(b, s);
  if (!dest || !chosen) return;
  if (position?.bar === b && position?.slot === s) {
    mode = 'select';
    inspector();
    return
  }
  const source = position && loc(position.bar, position.slot);
  if (mode === 'copy' && dest.product && !confirm('Replace the shoe in this position?')) return;
  change(() => {
    if (mode === 'move' && source) {
      const oldScale = source.scale || 1,
        oldRotation = source.rotation || 0;
      source.product = dest.product;
      source.scale = dest.scale || 1;
      dest.scale = oldScale;
      source.rotation = dest.rotation || 0;
      dest.rotation = oldRotation
    } else {
      dest.scale = source?.scale || 1;
      dest.rotation = source?.rotation || 0
    }
    dest.product = chosen
  });
  position = {
    bar: b,
    slot: s
  };
  if (mode === 'move') mode = 'select';
  board();
  inspector();
  toast(mode === 'copy' ? 'Shoe placed. Tap another position to add a copy.' : 'Shoe moved.')
}

function inspector() {
  const a = product(chosen),
    p = plan(),
    b = position && p.bars.find(x => x.id === position.bar),
    s = b?.slots.find(x => x.id === position.slot);
  $('#inspectorBody').innerHTML = (!a && !s) ?
    '<div class="noselection muted">Choose a shoe or a wall position to edit it.</div>' :
    `${b?`<p class="muted">Bar ${p.bars.indexOf(b)+1} · Position ${b.slots.indexOf(s)+1}</p>`:''}${a?`${a.kind==='advertisement'?`<div class="adcard adpreview">${esc(a.code)}</div>`:`<img class="preview" src="${esc(a.image)}" alt="${esc(a.code)}">`}<label for="skuInput">${a.kind==='advertisement'?'Advertisement text':'Product ID (6 characters)'}</label><input id="skuInput" value="${esc(a.code)}" maxlength="${a.kind==='advertisement'?70:6}" placeholder="${a.kind==='advertisement'?'Advertisement':'e.g. KJ3432'}"><div class="actions">${s?'<button id="moveShoe">Move</button>':''}<button id="copyShoe">Copy / place</button></div>`:'<p class="muted">Empty position. Choose a shoe in Products to fill it.</p>'}${s&&a?`<label for="itemSize">Size <span id="sizeValue">${Math.round((s.scale||1)*100)}%</span></label><input class="sizecontrol" type="range" id="itemSize" min="50" max="180" step="5" value="${Math.round((s.scale||1)*100)}">`:''}${s&&a&&a.kind!=='advertisement'?`<label for="orientation">Shoe direction</label><select id="orientation" style="width:100%"><option value="0" ${(s.rotation||0)===0?'selected':''}>Horizontal</option><option value="90" ${s.rotation===90?'selected':''}>Vertical — toe up</option><option value="270" ${s.rotation===270?'selected':''}>Vertical — toe down</option></select>`:''}${s?'<div class="actions"><button id="clearSlot">Clear shoe</button><button id="removeSlot" class="danger">Remove position</button></div>':''}${a?'<div class="actions"><button id="deleteProduct" class="danger">Delete product</button></div>':''}${mode==='move'?'<p class="muted">Choose the destination on the wall. If it is filled, the two shoes swap positions.</p>':''}`;
  if (a) {
    $('#skuInput').onchange = e => {
      const value = a.kind === 'advertisement' ? e.target.value.trim() : normaliseProductId(e
        .target.value);
      if (a.kind !== 'advertisement' && !validProductId(value)) {
        toast('Product ID must contain exactly six letters or numbers.');
        e.target.value = a.code;
        return
      }
      if (value) change(() => a.code = value);
      else e.target.value = a.code
    };
    $('#copyShoe').onclick = () => {
      mode = 'copy';
      toast('Choose a wall position.');
      tab('wall')
    };
    if (s) $('#moveShoe').onclick = () => {
      mode = 'move';
      toast('Choose the destination position.');
      tab('wall')
    };
    $('#deleteProduct').onclick = () => {
      if (!confirm('Delete this product and all its placements from all layouts?')) return;
      const id = a.id;
      chosen = null;
      position = null;
      change(() => {
        state.products = state.products.filter(x => x.id !== id);
        state.plans.forEach(p => p.bars.forEach(b => b.slots.forEach(s => {
          if (s.product === id) s.product = null
        })))
      })
    }
  }
  if (s && a && a.kind !== 'advertisement') $('#orientation').onchange = e => change(() => s
    .rotation = Number(e.target.value));
  if (s && a) {
    $('#itemSize').oninput = e => $('#sizeValue').textContent = e.target.value + '%';
    $('#itemSize').onchange = e => change(() => s.scale = Number(e.target.value) / 100)
  }
  if (s) {
    $('#clearSlot').onclick = () => {
      chosen = null;
      mode = 'select';
      change(() => {
        s.product = null;
        s.scale = 1;
        s.rotation = 0
      })
    };
    $('#removeSlot').onclick = () => {
      if (b.slots.length === 1) return toast('Keep at least one position on each bar.');
      if (s.product && !confirm('Remove this position?')) return;
      position = null;
      chosen = null;
      change(() => b.slots = b.slots.filter(x => x !== s))
    }
  }
}
const standaloneSeed = {
  "version": 1,
  "products": [],
  "plans": [{
    "id": "shoe-wall",
    "name": "My shoe wall",
    "bars": [{
      "id": "bar-0",
      "slots": [{
        "id": "slot-0-0",
        "product": null
      }, {
        "id": "slot-0-1",
        "product": null
      }, {
        "id": "slot-0-2",
        "product": null
      }, {
        "id": "slot-0-3",
        "product": null
      }, {
        "id": "slot-0-4",
        "product": null
      }, {
        "id": "slot-0-5",
        "product": null
      }, {
        "id": "slot-0-6",
        "product": null
      }]
    }, {
      "id": "bar-1",
      "slots": [{
        "id": "slot-1-0",
        "product": null
      }, {
        "id": "slot-1-1",
        "product": null
      }, {
        "id": "slot-1-2",
        "product": null
      }, {
        "id": "slot-1-3",
        "product": null
      }, {
        "id": "slot-1-4",
        "product": null
      }, {
        "id": "slot-1-5",
        "product": null
      }, {
        "id": "slot-1-6",
        "product": null
      }]
    }, {
      "id": "bar-2",
      "slots": [{
        "id": "slot-2-0",
        "product": null
      }, {
        "id": "slot-2-1",
        "product": null
      }, {
        "id": "slot-2-2",
        "product": null
      }, {
        "id": "slot-2-3",
        "product": null
      }, {
        "id": "slot-2-4",
        "product": null
      }, {
        "id": "slot-2-5",
        "product": null
      }, {
        "id": "slot-2-6",
        "product": null
      }]
    }, {
      "id": "bar-3",
      "slots": [{
        "id": "slot-3-0",
        "product": null
      }, {
        "id": "slot-3-1",
        "product": null
      }, {
        "id": "slot-3-2",
        "product": null
      }, {
        "id": "slot-3-3",
        "product": null
      }, {
        "id": "slot-3-4",
        "product": null
      }, {
        "id": "slot-3-5",
        "product": null
      }, {
        "id": "slot-3-6",
        "product": null
      }]
    }, {
      "id": "bar-4",
      "slots": [{
        "id": "slot-4-0",
        "product": null
      }, {
        "id": "slot-4-1",
        "product": null
      }, {
        "id": "slot-4-2",
        "product": null
      }, {
        "id": "slot-4-3",
        "product": null
      }, {
        "id": "slot-4-4",
        "product": null
      }, {
        "id": "slot-4-5",
        "product": null
      }, {
        "id": "slot-4-6",
        "product": null
      }]
    }, {
      "id": "bar-5",
      "slots": [{
        "id": "slot-5-0",
        "product": null
      }, {
        "id": "slot-5-1",
        "product": null
      }, {
        "id": "slot-5-2",
        "product": null
      }, {
        "id": "slot-5-3",
        "product": null
      }, {
        "id": "slot-5-4",
        "product": null
      }, {
        "id": "slot-5-5",
        "product": null
      }, {
        "id": "slot-5-6",
        "product": null
      }]
    }, {
      "id": "bar-6",
      "slots": [{
        "id": "slot-6-0",
        "product": null
      }, {
        "id": "slot-6-1",
        "product": null
      }, {
        "id": "slot-6-2",
        "product": null
      }, {
        "id": "slot-6-3",
        "product": null
      }, {
        "id": "slot-6-4",
        "product": null
      }, {
        "id": "slot-6-5",
        "product": null
      }, {
        "id": "slot-6-6",
        "product": null
      }]
    }, {
      "id": "bar-7",
      "slots": [{
        "id": "slot-7-0",
        "product": null
      }, {
        "id": "slot-7-1",
        "product": null
      }, {
        "id": "slot-7-2",
        "product": null
      }, {
        "id": "slot-7-3",
        "product": null
      }, {
        "id": "slot-7-4",
        "product": null
      }, {
        "id": "slot-7-5",
        "product": null
      }, {
        "id": "slot-7-6",
        "product": null
      }]
    }, {
      "id": "bar-8",
      "slots": [{
        "id": "slot-8-0",
        "product": null
      }, {
        "id": "slot-8-1",
        "product": null
      }, {
        "id": "slot-8-2",
        "product": null
      }, {
        "id": "slot-8-3",
        "product": null
      }, {
        "id": "slot-8-4",
        "product": null
      }, {
        "id": "slot-8-5",
        "product": null
      }, {
        "id": "slot-8-6",
        "product": null
      }]
    }, {
      "id": "bar-9",
      "slots": [{
        "id": "slot-9-0",
        "product": null
      }, {
        "id": "slot-9-1",
        "product": null
      }, {
        "id": "slot-9-2",
        "product": null
      }, {
        "id": "slot-9-3",
        "product": null
      }, {
        "id": "slot-9-4",
        "product": null
      }, {
        "id": "slot-9-5",
        "product": null
      }, {
        "id": "slot-9-6",
        "product": null
      }]
    }, {
      "id": "bar-10",
      "slots": [{
        "id": "slot-10-0",
        "product": null
      }, {
        "id": "slot-10-1",
        "product": null
      }, {
        "id": "slot-10-2",
        "product": null
      }, {
        "id": "slot-10-3",
        "product": null
      }, {
        "id": "slot-10-4",
        "product": null
      }, {
        "id": "slot-10-5",
        "product": null
      }, {
        "id": "slot-10-6",
        "product": null
      }]
    }, {
      "id": "bar-11",
      "slots": [{
        "id": "slot-11-0",
        "product": null
      }, {
        "id": "slot-11-1",
        "product": null
      }, {
        "id": "slot-11-2",
        "product": null
      }, {
        "id": "slot-11-3",
        "product": null
      }, {
        "id": "slot-11-4",
        "product": null
      }, {
        "id": "slot-11-5",
        "product": null
      }, {
        "id": "slot-11-6",
        "product": null
      }]
    }]
  }]
};
const adImage = 'assets/advertisement.svg';
let databasePromise;

function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('fixture-studio-standalone', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('layouts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error)
  });
  return databasePromise
}
async function readLocal() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('layouts', 'readonly'),
      r = tx.objectStore('layouts').get('state');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error)
  })
}
async function writeLocal(value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('layouts', 'readwrite');
    tx.objectStore('layouts').put(value, 'state');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error)
  })
}
async function save() {
  clearTimeout(saveTimer);
  if (!state) return;
  if (saving) {
    saveTimer = setTimeout(save, 500);
    return
  }
  saving = true;
  const rev = revision;
  $('#saveStatus').textContent = 'Saving…';
  try {
    await writeLocal(structuredClone(state));
    $('#saveStatus').textContent = rev === revision ? 'All changes saved' : 'Unsaved changes';
    if (rev !== revision) saveTimer = setTimeout(save, 300)
  } catch (e) {
    $('#saveStatus').textContent = 'Export a backup';
    toast(
      'Browser saving is unavailable or full. Your work is still here; export a backup to keep it.'
    )
  } finally {
    saving = false
  }
}
async function open() {
  let saved;
  try {
    saved = await readLocal()
  } catch (e) {
    toast('Browser storage is unavailable. Use Download backup to keep your work.')
  }
  state = saved || structuredClone(standaloneSeed);
  current = state.plans[0].id;
  render();
  $('#saveStatus').textContent = saved ? 'All changes saved' : 'Ready';
  if (!saved) save()
}
$('#donePlacing').onclick = () => {
  chosen = null;
  position = null;
  mode = 'select';
  render();
  toast('Selection cleared. Choose a shoe or position.')
};
$('#search').oninput = catalog;
$('#saveBtn').onclick = save;
$('#planSelect').onchange = e => {
  current = e.target.value;
  chosen = null;
  position = null;
  mode = 'select';
  render()
};
$('#renameBtn').onclick = () => {
  const name = prompt('Layout name', plan().name)?.trim();
  if (name) change(() => plan().name = name.slice(0, 80))
};
$('#newBtn').onclick = () => {
  const name = prompt('Name your new layout', 'New shoe wall')?.trim();
  if (!name) return;
  position = null;
  chosen = null;
  change(() => {
    let p = {
      id: uid(),
      name: name.slice(0, 80),
      bars: Array.from({
        length: 6
      }, () => ({
        id: uid(),
        slots: Array.from({
          length: 6
        }, () => ({
          id: uid(),
          product: null
        }))
      }))
    };
    state.plans.push(p);
    current = p.id
  })
};
$('#duplicatePlan').onclick = () => {
  const p = structuredClone(plan());
  p.id = uid();
  p.name = p.name.slice(0, 75) + ' copy';
  p.bars.forEach(b => {
    b.id = uid();
    b.slots.forEach(s => s.id = uid())
  });
  position = null;
  chosen = null;
  change(() => {
    state.plans.push(p);
    current = p.id
  })
};
$('#deletePlan').onclick = () => {
  if (state.plans.length === 1) return toast('Keep at least one layout.');
  if (!confirm('Delete ' + plan().name + '?')) return;
  change(() => {
    state.plans = state.plans.filter(p => p.id !== current);
    current = state.plans[0].id;
    chosen = null;
    position = null
  })
};
$('#addBar').onclick = () => {
  if (plan().bars.length >= 30) return toast('Maximum 30 bars per layout.');
  change(() => plan().bars.push({
    id: uid(),
    slots: Array.from({
      length: 7
    }, () => ({
      id: uid(),
      product: null
    }))
  }))
};
$('#addRow').onclick = () => {
  if (plan().bars.some(b => b.slots.length >= 100)) return toast(
    'Maximum 100 positions per bar.');
  change(() => plan().bars.forEach(b => b.slots.push({
    id: uid(),
    product: null
  })))
};
$('#removeRow').onclick = () => {
  if (plan().bars.some(b => b.slots.length > 1 && b.slots.at(-1).product) && !confirm(
      'Remove the last position from each bar?')) return;
  position = null;
  chosen = null;
  change(() => plan().bars.forEach(b => {
    if (b.slots.length > 1) b.slots.pop()
  }))
};
$('#undo').onclick = () => travel(history, future);
$('#redo').onclick = () => travel(future, history);
$('#zoom').onchange = applyZoom;
window.addEventListener('resize', applyZoom);
$('#referenceBtn').onclick = () => {
  $('#referenceDialog img').src = '/reference.jpg';
  $('#referenceDialog').showModal()
};
$('#exportBtn').onclick = () => $('#exportDialog').showModal();
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog')
  .close());
document.querySelectorAll('.mobiletabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));
document.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? travel(future, history) : travel(history, future)
  }
  if (e.key === 'Escape') {
    chosen = null;
    position = null;
    mode = 'select';
    render()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    save()
  }
});
window.onbeforeunload = e => {
  if (state && $('#saveStatus').textContent !== 'All changes saved') {
    e.preventDefault();
    e.returnValue = ''
  }
};
async function resizeImage(file) {
  const img = await createImageBitmap(file);
  const c = document.createElement('canvas');
  const scale = Math.min(1, 700 / img.width, 500 / img.height);
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return c.toDataURL('image/jpeg', .9)
}
async function uploadImage(image) {
  return image
}
$('#uploadBtn').onclick = () => $('#files').click();
$('#files').onchange = async e => {
  const files = [...e.target.files];
  $('#uploadBtn').disabled = true;
  try {
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) {
        toast(f.name + ' is too large (25 MB limit).');
        continue
      }
      const suggested = normaliseProductId(f.name.replace(/\.[^.]+$/, ''));
      const code = normaliseProductId(validProductId(suggested) ? suggested : (prompt('Enter a six-character product code for ' + f.name, '') || ''));
      if (!validProductId(code)) {
        toast('Skipped: a product code needs six letters or numbers.');
        continue;
      }
      const image = await uploadImage(await resizeImage(f));
      change(() => state.products.push({
        id: uid(),
        code,
        image
      }))
    }
    toast('Images added to your collection.')
  } catch (e) {
    toast('An image could not be uploaded. Please try again.')
  } finally {
    $('#uploadBtn').disabled = false;
    $('#files').value = ''
  }
};
let cropImage, cropBox, cropStart;
const cc = $('#cropCanvas'),
  cx = cc.getContext('2d');
let candidates = [];
$('#sheetBtn').onclick = () => $('#sheetFile').click();
$('#sheetFile').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    cropImage = await createImageBitmap(f);
    const scale = Math.min(1, 1000 / cropImage.width);
    cc.width = Math.round(cropImage.width * scale);
    cc.height = Math.round(cropImage.height * scale);
    cropBox = null;
    candidates = [];
    drawCrop();
    $('#cropDialog').showModal();
    setTimeout(autoDetect, 60)
  } catch (e) {
    toast('This image could not be opened.')
  }
  $('#sheetFile').value = ''
};

function drawCrop() {
  cx.drawImage(cropImage, 0, 0, cc.width, cc.height);
  if (cropBox) {
    cx.fillStyle = '#b4f36744';
    cx.fillRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
    cx.strokeStyle = '#78af2f';
    cx.lineWidth = 3;
    cx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h)
  }
}

function point(e) {
  const r = cc.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(cc.width, (e.clientX - r.left) * cc.width / r.width)),
    y: Math.max(0, Math.min(cc.height, (e.clientY - r.top) * cc.height / r.height))
  }
}
cc.onpointerdown = e => {
  cropStart = point(e);
  cc.setPointerCapture(e.pointerId)
};
cc.onpointermove = e => {
  if (!cropStart) return;
  const p = point(e);
  cropBox = {
    x: Math.min(p.x, cropStart.x),
    y: Math.min(p.y, cropStart.y),
    w: Math.abs(p.x - cropStart.x),
    h: Math.abs(p.y - cropStart.y)
  };
  drawCrop()
};
cc.onpointerup = () => cropStart = null;
cc.onpointercancel = () => cropStart = null;
$('#cropAdd').onclick = () => {
  if (!cropBox || cropBox.w < 10 || cropBox.h < 10) return toast(
    'Draw a rectangle around a product first.');
  candidates.push(makeCandidate({
    x: cropBox.x / cc.width,
    y: cropBox.y / cc.height,
    w: cropBox.w / cc.width,
    h: cropBox.h / cc.height
  }, $('#cropCode').value.trim()));
  $('#cropCode').value = '';
  cropBox = null;
  renderCandidates();
  drawCrop();
  readSheetCodes();
  toast('Crop added to the preview.');
};

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000)
}
const filename = () => plan().name.replace(/[^a-z0-9 -]/gi, '').trim() || 'shoe-wall';
$('#printBtn').onclick = () => {
  $('#exportDialog').close();
  window.print()
};
$('#backupBtn').onclick = async () => {
  toast('Preparing your backup…');
  try {
    const data = structuredClone(state);
    for (const p of data.products) {
      if (p.kind !== 'advertisement' && !p.image.startsWith('data:')) {
        const r = await fetch(p.image);
        if (!r.ok) throw Error();
        const blob = await r.blob();
        p.image = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = rej;
          fr.readAsDataURL(blob)
        })
      }
    }
    download(new Blob([JSON.stringify(data)], {
      type: 'application/json'
    }), 'vm-fixture-backup.json')
  } catch (e) {
    toast('Could not export all images. Please retry.')
  }
};
$('#restoreBtn').onclick = () => $('#backupFile').click();
$('#backupFile').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 40 * 1024 * 1024) throw Error();
    const data = JSON.parse(await f.text());
    const safeId = x => typeof x === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(x);
    if (data.version !== 1 || !Array.isArray(data.products) || !data.plans?.length || data.plans
      .length > 100) throw Error();
    for (const p of data.products)
      if ((p.kind !== undefined && p.kind !== 'advertisement') || !safeId(p.id) || typeof p
        .code !== 'string' || typeof p.image !== 'string' || !(
          /^data:image\/(jpeg|png|webp);base64,/.test(p.image) || (/^\/(sample|api\/image)\//
            .test(p.image) || p.image === '/advertisement.svg' || p.image === 'assets/advertisement.svg'))) throw Error();
    for (const p of data.plans)
      if (!safeId(p.id) || typeof p.name !== 'string' || p.name.length > 100 || !p.bars
        ?.length || p.bars.length > 30 || p.bars.some(b => !safeId(b.id) || !b.slots?.length ||
          b.slots.length > 100 || b.slots.some(s => !safeId(s.id) || (s.scale !== undefined && (
            typeof s.scale !== 'number' || s.scale < .5 || s.scale > 1.8)) || (s.rotation !==
            undefined && ![0, 90, 270].includes(s.rotation)) || (s.product !== null && !data
            .products.some(p => p.id === s.product))))) throw Error();
    if (!confirm('Replace all current layouts and products with this backup?')) return;
    for (const p of data.products)
      if (p.image.startsWith('data:')) p.image = await uploadImage(p.image);
    chosen = null;
    position = null;
    change(() => {
      state = data;
      current = data.plans[0].id
    });
    $('#exportDialog').close();
    toast('Backup imported.')
  } catch (e) {
    toast('This backup could not be imported. Check the file and connection.')
  }
  $('#backupFile').value = ''
};
$('#pngBtn').onclick = async () => {
  const btn = $('#pngBtn');
  btn.disabled = true;
  toast('Preparing your wall image…');
  try {
    const p = plan(),
      factor = 1.4,
      w = p.bars.length * 190 + 120,
      h = Math.ceil(Math.max(...p.bars.map(b => b.slots.reduce((n, s) => n + (slotHeight(s) +
        13) * factor, 0))) + 155);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#dfd0bc';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#333';
    x.font = 'bold 26px Arial';
    x.fillText(p.name, 35, 42);
    x.font = '14px Arial';
    x.fillText('VM Fixture · ' + new Date().toLocaleDateString(), 35, 67);
    const imgs = {};
    await Promise.all([...new Set(p.bars.flatMap(b => b.slots.map(s => s.product).filter(
      Boolean)))].map(async id => {
      if (product(id).kind === 'advertisement') return;
      const image = new Image();
      image.src = product(id).image;
      await image.decode();
      imgs[id] = image
    }));
    p.bars.forEach((b, i) => {
      const bx = 35 + i * 190;
      x.fillStyle = '#333';
      x.font = 'bold 14px Arial';
      x.fillText('BAR ' + (i + 1), bx, 103);
      x.fillStyle = '#9d9b95';
      x.fillRect(bx + 76, 118, 7, h - 143);
      let y = 120;
      b.slots.forEach(s => {
        const sc = s.scale || 1,
          height = slotHeight(s) * factor,
          width = 153 * sc,
          center = bx + 76;
        const a = product(s.product);
        x.fillStyle = '#f4ede2';
        x.fillRect(center - width / 2, y, width, height);
        x.strokeStyle = '#bbaa96';
        x.strokeRect(center - width / 2, y, width, height);
        if (a?.kind === 'advertisement') {
          x.fillStyle = '#fff';
          x.fillRect(center - width / 2, y, width, width);
          x.strokeStyle = '#777';
          x.strokeRect(center - width / 2, y, width, width);
          x.fillStyle = '#333';
          x.font = 'bold 12px Arial';
          x.textAlign = 'center';
          x.fillText(a.code.slice(0, 20), center, y + width / 2, width - 10);
          x.textAlign = 'left'
        } else if (a && imgs[s.product]) {
          const im = imgs[s.product],
            rot = s.rotation || 0;
          const usableH = height - 28;
          const scale = rot ? Math.min(usableH / im.width, (width - 10) / im.height) :
            Math.min((width - 10) / im.width, usableH / im.height);
          x.save();
          x.translate(center, y + usableH / 2 + 3);
          x.rotate(rot * Math.PI / 180);
          x.drawImage(im, -im.width * scale / 2, -im.height * scale / 2, im.width *
            scale, im.height * scale);
          x.restore();
          x.fillStyle = '#333';
          x.font = '13px Arial';
          x.textAlign = 'center';
          x.fillText(a.code.slice(0, 25), center, y + height - 8, width - 8);
          x.textAlign = 'left'
        } else {
          x.fillStyle = '#777';
          x.font = '13px Arial';
          x.fillText('Empty', bx + 55, y + height / 2)
        }
        y += height + 13 * factor
      })
    });
    download(await new Promise(res => c.toBlob(res, 'image/png')), filename() + '.png');
    toast('Wall image downloaded.')
  } catch (e) {
    toast('Could not create image. Please retry.')
  } finally {
    btn.disabled = false
  }
};

function applyZoom() {
  if (!state) return;
  const value = $('#zoom').value;
  let z = Number(value);
  if (value === 'fit') {
    const wrap = $('.boardwrap'),
      p = plan(),
      width = p.bars.length * 133 + 105;
    const height = Math.max(...p.bars.map(b => b.slots.reduce((n, s) => n + slotHeight(s) + 13,
      0))) + 190;
    z = Math.min(.85, Math.max(.35, Math.min(((wrap.clientWidth || 800) - 50) / width, ((wrap
      .clientHeight || 650) - 55) / height)))
  }
  $('#board').style.zoom = z;
}
$('#addAd').onclick = () => {
  const id = uid();
  change(() => state.products.push({
    id,
    code: 'Advertisement',
    kind: 'advertisement',
    image: '/advertisement.svg'
  }));
  chosen = id;
  position = null;
  mode = 'copy';
  catalog();
  inspector();
  toast('Choose a position for your advertisement square.');
  tab('wall')
};

function makeCandidate(box, name) {
  const c = document.createElement('canvas');
  const sx = box.x * cropImage.width,
    sy = box.y * cropImage.height,
    sw = Math.min(box.w * cropImage.width, cropImage.width - sx),
    sh = Math.min(box.h * cropImage.height, cropImage.height - sy);
  c.width = Math.min(600, Math.max(1, Math.round(sw)));
  c.height = Math.max(1, Math.round(c.width * sh / sw));
  c.getContext('2d').drawImage(cropImage, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return {
    box,
    image: c.toDataURL('image/jpeg', .92),
    code: normaliseProductId(name),
    selected: true
  }
}

function renderCandidates() {
  $('#sheetProgress').textContent = candidates.length +
    ' image crops found. Printed product codes are filled automatically; check the previews before importing.';
  $('#cropCandidates').innerHTML = candidates.map((p, i) =>
    `<div class="cropitem"><img src="${p.image}" alt="Detected product ${i+1}"><input type="text" maxlength="6" minlength="6" pattern="[A-Za-z0-9]{6}" placeholder="e.g. KJ3432" aria-label="Six-character product ID for image ${i+1}" data-code="${i}" value="${esc(p.code)}"><label><input type="checkbox" data-keep="${i}" ${p.selected?'checked':''}>Include</label></div>`
  ).join('');
  $('#cropCandidates').querySelectorAll('[data-code]').forEach(e => e.oninput = () => {
    e.value = normaliseProductId(e.value);
    candidates[Number(e.dataset.code)].code = e.value;
    e.setCustomValidity(validProductId(e.value) ? '' : 'Enter exactly six letters or numbers.')
  });
  $('#cropCandidates').querySelectorAll('[data-keep]').forEach(e => e.onchange = () => {
    candidates[Number(e.dataset.keep)].selected = e.checked;
    $('#importCrops').disabled = !candidates.some(p => p.selected && validProductId(p.code));
    drawCrop()
  });
  $('#importCrops').disabled = !candidates.length;
  drawCrop()
}

function autoDetect() {
  if (!cropImage) return;
  $('#sheetProgress').textContent = 'Finding product images…';
  $('#detectBtn').disabled = true;
  setTimeout(async () => {
    try {
      const c = document.createElement('canvas'),
        sc = Math.min(1, 600 / cropImage.width);
      c.width = Math.round(cropImage.width * sc);
      c.height = Math.round(cropImage.height * sc);
      const ctx = c.getContext('2d', {
        willReadFrequently: true
      });
      ctx.drawImage(cropImage, 0, 0, c.width, c.height);
      const boxes = detectShoes(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c
        .height);
      candidates = [];
      for (const b of boxes) candidates.push(makeCandidate(b));
      renderCandidates();
      await readSheetCodes();
      if (!candidates.length) $('#sheetProgress').textContent =
        'No clear product images found. Draw an area around your products and use the grid, or add individual crops.'
    } catch (e) {
      $('#sheetProgress').textContent =
        'Detection could not finish. You can still split a selected area into a grid.'
    } finally {
      $('#detectBtn').disabled = false
    }
  }, 30)
}
const previousDraw = drawCrop;
drawCrop = function() {
  if (!cropImage) return;
  previousDraw();
  cx.lineWidth = 2;
  cx.font = 'bold 15px system-ui';
  candidates.forEach((p, i) => {
    if (!p.selected) return;
    const b = p.box;
    cx.strokeStyle = '#6eab22';
    cx.strokeRect(b.x * cc.width, b.y * cc.height, b.w * cc.width, b.h * cc.height);
    cx.fillStyle = '#182423';
    cx.fillRect(b.x * cc.width, b.y * cc.height, 28, 21);
    cx.fillStyle = '#fff';
    cx.fillText(String(i + 1), b.x * cc.width + 4, b.y * cc.height + 16)
  })
};
$('#detectBtn').onclick = () => {
  if (candidates.length && !confirm('Replace the current crop previews with new detections?'))
    return;
  autoDetect()
};
$('#gridBtn').onclick = () => {
  const rows = Number($('#gridRows').value),
    cols = Number($('#gridCols').value);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 20 ||
    cols > 20 || rows * cols > 100) return toast(
    'Choose 1–20 rows and columns, up to 100 images.');
  if (!cropBox || cropBox.w < 20 || cropBox.h < 20) return toast(
    'First draw one rectangle around the whole product grid.');
  const region = {
    x: cropBox.x / cc.width,
    y: cropBox.y / cc.height,
    w: cropBox.w / cc.width,
    h: cropBox.h / cc.height
  };
  candidates = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) candidates.push(makeCandidate({
      x: region.x + region.w * x / cols,
      y: region.y + region.h * y / rows,
      w: region.w / cols,
      h: region.h / rows
    }));
  cropBox = null;
  renderCandidates();
  readSheetCodes()
};
$('#importCrops').onclick = async () => {
  const items = candidates.filter(p => p.selected);
  if (!items.length) return toast('Tick at least one image to include.');
  const invalid = candidates.findIndex(p => p.selected && !validProductId(p.code));
  if (invalid >= 0) {
    toast('This code could not be read. Try a clearer photo, correct the preview, or uncheck it.');
    $('#cropCandidates').querySelector('[data-code="' + invalid + '"]')?.focus();
    return
  }
  const btn = $('#importCrops');
  btn.disabled = true;
  const original = btn.textContent;
  let done = 0;
  try {
    for (const p of items) {
      if (state.products.length >= 1000) throw Error('Collection full');
      btn.textContent = 'Importing ' + (done + 1) + ' of ' + items.length + '…';
      const image = await uploadImage(p.image);
      change(() => state.products.push({
        id: uid(),
        code: p.code.slice(0, 70),
        image
      }));
      p.selected = false;
      done++
    }
    await save();
    $('#cropDialog').close();
    toast(done + ' products added. Choose one to place on your wall.');
    tab('products')
  } catch (e) {
    toast(done + ' imported. The remaining images are still here — try again.');
    renderCandidates()
  } finally {
    btn.disabled = false;
    btn.textContent = original;
    drawCrop()
  }
};

// photo-editor.js starts the app after adding the photo tools.
