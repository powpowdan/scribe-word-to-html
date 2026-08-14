// Test loader for the classic-script editor modules.
//
// The editor ships as classic scripts that attach to window.Scribe (so it
// opens via file:// with no server). These files have no ES `export`s to
// `import`, so tests instead eval the source text into a fresh happy-dom
// Window — exactly how a browser would load and execute the classic scripts.
// `win.eval` runs scoped to that window's own `document`/`window`, so the
// namespace is populated for assertions.
//
// main.js is intentionally NOT loaded (it auto-runs init() on DOMContentLoaded
// and would fail without the full index.html DOM).

import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import path from "node:path";

// Tests run from editor/ (npm test's cwd). Resolve src/ relative to it so the
// loader works regardless of vitest's import.meta.url scheme.
const srcDir = path.resolve(process.cwd(), "src");

const DEFAULT_ORDER = [
  "document-model.js",
  "cleanup.js",
  "format-html.js",
  "table-editor.js",
  "code-view.js",
  "live-view.js",
  "sync.js",
  "entry.js",
  "copy.js",
  "highlight.js"
];

export function loadScribe(files = DEFAULT_ORDER) {
  const win = new Window();
  for (const f of files) {
    const text = readFileSync(path.join(srcDir, f), "utf8");
    win.eval(text);
  }
  return win;
}
