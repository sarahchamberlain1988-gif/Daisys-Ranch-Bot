const keyFor = value => value.trim().toLocaleLowerCase('en-GB').replace(/\s+/g, ' ');

function ensureEmployee(store, name) {
  store.employees ||= {};
  const key = keyFor(name);
  return store.employees[key] ||= { name: name.trim(), collected: {}, bought: {}, sold: {},
    purchaseCost: 0, saleRevenue: 0, sellerCut: 0, cutoffs: {} };
}

function recordEmployee(store, event, timestamp) {
  if (!event.actor) return;
  const person = ensureEmployee(store, event.actor);
  person.cutoffs ||= {};
  if (event.type === 'product' && timestamp > (person.cutoffs.products || 0)) {
    person.collected[event.kind] = (person.collected[event.kind] || 0) + event.quantity;
  }
  if (event.type === 'animal') {
    person.bought[event.kind] = (person.bought[event.kind] || 0) + event.delta;
    person.purchaseCost += event.paid;
  }
  if (event.type === 'sale' && timestamp > (person.cutoffs.pay || 0)) {
    person.sold[event.kind] = (person.sold[event.kind] || 0) + event.quantity;
    person.saleRevenue += event.revenue;
    person.sellerCut += event.sellerCut;
  }
}

function settleEmployee(person, category, timestamp = Date.now()) {
  person.cutoffs ||= {};
  if (category === 'products' || category === 'both') {
    person.cutoffs.products = timestamp;
    person.collected = {};
  }
  if (category === 'pay' || category === 'both') {
    person.cutoffs.pay = timestamp;
    person.sold = {};
    person.saleRevenue = 0;
    person.sellerCut = 0;
  }
}

module.exports = { keyFor, ensureEmployee, recordEmployee, settleEmployee };
