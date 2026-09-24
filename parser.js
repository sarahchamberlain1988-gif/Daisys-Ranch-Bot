function textFromMessage(message) {
  return [message.content || '', ...(message.embeds || []).flatMap(e => [
    e.title || '', e.description || '',
    ...(e.fields || []).map(f => `${f.name}: ${f.value}`), e.footer?.text || ''
  ])].filter(Boolean).join('\n').replace(/[\*_~`]/g, '');
}

function parseEvent(message) {
  const text = textFromMessage(message);
  const ranchMatch = text.match(/\b(.+? Ranch)\s*\(Ranch\s*#(\d+)\)/i);
  if (!ranchMatch) return null;
  const title = message.embeds?.[0]?.title || text.split('\n')[0] || '';
  const ranch = { name: ranchMatch[1].trim(), id: ranchMatch[2] };
  const animalNames = { cattle: 'cow', cows: 'cow', cow: 'cow', sheep: 'sheep',
    pigs: 'pig', pig: 'pig', goats: 'goat', goat: 'goat', chickens: 'chicken', chicken: 'chicken' };
  const animalWord = '(?:cows?|cattle|sheep|pigs?|goats?|chickens?)';
  const actor = text.match(/(?:^|\n)\s*([^\n]{2,80}?)\s+(?:collected|sheared|bought|delivered)\s+\d+\s*x?\b/i)?.[1]?.trim() || null;
  const product = title.match(/\b(Eggs?|Wool|Milk|Fertilis(?:er|er))\s+Collected\b|\bWool\s+Sheared\b/i);
  if (product) {
    const match = text.match(/\b(?:collected|sheared)\s+(\d+)\s+(?:eggs?|wool|milk|fertilis(?:er|er))\s*\(\s*ranch total:\s*(\d+)\s*\)/i);
    if (!match) return null;
    const kind = /egg/i.test(title) ? 'eggs' : /wool/i.test(title) ? 'wool'
      : /fertilis/i.test(title) ? 'fertiliser' : 'milk';
    return { type: 'product', ranch, actor, kind, quantity: Number(match[1]), total: Number(match[2]) };
  }
  const purchaseTitle = title.match(new RegExp(`\\b(${animalWord})\\s+Bought\\b`, 'i'));
  if (purchaseTitle) {
    const match = text.match(new RegExp(`\\bbought\\s+(\\d+)\\s*x?\\s*(${animalWord})\\b[^\\n]*?\\$([\\d,]+(?:\\.\\d{1,2})?)`, 'i'));
    return match ? { type: 'animal', ranch, actor, kind: animalNames[match[2].toLowerCase()], delta: Number(match[1]),
      paid: Number(match[3].replaceAll(',', '')) } : null;
  }
  const saleTitle = title.match(new RegExp(`\\b(${animalWord})\\s+Sold\\b`, 'i'));
  if (saleTitle) {
    const match = text.match(new RegExp(`\\bdelivered\\s+(\\d+)\\s+of\\s+(\\d+)\\s+(${animalWord})\\b[^\\n]*?\\$([\\d,]+(?:\\.\\d{1,2})?)\\s*[—–-]\\s*seller cut\\s*\\$([\\d,]+(?:\\.\\d{1,2})?),\\s*ledger\\s*\\$([\\d,]+(?:\\.\\d{1,2})?)`, 'i'));
    return match ? { type: 'sale', ranch, actor, kind: animalNames[match[3].toLowerCase()],
      quantity: Number(match[1]), dispatched: Number(match[2]),
      revenue: Number(match[4].replaceAll(',', '')),
      sellerCut: Number(match[5].replaceAll(',', '')),
      ledgerShare: Number(match[6].replaceAll(',', '')) } : null;
  }
  return null;
}

module.exports = { parseEvent };
