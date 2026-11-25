const { test } = require('node:test');
const assert = require('node:assert/strict');
const { redact } = require('../privacy.cjs');

test('removes common secrets and contact details before submission', () => {
  const result = redact('Email me at student@example.com, call 555-123-4567. password: private-demo OTP: 123456 sk-fakecredential123');
  for (const secret of ['student@example.com', '555-123-4567', 'private-demo', '123456', 'sk-fakecredential123']) {
    assert.ok(!result.includes(secret));
  }
});

test('keeps link domain clues without credentials, paths, or query values', () => {
  const result = redact('Visit https://user:private-demo@bank-alert.example/reset?token=private-demo');
  assert.equal(result, 'Visit [link domain: bank-alert[.]example]');
});

test('rechecking a reviewed preview preserves its warning clues', () => {
  const preview = redact('Act in 10 minutes at https://bank-alert.example/reset');
  assert.equal(redact(preview), preview);
  assert.ok(preview.includes('10 minutes'));
});

test('removes private values from a link pasted without https', () => {
  const link = 'bank-alert.example/verify?email=student@example.com&token=fictional-demo#private';
  assert.equal(redact(link), '[link domain: bank-alert[.]example]');
  assert.equal(redact('Go to ' + link), 'Go to [link domain: bank-alert[.]example]');
  assert.equal(redact('bank-alert.example'), '[link domain: bank-alert[.]example]');
  assert.equal(redact('//bank-alert.example/verify?password=private'), '[link domain: bank-alert[.]example]');
  assert.equal(redact('Password: private.example'), 'Password: [removed]');
});

test('reads the host before the path even when the rest has an at sign', () => {
  const link = 'HTTPS://bank-alert.example/reset?email=student@example.com';
  assert.equal(redact(link), '[link domain: bank-alert[.]example]');
  assert.equal(redact('Contact student@www.example.com'), 'Contact [email removed]');
});
