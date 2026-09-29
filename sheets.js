const allowedProducts = new Set(['milk', 'eggs', 'wool']);
const allowedAnimals = new Set(['cow', 'pig', 'sheep', 'goat', 'chicken']);

function sheetEnabled(store) {
  return Boolean(process.env.GOOGLE_SCRIPT_URL && process.env.GOOGLE_SCRIPT_SECRET &&
    process.env.GOOGLE_SCRIPT_RANCH_ID && store.ranchId === process.env.GOOGLE_SCRIPT_RANCH_ID);
}

async function doSync(store) {
  if (!sheetEnabled(store)) throw new Error('Set GOOGLE_SCRIPT_URL, GOOGLE_SCRIPT_SECRET and GOOGLE_SCRIPT_RANCH_ID in Railway for this ranch.');
  const url = process.env.GOOGLE_SCRIPT_URL;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))
    throw new Error('GOOGLE_SCRIPT_URL must be the deployed Apps Script /exec URL.');
  store.sheetSent ||= {};
  let added = 0;
  const events = Object.values(store.wageEvents || {}).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  for (const e of events) {
    if (store.sheetSent[e.id]) continue;
    if (['product', 'kept'].includes(e.type) && !allowedProducts.has(e.item)) continue;
    if (e.type === 'sale' && !allowedAnimals.has(e.item)) continue;
    const response = await fetch(url, { method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: process.env.GOOGLE_SCRIPT_SECRET, id: e.id,
        timestamp: e.timestamp, employee: e.employee, type: e.type,
        item: e.item || '', quantity: e.quantity || 0, ledger: e.ledger || 0,
        payment: e.payment || 0 }), signal: AbortSignal.timeout(20000) });
    const result = (await response.text()).trim();
    if (!response.ok || !['recorded', 'already recorded'].includes(result))
      throw new Error(`Sheet rejected an event (${response.status}): ${result.slice(0, 100)}`);
    store.sheetSent[e.id] = true;
    if (result === 'recorded') added++;
  }
  return added;
}

const running = new Map();
function syncSheet(store) {
  const key = store.ranchId;
  const previous = running.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => doSync(store));
  running.set(key, next);
  next.finally(() => { if (running.get(key) === next) running.delete(key); }).catch(() => {});
  return next;
}

module.exports = { sheetEnabled, syncSheet };
