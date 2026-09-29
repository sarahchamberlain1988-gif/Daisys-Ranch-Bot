const test = require('node:test');
const assert = require('node:assert/strict');
const { sheetEnabled, syncSheet } = require('./sheets');

test('only the configured ranch sends events; retries do not duplicate them', async () => {
  process.env.GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/example/exec';
  process.env.GOOGLE_SCRIPT_SECRET = 'test-secret';
  process.env.GOOGLE_SCRIPT_RANCH_ID = '52';
  const calls = [];
  const previous = global.fetch;
  global.fetch = async (_, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => 'recorded' };
  };
  try {
    const store = { ranchId: '52', wageEvents: {
      '123': { id: '123', timestamp: 1, employee: 'Daisy Bennett', type: 'product', item: 'milk', quantity: 52 },
      '124': { id: '124', timestamp: 2, employee: 'Daisy Bennett', type: 'sale', item: 'cow', quantity: 3, ledger: 1472 }
    } };
    assert.equal(sheetEnabled({ ranchId: '53' }), false);
    assert.equal(await syncSheet(store), 2);
    assert.equal(await syncSheet(store), 0);
    assert.deepEqual(calls.map(e => e.id), ['123', '124']);
    assert.equal(calls[1].ledger, 1472);
  } finally { global.fetch = previous; }
});

test('a rejected event remains eligible for /syncsheet retry', async () => {
  process.env.GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/example/exec';
  process.env.GOOGLE_SCRIPT_SECRET = 'test-secret';
  process.env.GOOGLE_SCRIPT_RANCH_ID = '52';
  const previous = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => 'unauthorised' });
  const store = { ranchId: '52', wageEvents: { '456': {
    id: '456', timestamp: 1, employee: 'Daisy Bennett', type: 'kept', item: 'eggs', quantity: 2
  } } };
  try {
    await assert.rejects(syncSheet(store), /Sheet rejected/);
    assert.equal(store.sheetSent['456'], undefined);
  } finally { global.fetch = previous; }
});
