import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { OVERLAY_FILE } from "../src/server/static-files";

describe("overlay.html", () => {
  it("is a self-contained page that renders captions safely", async () => {
    const html = await readFile(OVERLAY_FILE, "utf8");

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("background: transparent");
    expect(html).toContain("/ws");
    expect(html).toContain("textContent");
    expect(html).not.toContain("innerHTML");
    expect(html).not.toMatch(/<script[^>]+src=/);
    // Colors are validated, so `bg=url(https://tracker)` cannot make OBS fetch anything.
    expect(html).toContain('CSS.supports("color"');
    for (const param of ["size", "position", "hold", "color", "bg"]) expect(html).toContain(`"${param}"`);
  });

  it("declares Spanish as the document language", async () => {
    const html = await readFile(OVERLAY_FILE, "utf8");

    expect(html).toContain('<html lang="es">');
    expect(html).toContain("<title>Subtítulos de Speak Bot</title>");
  });
});
