(function (root) {
  function parse(message) {
    const body = String(message.body || '');
    if (/\b(?:otp|one.time password|verification code)\b/i.test(body)) return null;
    const debit = /\b(?:debited|debit|spent|paid|withdrawn|withdrawal|purchase)\b/i.test(body);
    const credit = /\b(?:credited|credit|received|deposited|deposit)\b/i.test(body);
    if (debit === credit) return null;
    const amount = body.match(/(?:₹|\b(?:inr|rs)\.?\s*)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (!amount) return null;
    const value = Number(amount[1].replace(/,/g, ''));
    if (!(value > 0 && value <= 9999999999.99)) return null;
    return { type: debit ? 'expense' : 'income', amount: value, sender: String(message.sender || 'Unknown sender').slice(0, 60), date: Number(message.date), body };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { parse };
  else root.PaydaySms = { parse };
})(typeof window !== 'undefined' ? window : globalThis);
