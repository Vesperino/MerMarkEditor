import type { CliKind } from '../services/aiCommands';

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiEffortOption {
  id: string;
  label: string;
}

export const CLAUDE_MODELS: AiModelOption[] = [
  { id: 'claude-opus-4-5', label: 'Opus 4.5' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  { id: 'opus', label: 'Opus (latest)' },
  { id: 'sonnet', label: 'Sonnet (latest)' },
  { id: 'haiku', label: 'Haiku (latest)' },
];

export const CODEX_MODELS: AiModelOption[] = [
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  { id: 'o3', label: 'o3' },
  { id: 'o4-mini', label: 'o4 mini' },
];

export const CLAUDE_EFFORTS: AiEffortOption[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
];

export const CODEX_EFFORTS: AiEffortOption[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

export function modelsFor(cli: CliKind): AiModelOption[] {
  return cli === 'claude' ? CLAUDE_MODELS : CODEX_MODELS;
}

export function effortsFor(cli: CliKind): AiEffortOption[] {
  return cli === 'claude' ? CLAUDE_EFFORTS : CODEX_EFFORTS;
}
