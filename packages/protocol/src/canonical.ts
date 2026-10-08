/**
 * Canonical JSON: object keys sorted by code point, no whitespace, `undefined` members dropped like JSON.stringify.
 * Non-finite numbers and non-plain values are rejected so two nodes can never disagree on the bytes they sign.
 */
export function canonical(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonical: non-finite number');
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value))
        return `[${value.map((item) => canonical(item === undefined ? null : item)).join(',')}]`;
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonical: unsupported type ${typeof value}`);
  }
}
