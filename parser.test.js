const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEvent } = require('./parser');
const message = (title, body) => ({ embeds: [{ title, description: `${body}\nHanging Dog Ranch (Ranch #52) • Today at 11:21` }] });
test('authoritative product totals', () => {
  const eggs = parseEvent(message('🥚 Eggs Collected', 'Daisy Bennett collected 52 eggs (ranch total: 236)'));
  assert.deepEqual([eggs.type, eggs.kind, eggs.quantity, eggs.total, eggs.ranch.id, eggs.actor],
    ['product', 'eggs', 52, 236, '52', 'Daisy Bennett']);
  assert.equal(parseEvent(message('🐑 Wool Sheared', 'Daisy Bennett sheared 50 wool (ranch total: 50)')).kind, 'wool');
  assert.equal(parseEvent(message('🥛 Milk Collected', 'Daisy Bennett collected 48 milk (ranch total: 222)')).total, 222);
});
test('purchase and cattle drive with loss', () => {
  const bought = parseEvent(message('🐄 Cattle Bought', 'Daisy Bennett bought 5x cow for $900'));
  assert.deepEqual([bought.delta, bought.paid], [5, 900]);
  const sold = parseEvent(message('💰 Cattle Sold',
    'Daisy Bennett delivered 2 of 5 cow (quality 200) for $1472 — seller cut $368, ledger $1104\n⚠️ 3 head lost on the drive — $540 docked from the seller cut.'));
  assert.deepEqual([sold.quantity, sold.dispatched, sold.revenue, sold.sellerCut, sold.ledgerShare],
    [2, 5, 1472, 368, 1104]);
});
test('unrecognised messages are ignored', () => {
  assert.equal(parseEvent(message('Ranch Announcement', 'Hello')), null);
});
test('five animal types and individual workers', () => {
  for (const [title, body, kind] of [
    ['Cattle Bought', 'Ella Hayes bought 4x cow for $400', 'cow'],
    ['Sheep Bought', 'Ella Hayes bought 5x sheep for $350', 'sheep'],
    ['Pigs Bought', 'Ella Hayes bought 5x pig for $300', 'pig'],
    ['Goats Bought', 'Ella Hayes bought 5x goat for $250', 'goat'],
    ['Chickens Bought', 'Ella Hayes bought 5x chicken for $100', 'chicken']
  ]) {
    const event = parseEvent(message(title, body));
    assert.equal(event.kind, kind);
    assert.equal(event.actor, 'Ella Hayes');
  }
  const sale = parseEvent(message('Sheep Sold',
    'Ella Hayes delivered 4 of 5 sheep (quality 200) for $1,472 — seller cut $368, ledger $1104'));
  assert.deepEqual([sale.kind, sale.quantity, sale.dispatched, sale.actor], ['sheep', 4, 5, 'Ella Hayes']);
});
