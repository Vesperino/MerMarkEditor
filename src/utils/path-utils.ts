/**
 * Cross-platform path utilities for the renderer process.
 *
 * The Tauri backend returns absolute paths in their native form (forward
 * slashes on macOS/Linux, backslashes on Windows). These helpers do not try
 * to canonicalize the separator — they preserve the input style — they only
 * answer questions about path *structure*.
 */

/** Strip trailing slashes/backslashes (idempotent for empty input). */
export function trimTrailingSep(p: string): string {
  return p.replace(/[/\\]+$/, '');
}

/**
 * Last path segment. Equivalent to POSIX `basename` and Win32 path basename.
 * Empty input returns empty string. Trailing separators are tolerated.
 */
export function basenameOf(p: string): string {
  if (!p) return '';
  const trimmed = trimTrailingSep(p);
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/**
 * Parent directory. Returns empty string for paths without a parent
 * (single-segment paths).
 */
export function dirnameOf(p: string): string {
  if (!p) return '';
  const trimmed = trimTrailingSep(p);
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(0, idx) : '';
}

/**
 * Join path segments using the same separator as `parent` (default `/`).
 * Avoids double separators when `parent` already ends with one.
 */
export function joinPath(parent: string, child: string): string {
  if (!parent) return child;
  if (!child) return parent;
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  const left = trimTrailingSep(parent);
  const right = child.replace(/^[/\\]+/, '');
  return `${left}${sep}${right}`;
}

/**
 * Normalize separators to forward slashes. Used for cross-OS comparisons
 * (e.g. ancestor check) without mutating the displayed path.
 */
function toForwardSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * True when `ancestor` equals or is a prefix-folder of `descendant`.
 * Tolerates both separator styles. Trailing separators are ignored.
 *
 * Examples:
 *   isAncestor("/notes", "/notes/sub/x.md") -> true
 *   isAncestor("/notes", "/notes")           -> true
 *   isAncestor("/notes", "/notebook/x.md")   -> false  (boundary check)
 */
export function isAncestor(ancestor: string, descendant: string): boolean {
  if (!ancestor || !descendant) return false;
  const a = trimTrailingSep(toForwardSlash(ancestor));
  const d = trimTrailingSep(toForwardSlash(descendant));
  if (a === d) return true;
  return d.startsWith(a + '/');
}

/**
 * Split a path into its segments, preserving the leading root marker
 * for absolute paths.
 *
 *   "/a/b/c"        -> ["/", "a", "b", "c"]
 *   "C:\\a\\b"      -> ["C:", "a", "b"]
 *   "rel/path"      -> ["rel", "path"]
 */
export function pathSegments(p: string): string[] {
  if (!p) return [];
  const trimmed = trimTrailingSep(p);
  if (!trimmed) return [];
  // Windows drive letter prefix
  const winDriveMatch = /^([a-zA-Z]:)([/\\]?)(.*)$/.exec(trimmed);
  if (winDriveMatch) {
    const [, drive, , rest] = winDriveMatch;
    if (!rest) return [drive];
    return [drive, ...rest.split(/[/\\]+/).filter(Boolean)];
  }
  // POSIX absolute
  if (trimmed.startsWith('/')) {
    return ['/', ...trimmed.split('/').filter(Boolean)];
  }
  // Relative
  return trimmed.split(/[/\\]+/).filter(Boolean);
}

/**
 * Returns the chain of ancestor folder paths between (exclusive) `root`
 * and (inclusive) the parent of `target`. Used by tree views to figure
 * out which folders to expand so a target file becomes visible.
 *
 * Returns paths in OUTERMOST-first order — closest-to-root first.
 *
 *   ancestorsBetween("/a", "/a/b/c/file.md") -> ["/a/b", "/a/b/c"]
 *   ancestorsBetween("/a", "/a/file.md")     -> []   (parent equals root)
 *   ancestorsBetween("/x", "/y/file.md")     -> []   (target not in root)
 */
export function ancestorsBetween(root: string, target: string): string[] {
  if (!isAncestor(root, target)) return [];
  const rootTrimmed = trimTrailingSep(toForwardSlash(root));
  const targetParent = dirnameOf(toForwardSlash(target));
  if (!targetParent || rootTrimmed === targetParent) return [];
  const result: string[] = [];
  let cur = targetParent;
  while (cur && cur !== rootTrimmed) {
    result.unshift(cur);
    const nextParent = dirnameOf(cur);
    if (nextParent === cur) break;
    cur = nextParent;
  }
  return result;
}
