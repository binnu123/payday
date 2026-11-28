const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../www/sms-parser.js');

test('detects debit and credit amounts', () => {
  assert.equal(parse({ body: 'INR 1,250.50 debited from your account', sender: 'BANK' }).amount, 1250.5);
  assert.equal(parse({ body: 'Your account was credited with Rs. 800', sender: 'BANK' }).type, 'income');
  assert.equal(parse({ body: '₹99 spent at a shop', sender: 'BANK' }).type, 'expense');
});
test('skips ambiguous messages and verification codes', () => {
  assert.equal(parse({ body: 'Your OTP is 1234, INR 100 debited' }), null);
  assert.equal(parse({ body: 'INR 100 debited and INR 100 credited' }), null);
  assert.equal(parse({ body: 'Your balance is INR 100' }), null);
});
