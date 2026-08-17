import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Static guards for the WET/GCWeb preview stylesheet (wet-components spec):
// it must be linked after the other stylesheets, every top-level rule must
// be scoped under the Live view root, and the key GCWeb values must be
// present. Visual rendering is browser-verified.

const html = readFileSync("index.html", "utf8");
const css = readFileSync("css/wet-preview.css", "utf8");

describe("wet-preview.css wiring", () => {
  it("is linked after bootstrap and editor.css", () => {
    expect(html).toContain('href="css/wet-preview.css"');
    expect(html.indexOf("css/wet-preview.css")).toBeGreaterThan(html.indexOf("vendor/bootstrap"));
    expect(html.indexOf("css/wet-preview.css")).toBeGreaterThan(html.indexOf("css/editor.css"));
  });
});

describe("scoping: preview styles never leave the Live view", () => {
  it("every top-level selector starts with .live-surface (or the dark-theme alert pin)", () => {
    // Strip comments, then walk top-level rule blocks.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = bare.split("}").map((r) => r.split("{")[0].trim()).filter(Boolean);
    expect(rules.length).toBeGreaterThan(20);
    rules.forEach((sel) => {
      const ok = sel.split(",").every((part) => {
        const p = part.trim();
        return p.startsWith(".live-surface") || p.startsWith('[data-bs-theme="dark"] .live-surface');
      });
      expect(ok, `unscoped selector: ${sel}`).toBe(true);
    });
  });

  it("the only dark-theme rule is the alert backdrop", () => {
    const darkRules = css.match(/\[data-bs-theme="dark"\][^{}]*/g) || [];
    expect(darkRules.length).toBe(1);
    expect(darkRules[0]).toContain(".alert");
  });
});

describe("key GCWeb values are present", () => {
  it("alert pattern: accent colours, segmented bar, icon, transparent fill", () => {
    ["#269abc", "#278400", "#ee7100", "#d3080c"].forEach((c) => expect(css).toContain(c));
    expect(css).toMatch(/border-image:\s*linear-gradient\(to bottom/);
    expect(css).toContain('content: "\\f05a"');
    expect(css).toMatch(/\.alert\s*\{[^}]*background-color:\s*transparent/s);
  });

  it("panel structure and variant palette", () => {
    ["#2392a9", "#629339", "#ba8312", "#c16171", "#8e8e8e"].forEach((c) => expect(css).toContain(c));
    expect(css).toMatch(/\.panel-heading\s*\{/);
    expect(css).toMatch(/\.panel-title\s*\{[^}]*font-size:\s*18px/s);
    expect(css).toMatch(/\.panel-footer\s*\{[^}]*#f5f5f5/s);
  });

  it("wells and WET blue buttons", () => {
    expect(css).toMatch(/\.well-lg\s*\{[^}]*padding:\s*24px/s);
    expect(css).toMatch(/\.well-sm\s*\{[^}]*padding:\s*9px/s);
    expect(css).toContain("#2572b4");
    expect(css).toMatch(/\.btn-default\s*\{[^}]*#335075/s);
    expect(css).toMatch(/\.btn-link\s*\{[^}]*#295376/s);
  });
});
