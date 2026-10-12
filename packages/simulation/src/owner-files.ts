import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from 'node:fs';

/**
 * Campaign files readable by their owner only (T4.26, CodeQL js/insecure-temporary-file). The campaign directory comes
 * from mkdtemp (0700) by default, but `--work-dir` may name any directory: plan, relay configuration, planted logs and
 * reports are created 0600 whatever the umask, and a file left by an earlier run is narrowed before it is written.
 * Windows keeps only the read-only bit; the profile's ACL protects the files there.
 *
 * A reused work directory may also hold entries someone else planted while it was open to them (T4.42): a link, or a
 * second hard link, named like a campaign file would make the bench truncate or chmod the file it points to. No write
 * follows one: the name must be a regular file of this user, with a single link, and the very file that was opened.
 */
const OWNER_ONLY = 0o600;
const OWNER_ONLY_DIR = 0o700;
// Windows has no O_NOFOLLOW (Node 24 fs, "File open constants"): the name is checked once the file is open instead.
const NO_FOLLOW = 'O_NOFOLLOW' in constants ? constants.O_NOFOLLOW : 0;
// No O_TRUNC: a file is emptied only after it passed the checks, never at open time.
const FLAGS = {
  w: constants.O_WRONLY | constants.O_CREAT | NO_FOLLOW,
  a: constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | NO_FOLLOW,
} as const;

/** The current user, where the system has one (not on Windows). */
const uid = (): number | undefined => (process.platform === 'win32' ? undefined : process.getuid?.());

function refused(code: 'E_SIM_FILE' | 'E_SIM_WORK_DIR', path: string, why: string, cause?: unknown): Error {
  return new Error(`${code} ${path} ${why}`, cause === undefined ? undefined : { cause });
}

/** What a name is, without following it; undefined when it cannot be told. */
function kindOf(path: string): 'link' | 'directory' | 'other' | undefined {
  try {
    const named = lstatSync(path);
    return named.isSymbolicLink() ? 'link' : named.isDirectory() ? 'directory' : 'other';
  } catch {
    return undefined;
  }
}

/** Opens `path` with `flags`, created 0600, and narrows it to 0600 if it existed; the caller closes the descriptor. */
export function openOwnerOnly(path: string, flags: 'w' | 'a'): number {
  let fd: number;
  try {
    // The mode is written out here, where static analysis reads it (CodeQL looks for a literal mode at the open call).
    fd = openSync(path, FLAGS[flags], 0o600);
  } catch (error) {
    // ELOOP: O_NOFOLLOW met a link (macOS, Linux). A directory under a file name fails with EISDIR, or with an access
    // error on some systems: the name itself says which.
    if ((error as NodeJS.ErrnoException).code === 'ELOOP')
      throw refused('E_SIM_FILE', path, 'is a link, not followed', error);
    if (kindOf(path) === 'directory') throw refused('E_SIM_FILE', path, 'is a directory', error);
    throw error;
  }
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile()) throw refused('E_SIM_FILE', path, 'is not a regular file');
    if (opened.nlink !== 1n) throw refused('E_SIM_FILE', path, 'has another hard link');
    const self = uid();
    if (self !== undefined && opened.uid !== BigInt(self)) throw refused('E_SIM_FILE', path, 'belongs to another user');
    const named = lstatSync(path, { bigint: true });
    if (named.isSymbolicLink() || named.dev !== opened.dev || named.ino !== opened.ino)
      throw refused('E_SIM_FILE', path, 'is a link, not followed');
    fchmodSync(fd, OWNER_ONLY);
    if (flags === 'w') ftruncateSync(fd, 0);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  return fd;
}

function writeWith(flags: 'w' | 'a', path: string, content: string): void {
  const fd = openOwnerOnly(path, flags);
  try {
    writeFileSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

/** Writes `content` to `path`, owner-only. */
export function writeOwnerOnly(path: string, content: string): void {
  writeWith('w', path, content);
}

/** Appends `content` to `path`, owner-only. */
export function appendOwnerOnly(path: string, content: string): void {
  writeWith('a', path, content);
}

/**
 * Creates `path` if needed and makes sure it is a real directory of this user, closed to others (0700), before the
 * bench writes into it (T4.42). A link, a file or another user's directory is refused with E_SIM_WORK_DIR; a directory
 * of this user left open to others by an earlier run is narrowed. Callers guard each level from the work directory
 * down, so that once a level is closed nobody else can plant anything below it.
 */
export function ownerOnlyDir(path: string): void {
  try {
    mkdirSync(path, { recursive: true, mode: OWNER_ONLY_DIR });
  } catch (error) {
    // A dangling link or a file under that name: the checks below say which.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  if (process.platform === 'win32') {
    // Windows cannot open a directory as a file; lstat sees links and junctions as links.
    const named = lstatSync(path);
    if (named.isSymbolicLink()) throw refused('E_SIM_WORK_DIR', path, 'is a link, not followed');
    if (!named.isDirectory()) throw refused('E_SIM_WORK_DIR', path, 'is not a directory');
    return;
  }
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | NO_FOLLOW);
  } catch (error) {
    // macOS answers ELOOP for a link, Linux ENOTDIR (O_DIRECTORY is checked first); either way it is refused.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP' || code === 'ENOTDIR')
      throw refused(
        'E_SIM_WORK_DIR',
        path,
        kindOf(path) === 'link' ? 'is a link, not followed' : 'is not a directory',
        error,
      );
    throw error;
  }
  try {
    const opened = fstatSync(fd);
    if (!opened.isDirectory()) throw refused('E_SIM_WORK_DIR', path, 'is not a directory');
    if (opened.uid !== uid()) throw refused('E_SIM_WORK_DIR', path, 'belongs to another user');
    fchmodSync(fd, OWNER_ONLY_DIR);
  } finally {
    closeSync(fd);
  }
}
