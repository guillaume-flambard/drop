/** Character checks shared by hand-written answers (T4.3) and published facts (T4.4). */

/** C0 and C1 control characters other than tab and line ends mark binary content (U+009B is an 8-bit escape). */
export function isBinary(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

/** A one-line label shown in another person's tools: no control character at all, and no bidi override. */
export function isUnsafeLabel(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || (code >= 127 && code <= 159)) return true;
    // Bidi marks and overrides, line and paragraph separators, zero-width characters and the word joiner.
    if (
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x2069) ||
      code === 0x061c ||
      code === 0xfeff
    )
      return true;
  }
  return false;
}
