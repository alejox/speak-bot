// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * jsdom cannot measure layout, so the "the document never scrolls" guarantee is checked on the CSS itself.
 * Manual check: in the packaged app, open the key inspector, focus its last field (and a colour swatch),
 * and confirm the shell does not shift up.
 */
const stylesDir = fileURLToPath(new URL("../src/styles/", import.meta.url));
const css = readdirSync(stylesDir)
  .filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(join(stylesDir, name), "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** Every rule (also inside at-rules) as its selectors and declarations. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selectors: match[1]!.split(",").map((selector) => selector.trim()),
  body: match[2]!,
}));
const declarationsOf = (selector: string) =>
  rules
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join(";");

describe("the app shell never scrolls the document", () => {
  it("clips the root, so neither focus nor script can scroll it", () => {
    for (const root of ["html", "body"]) expect(declarationsOf(root)).toMatch(/overflow:\s*clip/);
  });

  it("makes every scrolling panel the containing block of what is positioned inside it", () => {
    // Visually hidden inputs are absolutely positioned; with no positioned ancestor they hang off the
    // viewport and stretch the document, and focusing them scrolls it.
    const scrolling = [...new Set(rules.filter((rule) => /overflow(-y|-x)?:\s*(auto|scroll)/.test(rule.body)).flatMap((rule) => rule.selectors))].filter(
      // Form controls hold no positioned children.
      (selector) => !/textarea|composer-text/.test(selector),
    );
    expect(scrolling).toEqual(expect.arrayContaining([".app-main", ".inspector"]));
    for (const selector of scrolling) expect({ selector, positioned: /position:\s*(relative|absolute|fixed|sticky)/.test(declarationsOf(selector)) }).toEqual({ selector, positioned: true });
  });
});
