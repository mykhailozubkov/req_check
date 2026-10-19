import { handleReviewRequest } from '../../../lib/review.mjs';

export const dynamic = 'force-dynamic';

// A private Site's access boundary is enforced by Sites. Each request supplies
// its own provider key; there is no shared billable credential or stored story.
export async function POST(request) {
  return handleReviewRequest(request);
}
