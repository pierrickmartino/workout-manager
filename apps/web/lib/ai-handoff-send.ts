// How an AI Hand-off leaves the device (ADR-0132): **Send** opens the device's share sheet where
// there is one and copies to the clipboard otherwise; **Copy** always copies. The app itself never
// sends, stores or logs the text, and there are no deep links. The device is injected (the sheet
// passes `navigator`), so these rules are unit-tested without a browser and the sheet stays thin.

// The slice of `navigator` the hand-off uses. Every member is optional: a desktop browser has no
// share sheet, and an insecure context has no clipboard.
export interface HandoffDevice {
  share?: (data: { text: string }) => Promise<void>;
  canShare?: (data: { text: string }) => boolean;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

// What one tap did. `cancelled` means the user dismissed the share sheet: nothing was sent, and
// the preview stays open.
export type HandoffResult = "shared" | "copied" | "cancelled" | "copy-failed";

// The error name a dismissed share sheet rejects with.
const SHARE_DISMISSED = "AbortError";

function canShare(device: HandoffDevice, text: string): boolean {
  if (typeof device.share !== "function") return false;
  return device.canShare ? device.canShare({ text }) : true;
}

// Copy the text. A missing or denied clipboard is a failed copy, which the sheet reports while
// the preview stays selectable for a manual copy.
export async function copyHandoff(text: string, device: HandoffDevice): Promise<HandoffResult> {
  if (!device.clipboard) return "copy-failed";
  try {
    await device.clipboard.writeText(text);
    return "copied";
  } catch {
    return "copy-failed";
  }
}

// Send the text: the share sheet where the device can share it, else the clipboard. A dismissed
// share sheet is a no-op; a share that fails for any other reason falls back to copying, so the
// action still lands somewhere.
export async function sendHandoff(text: string, device: HandoffDevice): Promise<HandoffResult> {
  if (!canShare(device, text) || !device.share) return copyHandoff(text, device);
  try {
    await device.share({ text });
    return "shared";
  } catch (error: unknown) {
    if (error instanceof Error && error.name === SHARE_DISMISSED) return "cancelled";
    return copyHandoff(text, device);
  }
}

// The line the sheet shows after a tap, or null when there is nothing to say (a dismissed share).
export function handoffResultMessage(result: HandoffResult | null): string | null {
  switch (result) {
    case "shared":
      return "Handed to your share sheet.";
    case "copied":
      return "Copied. Paste it into the AI app of your choice.";
    case "copy-failed":
      return "Couldn’t copy. Select the text above and copy it by hand.";
    default:
      return null;
  }
}
