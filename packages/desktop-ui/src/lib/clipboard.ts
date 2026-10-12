/**
 * Copies text on a click of the owner. The page is served from http://127.0.0.1, a potentially trustworthy origin
 * (W3C Secure Contexts), where navigator.clipboard is allowed on a user gesture. A WebView that refuses it rejects
 * here: the caller says so, and the text stays selectable by hand.
 */
export function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
