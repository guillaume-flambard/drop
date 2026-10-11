import {
  applyEdits,
  findNodeAtLocation,
  modify,
  parseTree,
  parse as parseJsonc,
  type Edit,
  type ParseError,
} from 'jsonc-parser';
import { isMap, isNode, isScalar, parseDocument, type Document } from 'yaml';

/**
 * Format-preserving edits of one entry in a client's configuration file (T4.22, D84, D85). JSON and JSONC go through
 * jsonc-parser (`modify` then `applyEdits`, what VS Code uses): comments, key order, indentation and line endings stay
 * as they were, and only the text of our entry changes. YAML goes through the `yaml` Document API, which keeps
 * comments. Nothing here touches the disk: the caller reads, checks freshness, backs up and renames.
 */
export type EditFormat = 'json' | 'jsonc' | 'yaml';

const BOM = '﻿';

/** The file's own layout, as jsonc-parser's formatting options expect it. */
export interface Formatting {
  insertSpaces: boolean;
  tabSize: number;
  eol: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The JSON value of a whole file; strict JSON refuses comments, JSONC accepts them and trailing commas. */
function parseJsonText(body: string, format: 'json' | 'jsonc'): Record<string, unknown> {
  if (body.trim() === '') return {};
  let value: unknown;
  if (format === 'json') {
    try {
      value = JSON.parse(body) as unknown;
    } catch {
      throw new Error('E_CONFIG_INVALID');
    }
  } else {
    const errors: ParseError[] = [];
    value = parseJsonc(body, errors, { allowTrailingComma: true, disallowComments: false }) as unknown;
    if (errors.length > 0) throw new Error('E_CONFIG_INVALID');
  }
  if (!isRecord(value)) throw new Error('E_CONFIG_INVALID');
  return value;
}

/** Every container on the way to the entry must be an object, or absent: anything else is not ours to replace. */
function checkContainers(root: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (current === undefined) return undefined;
    if (!isRecord(current)) throw new Error('E_CONFIG_INVALID');
    current = current[key];
  }
  if (current === undefined) return undefined;
  if (!isRecord(current)) throw new Error('E_CONFIG_INVALID');
  return current[path[path.length - 1] ?? ''];
}

/** The indentation the file already uses: tabs, or the width of its first indented property; two spaces by default. */
export function detectFormatting(body: string): Formatting {
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const indented = /^([ \t]+)["}\]]/m.exec(body)?.[1];
  if (indented?.startsWith('\t')) return { insertSpaces: false, tabSize: 1, eol };
  return { insertSpaces: true, tabSize: indented && indented.length <= 8 ? indented.length : 2, eol };
}

/** The value at `path` in a JSON or JSONC text; undefined when absent. Throws E_CONFIG_INVALID on a broken file. */
export function readJsonEntry(text: string | undefined, path: readonly string[], format: 'json' | 'jsonc'): unknown {
  if (text === undefined) return undefined;
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  return checkContainers(parseJsonText(body, format), path);
}

/** A whole line after `offset` holds only blanks or a comment: an insertion may go after it. */
const LINE_REST = /^[ \t]*(?:\/\/[^\r\n]*|\/\*(?:(?!\*\/)[^\r\n])*\*\/[ \t]*)?$/;

/**
 * jsonc-parser computes the edit without formatting (it would otherwise reformat the neighbouring line too); the
 * inserted property is then laid out on its own lines with the file's own indentation and line endings.
 */
function insertionEdits(body: string, edit: Edit, path: readonly string[], options: Formatting): Edit[] {
  const match = /^(,?)("(?:[^"\\]|\\.)*"):\s*([\s\S]*)$/.exec(edit.content);
  if (edit.length !== 0 || !match) return [edit];
  const [, comma = '', rawKey = '""', rawValue = 'null'] = match;
  const key = JSON.parse(rawKey) as string;
  const depth = path.indexOf(key) + 1;
  if (depth === 0) return [edit];
  const unit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
  const indent = (level: number) => unit.repeat(Math.max(0, level));
  const pretty = JSON.stringify(JSON.parse(rawValue), null, unit)
    .split('\n')
    .join(`${options.eol}${indent(depth)}`);
  const property = `${options.eol}${indent(depth)}${JSON.stringify(key)}: ${pretty}`;
  const lineEnd = body.slice(edit.offset).search(/\r?\n/);
  const rest = lineEnd === -1 ? body.slice(edit.offset) : body.slice(edit.offset, edit.offset + lineEnd);
  if (comma === '') {
    // An empty container: `{}` gets the property and a closing line; `{\n}` already has one.
    const closing = /^[ \t]*\r?\n/.test(body.slice(edit.offset)) ? '' : `${options.eol}${indent(depth - 1)}`;
    return [{ offset: edit.offset, length: 0, content: `${property}${closing}` }];
  }
  // After the last property: the comma stays right after its value, the property goes after any comment on the line.
  // A JSONC trailing comma stays where it is, and the new property gets one too.
  if (lineEnd !== -1 && rest.trimStart().startsWith(',') && LINE_REST.test(rest.trimStart().slice(1)))
    return [{ offset: edit.offset + lineEnd, length: 0, content: `${property},` }];
  if (lineEnd !== -1 && LINE_REST.test(rest))
    return [
      { offset: edit.offset, length: 0, content: ',' },
      { offset: edit.offset + lineEnd, length: 0, content: property },
    ];
  return [{ offset: edit.offset, length: 0, content: `,${property}` }];
}

/** The offset of the first comma in `body` between two offsets, outside comments (only blanks and comments lie there). */
function commaBetween(body: string, from: number, to: number): number | undefined {
  let index = from;
  while (index < to) {
    const pair = body.slice(index, index + 2);
    if (pair === '//') {
      const end = body.indexOf('\n', index);
      index = end === -1 ? to : end;
    } else if (pair === '/*') {
      const end = body.indexOf('*/', index + 2);
      index = end === -1 ? to : end + 2;
    } else if (body.charAt(index) === ',') return index;
    else index += 1;
  }
  return undefined;
}

/**
 * Removes exactly our property: its own lines when it sits alone on them, its comma, or the comma before it when it
 * was the last one. Comments around it, and every other property, stay byte for byte.
 */
function removalEdits(body: string, path: readonly string[]): Edit[] | undefined {
  const value = findNodeAtLocation(
    parseTree(body, [], { allowTrailingComma: true }) ?? { type: 'null', offset: 0, length: 0 },
    [...path],
  );
  const property = value?.parent;
  const container = property?.parent;
  if (!property || property.type !== 'property' || !container) return undefined;
  const siblings = container.children ?? [];
  const index = siblings.indexOf(property);
  const next = siblings[index + 1];
  const previous = siblings[index - 1];
  const start = property.offset;
  let end = property.offset + property.length;
  const comma = commaBetween(body, end, next ? next.offset : container.offset + container.length - 1);
  if (comma !== undefined) end = comma + 1;
  const edits: Edit[] = [];
  if (comma === undefined && previous) {
    const before = commaBetween(body, previous.offset + previous.length, start);
    if (before !== undefined) edits.push({ offset: before, length: 1, content: '' });
  }
  const lineStart = body.lastIndexOf('\n', start - 1) + 1;
  const after = /^[ \t]*\r?\n/.exec(body.slice(end))?.[0];
  if (/^[ \t]*$/.test(body.slice(lineStart, start)) && after !== undefined)
    edits.push({ offset: lineStart, length: end + after.length - lineStart, content: '' });
  else edits.push({ offset: start, length: end - start, content: '' });
  return edits;
}

/**
 * The text with `value` at `path` (removed when `value` is undefined), every other byte kept. A new file is created
 * with two-space indentation and a final newline.
 */
export function editJson(
  text: string | undefined,
  path: readonly string[],
  value: unknown,
  format: 'json' | 'jsonc',
): string {
  const bom = text?.startsWith(BOM) ? BOM : '';
  const original = text === undefined ? undefined : text.slice(bom.length);
  const empty = original === undefined || original.trim() === '';
  const body = empty ? '{}' : original;
  const current = checkContainers(parseJsonText(body, format), path);
  if (value === undefined && current === undefined) return text ?? '';
  const formattingOptions = detectFormatting(empty ? '' : body);
  const raw = modify(body, [...path], value, {});
  const edits =
    (value === undefined
      ? removalEdits(body, path)
      : raw.length === 1 && raw[0] && current === undefined
        ? insertionEdits(body, raw[0], path, formattingOptions)
        : undefined) ?? modify(body, [...path], value, { formattingOptions });
  let out = applyEdits(body, edits);
  if (empty) out = `${out}${formattingOptions.eol}`;
  // The whole result must be the original with only our entry changed, or nothing is written.
  const expected = withEntry(parseJsonText(body, format), path, value);
  if (JSON.stringify(parseJsonText(out, format)) !== JSON.stringify(expected)) throw new Error('E_CONFIG_EDIT');
  return `${bom}${out}`;
}

/** A copy of a parsed document with `value` at `path` (removed when undefined), containers created as needed. */
function withEntry(document: unknown, path: readonly string[], value: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(document ?? {})) as Record<string, unknown>;
  let current = copy;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (!isRecord(next)) {
      if (value === undefined) return copy;
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const last = path[path.length - 1] ?? '';
  if (value === undefined) Reflect.deleteProperty(current, last);
  else current[last] = value;
  return copy;
}

function yamlDocument(text: string | undefined): Document {
  const doc = parseDocument(text ?? '', { prettyErrors: false });
  if (doc.errors.length > 0) throw new Error('E_CONFIG_INVALID');
  const root = doc.contents;
  if (root !== null && !isMap(root) && !(isScalar(root) && root.value === null)) throw new Error('E_CONFIG_INVALID');
  return doc;
}

function plain(value: unknown): unknown {
  return isNode(value) ? value.toJSON() : value;
}

/** The value at `path` in a YAML text; undefined when absent. Throws E_CONFIG_INVALID on a broken file. */
export function readYamlEntry(text: string | undefined, path: readonly string[]): unknown {
  if (text === undefined) return undefined;
  const doc = yamlDocument(text);
  if (doc.contents === null || isScalar(doc.contents)) return undefined;
  for (let depth = 1; depth < path.length; depth += 1) {
    const container: unknown = doc.getIn(path.slice(0, depth), true);
    if (container === undefined || (isScalar(container) && container.value === null)) return undefined;
    if (!isMap(container)) throw new Error('E_CONFIG_INVALID');
  }
  const value = plain(doc.getIn(path, true));
  return value === null ? undefined : value;
}

/** Lines of `candidate` also found, in place, in `original`: used to keep the file's own list indentation. */
function keptLines(original: string, candidate: string): number {
  const lines = new Set(original.split('\n'));
  return candidate.split('\n').filter((line) => lines.has(line)).length;
}

/**
 * The YAML text with `value` at `path` (removed when undefined). Comments stay; the list indentation the file already
 * uses is kept (goose writes lists flush with their key), and long lines are never folded.
 */
export function editYaml(input: string | undefined, path: readonly string[], value: unknown): string {
  // A BOM and CRLF line endings are put back on the result: the library reads and writes LF without a BOM.
  const bom = input?.startsWith(BOM) ? BOM : '';
  const crlf = input?.includes('\r\n') ?? false;
  const text = input === undefined ? undefined : input.slice(bom.length).replace(/\r\n/g, '\n');
  const current = readYamlEntry(text, path);
  if (value === undefined && current === undefined) return input ?? '';
  const doc = yamlDocument(text);
  const before: unknown = doc.toJS();
  if (doc.contents === null || isScalar(doc.contents)) doc.contents = doc.createNode({});
  // An empty parent (`extensions:` with nothing under it) is a null scalar: replace it by a map.
  for (let depth = 1; depth < path.length; depth += 1) {
    const parent: unknown = doc.getIn(path.slice(0, depth), true);
    if (isScalar(parent) && parent.value === null) doc.setIn(path.slice(0, depth), doc.createNode({}));
  }
  if (value === undefined) doc.deleteIn(path);
  else doc.setIn(path, doc.createNode(value));
  // The file's own indentation width, and its list style (goose writes lists flush with their key).
  const width = /^( +)\S/m.exec(text ?? '')?.[1]?.length;
  const indent = width !== undefined && width >= 2 && width <= 8 ? width : 2;
  const render = (indentSeq: boolean) => doc.toString({ indent, indentSeq, lineWidth: 0, minContentWidth: 0 });
  const flush = render(false);
  const indented = render(true);
  const out =
    text === undefined || text.trim() === ''
      ? flush
      : keptLines(text, indented) >= keptLines(text, flush)
        ? indented
        : flush;
  // The whole result must be the original with only our entry changed, or nothing is written.
  const after: unknown = yamlDocument(out).toJS();
  if (JSON.stringify(after) !== JSON.stringify(withEntry(before ?? {}, path, value))) throw new Error('E_CONFIG_EDIT');
  return `${bom}${crlf ? out.replace(/\n/g, '\r\n') : out}`;
}
