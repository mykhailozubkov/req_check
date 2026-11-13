import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStory, handleReviewRequest, validateReview, validateInput, SYSTEM_PROMPT } from '../lib/review.mjs';

const story = 'Workshop users can view submitted orders. Financial information is hidden. A suit has its own status.';
const secret = 'test-server-key-not-a-real-credential';
const input = { story, answers: [{ findingId: 'F1', question: 'How is status determined?', answer: 'Status is stored separately.' }] };
function valid() {
  return { summary: 'Нужно уточнить правило статуса.', strengths: ['Явно указана роль.'], findings: [{ id: 'F1', type: 'ambiguity', priority: 'medium', certainty: 'needs_context', title: 'Статус комплекта', evidence: ['A suit has its own status.'], explanation: 'Не указан источник статуса.', question: 'Как определяется статус?', suggestion: 'Сослаться на правило.' }], rewrite: '# Story\nFinancial information is hidden.\n[BA DECISION REQUIRED: Define status source.]', changes: [{ kind: 'decision_required', description: 'Нужен источник статуса.' }], openQuestions: [{ findingId: 'F1', question: 'Как определяется статус?' }] };
}
function request(value, origin = 'https://story.test') {
  return new Request('https://story.test/api/review', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(value) });
}
const success = (value = valid()) => async () => Response.json({ model: 'example/model:free', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });

test('uses only the server key, fixed free route, zero-price providers and structured output', async () => {
  let captured;
  const result = await analyzeStory({ ...input, context: 'Domain glossary', language: 'en' }, { apiKey: secret, fetchImpl: async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) }; return success()();
  } });
  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(captured.init.headers.Authorization, `Bearer ${secret}`);
  assert.equal(captured.body.model, 'openrouter/free');
  assert.equal(captured.body.messages[0].content, SYSTEM_PROMPT);
  assert.equal(captured.body.response_format.type, 'json_schema');
  assert.equal(captured.body.response_format.json_schema.strict, true);
  assert.deepEqual(captured.body.provider, { require_parameters: true, max_price: { prompt: 0, completion: 0 } });
  assert.ok(!('models' in captured.body));
  const user = JSON.parse(captured.body.messages[1].content);
  assert.equal(user.sourceStory, story); assert.equal(user.businessContext, 'Domain glossary');
  assert.deepEqual(user.baAnswers, input.answers); assert.equal(user.reviewLanguage, 'en');
  assert.equal(result.meta.demo, false); assert.equal(result.meta.policyVersion, 'business-first-v1');
  assert.equal(result.meta.provider, 'OpenRouter');
  assert.equal(result.meta.model, 'example/model:free');
  assert.equal(result.meta.routingModel, 'openrouter/free');
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('requires provider key before contacting any external service', async () => {
  let called = false;
  const response = await handleReviewRequest(request({ story }), { fetchImpl: async () => { called = true; } });
  assert.equal(response.status, 503); assert.equal(called, false);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('rejects cross-origin and missing-origin requests before external calls', async () => {
  for (const origin of ['https://evil.test', '']) {
    const response = await handleReviewRequest(request(input, origin), { fetchImpl: () => assert.fail('Must not call API') });
    assert.equal(response.status, 403);
  }
});
test('rejects fabricated citations instead of displaying ungrounded findings', () => {
  const output = valid(); output.findings[0].evidence = ['Invented requirement'];
  assert.throws(() => validateReview(output, story), error => error.code === 'ungrounded_evidence');
});
test('conflicts require two distinct source citations', () => {
  const output = valid(); output.findings[0].type = 'conflict';
  assert.throws(() => validateReview(output, story));
  output.findings[0].evidence = ['A suit has its own status.', 'A suit has its own status.'];
  assert.throws(() => validateReview(output, story));
  output.findings[0].evidence = ['A suit has its own status.', 'Financial information is hidden.'];
  // Structural validation checks grounding, not semantic incompatibility.
  assert.doesNotThrow(() => validateReview(output, story));
});
test('empty finding list is valid and no arbitrary issue quota is imposed', () => {
  const output = valid(); output.findings = []; output.openQuestions = []; output.changes = [];
  assert.doesNotThrow(() => validateReview(output, story));
});
test('rejects duplicate IDs and dangling questions', () => {
  const output = valid(); output.findings.push({ ...output.findings[0] });
  assert.throws(() => validateReview(output, story));
  output.findings.pop(); output.openQuestions[0].findingId = 'F9';
  assert.throws(() => validateReview(output, story));
});
test('validates input and refuses client-supplied keys, model selection or provider URLs', () => {
  for (const bad of [{ story: 'short' }, { story: 'a'.repeat(50001) }, { story, context: 123 }, { story, apiKey: 'client-key' }, { story, model: 'paid/model' }, { story, provider: 'other' }, { story, baseURL: 'https://evil.test' }, { story, answers: [{ findingId: 'F1', question: 'q', answer: 5 }] }]) assert.throws(() => validateInput(bad));
});
test('bounded body reader rejects oversized JSON and wrong content type', async () => {
  const huge = await handleReviewRequest(request({ story: 'x'.repeat(260000) })); assert.equal(huge.status, 413);
  const plain = new Request('https://story.test/api/review', { method: 'POST', headers: { origin: 'https://story.test' }, body: 'text' });
  assert.equal((await handleReviewRequest(plain)).status, 415);
});
test('provider failures do not echo upstream data or credentials', async () => {
  for (const code of [401, 429, 500]) {
    const response = await handleReviewRequest(request(input), { apiKey: secret, fetchImpl: async () => new Response('upstream secret ' + secret, { status: code }) });
    assert.equal(response.status, code === 500 ? 502 : code === 401 ? 503 : code);
    assert.ok(!(await response.text()).includes(secret));
  }
});
test('network failure is surfaced without retry or sample fallback', async () => {
  let calls = 0;
  const response = await handleReviewRequest(request(input), { apiKey: secret, fetchImpl: async () => { calls++; throw new Error('connection failed'); } });
  assert.equal(response.status, 504); assert.equal(calls, 1);
  assert.ok(!(await response.text()).includes('demo'));
});
test('truncated provider response and invalid JSON are rejected', async () => {
  for (const result of [{ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(valid()) } }] }, { choices: [{ finish_reason: 'stop', message: { content: '{' } }] }]) {
    await assert.rejects(analyzeStory(input, { apiKey: secret, fetchImpl: async () => Response.json(result) }), /неполный/);
  }
});

test('rejects attempts to select paid models before making a provider request', async () => {
  const response = await handleReviewRequest(request({ ...input, model: 'paid/model' }), { apiKey: secret, fetchImpl: () => assert.fail('Must not call provider') });
  assert.equal(response.status, 400);
});
test('rate limiter blocks upstream requests and returns a retry interval', async () => {
  const response = await handleReviewRequest(request(input), { apiKey: secret, rateLimiter: async () => false, fetchImpl: () => assert.fail('Must not call provider') });
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
});
test('OpenRouter free quota errors preserve safe retry metadata', async () => {
  const response = await handleReviewRequest(request(input), { apiKey: secret, fetchImpl: async () => new Response('quota exceeded', { status: 429, headers: { 'Retry-After': '120' } }) });
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '120');
});
test('handles provider errors inside HTTP 200 without treating them as valid reviews', async () => {
  const response = await handleReviewRequest(request(input), { apiKey: secret, fetchImpl: async () => Response.json({ error: { code: 429, message: 'private upstream details' } }) });
  assert.equal(response.status, 429); assert.ok(!(await response.text()).includes('private upstream details'));
});
test('does not contact the provider with a malformed server key', async () => {
  await assert.rejects(analyzeStory(input, { apiKey: 'invalid\r\nkey', fetchImpl: () => assert.fail('Must not call provider') }), /не настроен/);
});
