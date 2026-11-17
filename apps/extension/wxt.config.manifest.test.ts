// @vitest-environment node
import { describe, expect, it } from "vitest";
import config from "./wxt.config";
import { SITE_ORIGIN } from "./src/site-pages";

// The manifest is built by a function of the WXT command and mode, and
// three of its entries are development-only. The threat model relies on
// none of them reaching a production build, and until now nothing pinned
// that:
// - `key` carries the Web Store item's public key so an unpacked dev
//   build gets the store's extension id; the store refuses an upload
//   that carries one.
// - the localhost `externally_connectable` matches let a local copy of
//   the site message a dev build; a production build may be messaged
//   only by the Gleam site itself.
// - the page CSP gains the dev server's http and ws origins only for
//   `serve`.
const manifestFor = async (command: "build" | "serve", mode: "production" | "development") => {
  const manifest = config.manifest;
  if (typeof manifest !== "function") throw new Error("wxt.config must build the manifest in a function");
  return manifest({ command, mode, browser: "chrome", manifestVersion: 3 });
};

describe("wxt.config manifest", () => {
  it("keeps the store key out of production builds, and in dev builds", async () => {
    expect((await manifestFor("build", "production")).key).toBeUndefined();
    expect(typeof (await manifestFor("build", "development")).key).toBe("string");
  });

  it("lets only the Gleam site message a production build", async () => {
    expect((await manifestFor("build", "production")).externally_connectable?.matches).toEqual([`${SITE_ORIGIN}/*`]);

    const devMatches = (await manifestFor("build", "development")).externally_connectable?.matches ?? [];
    expect(devMatches).toContain(`${SITE_ORIGIN}/*`);
    expect(devMatches.filter((match) => match !== `${SITE_ORIGIN}/*`).every((match) => match.startsWith("http://"))).toBe(
      true,
    );
  });

  it("adds the dev server to the page CSP only when serving", async () => {
    const productionCsp = (await manifestFor("build", "production")).content_security_policy?.extension_pages ?? "";
    expect(productionCsp).not.toContain("localhost");
    expect(productionCsp).not.toContain("http:");

    const serveCsp = (await manifestFor("serve", "development")).content_security_policy?.extension_pages ?? "";
    expect(serveCsp).toContain("http://localhost:*");
  });

  it("exposes only the provider script to pages, through a per-session URL", async () => {
    const resources = (await manifestFor("build", "production")).web_accessible_resources ?? [];
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ resources: ["provider.js"], use_dynamic_url: true });
  });

  it("grants no broad host permission up front; every other host is requested at runtime", async () => {
    const manifest = await manifestFor("build", "production");
    expect(manifest.host_permissions?.every((pattern) => pattern.startsWith("https://") && pattern !== "https://*/*")).toBe(
      true,
    );
    expect(manifest.optional_host_permissions).toEqual(["https://*/*"]);
  });
});
