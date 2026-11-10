export interface ClipboardEnvironment {
  clipboard: Pick<Clipboard, "writeText"> | undefined;
  document: Document;
}

/**
 * Copies text with the Clipboard API, falling back to a hidden text area and
 * `execCommand("copy")` where the API is missing or refused. Resolves true on success.
 */
export async function copyText(
  text: string,
  { clipboard, document }: ClipboardEnvironment = { clipboard: navigator.clipboard, document: window.document },
): Promise<boolean> {
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
