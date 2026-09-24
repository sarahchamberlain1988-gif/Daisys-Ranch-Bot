const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureEmployee, recordEmployee, settleEmployee } = require('./employee');

test('settlement survives rebuilding from earlier webhooks', () => {
  const store = { employees: {} };
  const person = ensureEmployee(store, 'Daisy Bennett');
  const product = { type: 'product', actor: 'Daisy Bennett', kind: 'milk', quantity: 48 };
  const sale = { type: 'sale', actor: 'Daisy Bennett', kind: 'cow', quantity: 2,
    revenue: 1472, sellerCut: 368 };
  recordEmployee(store, product, 1000);
  recordEmployee(store, sale, 1100);
  settleEmployee(person, 'products', 1200);
  assert.deepEqual(person.collected, {});
  assert.equal(person.sellerCut, 368);
  const rebuilt = { employees: {} };
  ensureEmployee(rebuilt, 'Daisy Bennett').cutoffs = { ...person.cutoffs };
  recordEmployee(rebuilt, product, 1000);
  recordEmployee(rebuilt, sale, 1100);
  recordEmployee(rebuilt, { ...product, quantity: 12 }, 1300);
  assert.equal(rebuilt.employees['daisy bennett'].collected.milk, 12);
  assert.equal(rebuilt.employees['daisy bennett'].sellerCut, 368);
  settleEmployee(rebuilt.employees['daisy bennett'], 'pay', 1400);
  assert.equal(rebuilt.employees['daisy bennett'].sellerCut, 0);
  assert.equal(rebuilt.employees['daisy bennett'].collected.milk, 12);
});
