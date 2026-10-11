import { parseArgs } from 'node:util';
import { describe, expect, it } from 'vitest';
import { dashedValues } from '../src/cli-args.ts';

const approver = { approver: { type: 'string', multiple: true }, config: { type: 'string' } } as const;

describe('a command line value that starts with a dash (init, publish, share, receipts)', () => {
  it('refuses it as written, the failure a node id in base64url meets', () => {
    expect(() => parseArgs({ args: ['--approver', '-x338HfTLe4_FGx'], options: approver })).toThrow(/ambiguous/);
  });

  it('takes it as the value of the option before it', () => {
    expect(dashedValues(['--approver', '-x338HfTLe4_FGx'])).toEqual(['--approver=-x338HfTLe4_FGx']);
  });

  it('leaves what comes out readable by parseArgs, id included', () => {
    const { values } = parseArgs({ args: dashedValues(['--approver', '-x338HfTLe4_FGx']), options: approver });
    expect(values.approver).toEqual(['-x338HfTLe4_FGx']);
  });

  it('keeps a path that begins with a dash, and the positional before it', () => {
    expect(dashedValues(['mcp.answer.figma', '--config', '-weird.json'])).toEqual([
      'mcp.answer.figma',
      '--config=-weird.json',
    ]);
  });

  it('keeps every value of a repeated option', () => {
    expect(dashedValues(['--approver', '-a', '--approver', '-b'])).toEqual(['--approver=-a', '--approver=-b']);
  });

  it('never swallows the next option: that is a missing value and stays an error', () => {
    const args = ['--approver', '--config', 'c.json'];
    expect(dashedValues(args)).toEqual(args);
    expect(() => parseArgs({ args: dashedValues(args), options: approver })).toThrow(/ambiguous/);
  });

  it('leaves an option already joined, a positional and an ordinary pair alone', () => {
    expect(dashedValues(['--approver=-a', 'cap', '--config', 'c.json'])).toEqual([
      '--approver=-a',
      'cap',
      '--config',
      'c.json',
    ]);
  });

  it('leaves a lone dash to parseArgs, which reads it as a value', () => {
    expect(dashedValues(['--config', '-'])).toEqual(['--config', '-']);
  });

  it('takes an empty line', () => {
    expect(dashedValues([])).toEqual([]);
  });
});
