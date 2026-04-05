import { describe, it, expect } from 'vitest';
import type { Translations } from '../../i18n/index';
import en from '../../i18n/locales/en';
import pl from '../../i18n/locales/pl';
import zhCN from '../../i18n/locales/zh-CN';

const locales: Record<string, Translations> = { en, pl, 'zh-CN': zhCN };

function getStringKeys(obj: Translations): string[] {
  return Object.keys(obj).filter(key => typeof (obj as Record<string, unknown>)[key] === 'string');
}

function getFunctionKeys(obj: Translations): string[] {
  return Object.keys(obj).filter(key => typeof (obj as Record<string, unknown>)[key] === 'function');
}

describe('i18n translations', () => {
  it('all locales should have the same string keys as English', () => {
    const enKeys = getStringKeys(en).sort();
    for (const [name, locale] of Object.entries(locales)) {
      if (name === 'en') continue;
      const keys = getStringKeys(locale).sort();
      expect(keys, `${name} is missing or has extra string keys vs en`).toEqual(enKeys);
    }
  });

  it('all locales should have the same function keys as English', () => {
    const enKeys = getFunctionKeys(en).sort();
    for (const [name, locale] of Object.entries(locales)) {
      if (name === 'en') continue;
      const keys = getFunctionKeys(locale).sort();
      expect(keys, `${name} is missing or has extra function keys vs en`).toEqual(enKeys);
    }
  });

  it('no string values should be empty', () => {
    for (const [name, locale] of Object.entries(locales)) {
      for (const key of getStringKeys(locale)) {
        const value = (locale as Record<string, unknown>)[key] as string;
        expect(value.length, `${name}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('function translations should return strings', () => {
    for (const [name, locale] of Object.entries(locales)) {
      for (const key of getFunctionKeys(locale)) {
        const fn = (locale as Record<string, unknown>)[key] as (...args: unknown[]) => string;
        // Test with a sample argument
        const result = key === 'headingLevel' ? fn(1) : fn('test.md');
        expect(typeof result, `${name}.${key}() should return string`).toBe('string');
        expect(result.length, `${name}.${key}() returned empty string`).toBeGreaterThan(0);
      }
    }
  });

  it('zh-CN should have Chinese characters in most values', () => {
    const chineseRegex = /[\u4e00-\u9fff]/;
    const stringKeys = getStringKeys(zhCN);
    // Exclude keys that are reasonably the same across languages (single letters, names)
    const skipKeys = new Set(['appName', 'bold', 'italic', 'strikethrough', 'inlineCode', 'mermaid', 'exportPdf', 'printScale', 'diffView', 'mergeView']);
    const keysToCheck = stringKeys.filter(k => !skipKeys.has(k));
    const chineseCount = keysToCheck.filter(key => chineseRegex.test((zhCN as Record<string, unknown>)[key] as string)).length;
    const ratio = chineseCount / keysToCheck.length;
    expect(ratio, `Only ${(ratio * 100).toFixed(0)}% of zh-CN keys contain Chinese characters`).toBeGreaterThan(0.8);
  });
});
