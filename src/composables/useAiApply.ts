import { writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { applyPatch } from 'diff';
import type { ParsedOutput } from './useAiOutputParser';
import { useAiSnapshots } from './useAiSnapshots';

export interface ApplyContext {
  docPath: string;
  currentContent: string;
  selectionRange: { start: number; end: number } | null;
  sessionId: string | null;
  snapshotsKeep: number;
}

export interface ApplyResult {
  ok: boolean;
  newContent?: string;
  tmpPath?: string;
  reason?: string;
  fellBackToFullReplace?: boolean;
}

const TMP_SUFFIX = '.mermark-ai.tmp';

export function useAiApply() {
  const snapshots = useAiSnapshots();

  async function prepare(parsed: ParsedOutput, ctx: ApplyContext): Promise<ApplyResult> {
    if (parsed.kind === 'plain') {
      return { ok: false, reason: 'no-fence' };
    }
    let newContent: string;
    let fellBack = false;
    if (parsed.kind === 'replace') {
      if (ctx.selectionRange) {
        const { start, end } = ctx.selectionRange;
        newContent = ctx.currentContent.slice(0, start) + parsed.payload + ctx.currentContent.slice(end);
      } else {
        newContent = parsed.payload;
      }
    } else {
      // patch — must apply cleanly. The previous fallback that wrote the raw
      // patch text as the new content was a footgun (overwrote the doc with
      // diff syntax). Now we surface the failure so the panel can show an
      // error and the user can ask again.
      const applied = applyPatch(ctx.currentContent, parsed.payload);
      if (applied === false) {
        return { ok: false, reason: 'patch-context-mismatch' };
      }
      newContent = applied;
    }

    try {
      await snapshots.loadFor(ctx.docPath);
      await snapshots.create(ctx.currentContent, ctx.sessionId, ctx.snapshotsKeep);
    } catch (e) {
      return { ok: false, reason: `snapshot-failed: ${(e as Error).message}` };
    }

    const tmpPath = ctx.docPath + TMP_SUFFIX;
    try {
      await writeTextFile(tmpPath, newContent);
    } catch (e) {
      return { ok: false, reason: `tmp-write-failed: ${(e as Error).message}` };
    }

    return { ok: true, newContent, tmpPath, fellBackToFullReplace: fellBack };
  }

  async function commitTmp(tmpPath: string) {
    await remove(tmpPath);
  }

  async function discardTmp(tmpPath: string) {
    await remove(tmpPath);
  }

  return { prepare, commitTmp, discardTmp, TMP_SUFFIX };
}
