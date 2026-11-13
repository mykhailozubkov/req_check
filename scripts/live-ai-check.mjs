// Manual integration check. Running this consumes one free-model request.
import { mkdirSync, writeFileSync } from 'node:fs';
import { validateReview } from '../lib/review.mjs';

const origin = 'https://req-check.mykhailo-zubkov.workers.dev';
const story = `# View submitted order details
As a Workshop User, I want to view the contents of a submitted order so that I can track production.

Business rules:
- A Workshop User may view an order only if it belongs to their assigned workshop.
- Draft orders are excluded. Submitted orders remain viewable when Completed or Cancelled.
- This page is read-only: it cannot edit items, change statuses, cancel orders, or complete orders.
- Show order ID, client name, due date in DD.MM.YYYY format, order status, and all garment names with their stored production status.
- Financial information, including prices, payment status, tax, discounts, and balance, is never shown.
- Number of items counts individual garments: a three-piece suit counts as 3 items.
- A suit group has a separately stored production status. This page displays it without computing it from its garments.

Acceptance criteria:
- Given an assigned Workshop User and a submitted order in their workshop, viewing the order shows its listed details and garments without financial fields or modification actions.
- Given an order belonging to another workshop, the user cannot view its details.
- Given a Draft order, this submitted-order page is unavailable.
- Given a Completed or Cancelled submitted order in the user's workshop, its details remain viewable and read-only.`;

const response = await fetch(new URL('/api/review', origin), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ story, language: 'ru', context: '', answers: [] }),
  signal: AbortSignal.timeout(130000),
});
const result = await response.json();
if (!response.ok) {
  console.log(JSON.stringify({ status: response.status, error: result.error, code: result.code }));
  process.exitCode = 1;
} else {
  validateReview(result, story);
  if (result.meta?.provider !== 'OpenRouter' || result.meta?.routingModel !== 'openrouter/free' || result.meta?.demo !== false) throw new Error('Unexpected provider result');
  mkdirSync('outputs', { recursive: true });
  writeFileSync('outputs/openrouter-live-check.json', JSON.stringify({ story, result }, null, 2));
  console.log(JSON.stringify({ status: response.status, provider: result.meta.provider, model: result.meta.model, routingModel: result.meta.routingModel, findings: result.findings.length, rewriteLength: result.rewrite.length, evidenceVerified: true }));
}
