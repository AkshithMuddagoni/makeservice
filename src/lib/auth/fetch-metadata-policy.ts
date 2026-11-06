export type FetchMetadata = {
  site: string | null;
  mode: string | null;
  destination: string | null;
  method: string;
};

/**
 * Allow only requests that are not browser cross-site/sibling scripted calls.
 *
 * Top-level GET navigations are intentionally permitted for broker OAuth
 * callbacks and ordinary address-bar navigation. Sec-Fetch-Dest object/embed
 * are excluded because they can load framed/embedded resources.
 */
export function isAllowedFetchMetadata(input: FetchMetadata): boolean {
  const { site, mode, destination, method } = input;
  if (!site || site === "same-origin" || site === "none") return true;

  return mode === "navigate" &&
    method === "GET" &&
    destination !== "object" &&
    destination !== "embed";
}
