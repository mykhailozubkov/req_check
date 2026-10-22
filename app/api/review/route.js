import { handleReviewRequest } from '../../../lib/review.mjs';

export const dynamic = 'force-dynamic';

// The app is public. Each request supplies
// its own provider key; there is no shared billable credential or stored story.
export async function POST(request) {
  return handleReviewRequest(request);
}
