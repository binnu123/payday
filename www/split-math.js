(function (root) {
  'use strict';
  // All monetary amounts are integer minor units, avoiding floating-point balances.
  function integer(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + ' must be a non-negative integer.');
    return value;
  }
  function distribute(total, weights) {
    integer(total, 'Total');
    if (!weights.length) throw new Error('Select at least one participant.');
    const sum = weights.reduce((a, w) => a + integer(w, 'Weight'), 0);
    if (!Number.isSafeInteger(sum) || !sum) throw new Error('Split weights must add up to more than zero.');
    // BigInt keeps the multiplication exact even for large valid amounts.
    const denom = BigInt(sum);
    const parts = weights.map((weight, index) => {
      const product = BigInt(total) * BigInt(weight);
      return { index, amount: Number(product / denom), remainder: product % denom };
    });
    let remaining = total - parts.reduce((a, p) => a + p.amount, 0);
    parts.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    for (let i = 0; i < remaining; i++) parts[i].amount++;
    return parts.sort((a, b) => a.index - b.index).map(p => p.amount);
  }
  function shares(total, participants, method) {
    integer(total, 'Total');
    if (!participants.length || new Set(participants.map(p => p.id)).size !== participants.length || participants.some(p => !p.id)) throw new Error('Select unique participants.');
    let amounts;
    if (method === 'equal') amounts = distribute(total, participants.map(() => 1));
    else if (method === 'exact') {
      amounts = participants.map(p => integer(p.value, 'Amount'));
      if (amounts.reduce((a, b) => a + b, 0) !== total) throw new Error('Exact shares must add up to the expense total.');
    } else if (method === 'percentage') {
      const weights = participants.map(p => integer(p.value, 'Percentage'));
      if (weights.reduce((a, b) => a + b, 0) !== 10000) throw new Error('Percentages must add up to 100%.');
      amounts = distribute(total, weights);
    } else if (method === 'shares') amounts = distribute(total, participants.map(p => p.value));
    else throw new Error('Unknown split method.');
    return participants.map((p, i) => ({ id: p.id, cents: amounts[i] }));
  }
  function balances(members, expenses, settlements) {
    const result = Object.fromEntries(members.map(m => [m.id, 0]));
    const apply = (id, amount) => {
      if (!Object.hasOwn(result, id)) throw new Error('Unknown group member.');
      result[id] += amount;
      if (!Number.isSafeInteger(result[id])) throw new Error('Balance exceeds supported amount.');
    };
    expenses.forEach(expense => {
      const paid = expense.payers.reduce((sum, p) => sum + integer(p.cents, 'Payment'), 0);
      const owed = expense.shares.reduce((sum, p) => sum + integer(p.cents, 'Share'), 0);
      if (!Number.isSafeInteger(paid) || paid !== owed) throw new Error('Payments and shares must match.');
      expense.payers.forEach(p => apply(p.id, p.cents)); expense.shares.forEach(p => apply(p.id, -p.cents));
    });
    settlements.forEach(s => { integer(s.cents, 'Settlement'); if (!s.cents || s.from === s.to) throw new Error('Invalid settlement.'); apply(s.from, s.cents); apply(s.to, -s.cents); });
    return result;
  }
  function simplify(net) {
    const debtors = Object.entries(net).filter(([, n]) => n < 0).map(([id, n]) => ({ id, cents: -n }));
    const creditors = Object.entries(net).filter(([, n]) => n > 0).map(([id, n]) => ({ id, cents: n }));
    if (Object.values(net).reduce((a, b) => a + b, 0) !== 0) throw new Error('Balances do not add up to zero.');
    const transfers = []; let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].cents, creditors[j].cents);
      transfers.push({ from: debtors[i].id, to: creditors[j].id, cents: amount });
      debtors[i].cents -= amount; creditors[j].cents -= amount;
      if (!debtors[i].cents) i++; if (!creditors[j].cents) j++;
    }
    return transfers;
  }
  const api = { distribute, shares, balances, simplify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SplitMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
