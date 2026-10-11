/** Routes that belong to a live call: /call/:donorId and its brief, call, and post-call steps. */
const CALL_ROUTE = /^\/call\/[^/]+(?:\/|$)/;

export function isInCallPath(pathname: string): boolean {
  return CALL_ROUTE.test(pathname);
}
