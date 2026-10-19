import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStory, handleReviewRequest, validateReview, validateInput, SYSTEM_PROMPT } from '../lib/review.mjs';

const story = 'Workshop users can view submitted orders. Financial information is hidden. A suit has its own status.';
const input = { story, apiKey: 'test-key-not-a-real-credential', answers: [{ findingId: 'F1', question: 'How is status determined?', answer: 'Status is stored separately.' }] };
function valid() {
  return { summary: 'Нужно уточнить правило статуса.', strengths: ['Явно указана роль.'], findings: [{ id: 'F1', type: 'ambiguity', priority: 'medium', certainty: 'needs_context', title: 'Статус комплекта', evidence: ['A suit has its own status.'], explanation: 'Не указан источник статуса.', question: 'Как определяется статус?', suggestion: 'Сослаться на правило.' }], rewrite: '# Story\nFinancial information is hidden.\n[BA DECISION REQUIRED: Define status source.]', changes: [{ kind: 'decision_required', description: 'Нужен источник статуса.' }], openQuestions: [{ findingId: 'F1', question: 'Как определяется статус?' }] };
}
function request(value, origin = 'https://story.test') {
  return new Request('https://story.test/api/review', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(value) });
}
const success = (value = valid()) => async () => Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }] });

test('sends policy, schema, context and BA answers to the fixed Anthropic endpoint', async () => {
  let captured;
  const result = await analyzeStory({ ...input, context: 'Domain glossary', language: 'en' }, { fetchImpl: async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) }; return success()();
  } });
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.init.headers['x-api-key'], input.apiKey);
  assert.equal(captured.body.system, SYSTEM_PROMPT);
  assert.equal(captured.body.output_config.format.type, 'json_schema');
  const user = JSON.parse(captured.body.messages[0].content);
  assert.equal(user.sourceStory, story); assert.equal(user.businessContext, 'Domain glossary');
  assert.deepEqual(user.baAnswers, input.answers); assert.equal(user.reviewLanguage, 'en');
  assert.equal(result.meta.demo, false); assert.equal(result.meta.policyVersion, 'business-first-v1');
  assert.ok(!JSON.stringify(result).includes(input.apiKey));
});

test('requires provider key before contacting any external service', async () => {
  let called = false;
  const response = await handleReviewRequest(request({ story }), { fetchImpl: async () => { called = true; } });
  assert.equal(response.status, 401); assert.equal(called, false);
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
  assert.throws(() => validateReview(output, story), /непроверяемый/);
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
test('validates input lengths, header injection and non-Anthropic model names', () => {
  for (const bad of [{ story: 'short' }, { story: 'a'.repeat(50001) }, { story, context: 123 }, { story, apiKey: 'x\r\nevil: true' }, { story, model: 'https://evil.test' }, { story, answers: [{ findingId: 'F1', question: 'q', answer: 5 }] }]) assert.throws(() => validateInput(bad));
});
test('bounded body reader rejects oversized JSON and wrong content type', async () => {
  const huge = await handleReviewRequest(request({ story: 'x'.repeat(260000) })); assert.equal(huge.status, 413);
  const plain = new Request('https://story.test/api/review', { method: 'POST', headers: { origin: 'https://story.test' }, body: 'text' });
  assert.equal((await handleReviewRequest(plain)).status, 415);
});
test('provider failures do not echo upstream data or credentials', async () => {
  for (const code of [401, 429, 500]) {
    const response = await handleReviewRequest(request(input), { fetchImpl: async () => new Response('upstream secret ' + input.apiKey, { status: code }) });
    assert.equal(response.status, code === 500 ? 502 : code);
    assert.ok(!(await response.text()).includes(input.apiKey));
  }
});
test('network failure is surfaced without retry or sample fallback', async () => {
  let calls = 0;
  const response = await handleReviewRequest(request(input), { fetchImpl: async () => { calls++; throw new Error('connection failed'); } });
  assert.equal(response.status, 504); assert.equal(calls, 1);
  assert.ok(!(await response.text()).includes('demo'));
});
test('truncated provider response and invalid JSON are rejected', async () => {
  for (const result of [{ stop_reason: 'max_tokens', content: [{ type: 'text', text: JSON.stringify(valid()) }] }, { stop_reason: 'end_turn', content: [{ type: 'text', text: '{' }] }]) {
    await assert.rejects(analyzeStory(input, { fetchImpl: async () => Response.json(result) }), /неполный/);
  }
});
