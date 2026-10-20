import { handleReviewRequest } from '../../../lib/review.mjs';

export const dynamic = 'force-dynamic';

// Cloudflare Access is verified at the Worker boundary. Each request supplies
// its own provider key; there is no shared billable credential or stored story.
export async function POST(request) {
  return handleReviewRequest(request);
}
