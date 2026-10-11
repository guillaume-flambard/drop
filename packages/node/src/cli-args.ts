/**
 * Joins a long option to a value that begins with a single dash, so that `parseArgs` reads it as a value.
 *
 * `parseArgs` reads `--approver -abc` as two options and refuses the line with ERR_PARSE_ARGS_INVALID_OPTION_VALUE,
 * while a node id is base64url and about one in thirty begins with a dash, as may a label or a path. Such a value is
 * written `--approver=-abc` instead, the form parseArgs accepts. An argument beginning with `--` is never taken for
 * a value: that is a missing value, which has to stay an error rather than a silently attached argument.
 */
export function dashedValues(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    const next = args[index + 1];
    if (arg.startsWith('--') && !arg.includes('=') && next !== undefined && /^-[^-]/.test(next)) {
      out.push(`${arg}=${next}`);
      index += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}
