import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedFetchMetadata } from "./fetch-metadata-policy.ts";

test("allows same-origin and non-browser requests", () => {
  assert.equal(isAllowedFetchMetadata({
    site: "same-origin",
    mode: "cors",
    destination: "empty",
    method: "POST",
  }), true);
  assert.equal(isAllowedFetchMetadata({
    site: "none",
    mode: "navigate",
    destination: "document",
    method: "GET",
  }), true);
  assert.equal(isAllowedFetchMetadata({
    site: null,
    mode: null,
    destination: null,
    method: "POST",
  }), true);
});

test("blocks cross-site and same-site scripted requests", () => {
  for (const site of ["cross-site", "same-site"]) {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      assert.equal(isAllowedFetchMetadata({
        site,
        mode: "cors",
        destination: "empty",
        method,
      }), false);
    }
  }
});

test("allows top-level GET navigations for redirects and normal navigation", () => {
  for (const site of ["cross-site", "same-site"]) {
    assert.equal(isAllowedFetchMetadata({
      site,
      mode: "navigate",
      destination: "document",
      method: "GET",
    }), true);
    // Browser navigations use document/empty destinations, not object/embed.
    assert.equal(isAllowedFetchMetadata({
      site,
      mode: "navigate",
      destination: null,
      method: "GET",
    }), true);
  }
});

test("blocks non-GET navigations and embedded object/embed loads", () => {
  for (const destination of ["object", "embed"]) {
    assert.equal(isAllowedFetchMetadata({
      site: "cross-site",
      mode: "navigate",
      destination,
      method: "GET",
    }), false);
  }
  assert.equal(isAllowedFetchMetadata({
    site: "same-site",
    mode: "navigate",
    destination: "document",
    method: "POST",
  }), false);
});
