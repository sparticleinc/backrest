#!/usr/bin/env node
/**
 * ソースコードに中国語が混入していないかを検査する。次の 2 段で見る:
 *
 * 1. 簡体字: 日本語の漢字（完了・番号・場合など）と重なる字形は対象外とし、
 *    日本語として成立しない簡体字専用の字形だけを検出する（文字セットは simplified-chinese-chars.txt）。
 * 2. 中国語の語彙: 字形は日本語と同じでも中国語でしか使わない語（後端・端点・知識庫 など）を
 *    chinese-words.tsv の一覧で検出し、推奨する日本語を併せて示す。
 *
 * 使い方:
 *   node scripts/check-chinese-residue.mjs          # ステージ済みファイルのみ
 *   node scripts/check-chinese-residue.mjs --all    # 追跡対象の全ファイル（CI 用）
 *   node scripts/check-chinese-residue.mjs a.ts b.ts
 *
 * 意図的に中国語を残す行（言語名「简体中文」など）には
 * 同じ行に `cjk-allow` を書くと検査対象外になる。
 *
 * 終了コード: 0 = 検出なし、1 = 検出あり
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHARS_FILE = join(HERE, 'simplified-chinese-chars.txt');
const WORDS_FILE = join(HERE, 'chinese-words.tsv');
const ALLOW_MARKER = 'cjk-allow';
const MAX_REPORTED = 50;

// 文字セット・語彙一覧そのものと、このスクリプトは中国語を含んで当然なので除外する
const SELF_FILES = new Set([
  'scripts/check-chinese-residue.mjs',
  'scripts/simplified-chinese-chars.txt',
  'scripts/chinese-words.tsv',
]);
const BINARY_RE =
  /\.(png|jpe?g|gif|ico|webp|avif|svg|pdf|zip|gz|bcmap|woff2?|ttf|otf|eot|mp3|mp4|m4a|wav|glb|gltf|bin|wasm|lock|xlsx?|docx?|pptx?)$/i;

const residue = new Set([...readFileSync(CHARS_FILE, 'utf8')].filter((c) => c.trim()));
const words = new Map(
  readFileSync(WORDS_FILE, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.split('\t'))
);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);

const args = process.argv.slice(2);
const files = args.includes('--all')
  ? git('ls-files')
  : args.length > 0
  ? args
  : git('diff', '--cached', '--name-only', '--diff-filter=ACMR');

const hits = [];
for (const file of files) {
  if (SELF_FILES.has(file) || BINARY_RE.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  // 拡張子で判別できないバイナリ（NUL を含む）は対象外
  if (text.includes('\0')) continue;
  text.split('\n').forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    const found = [...new Set([...line].filter((c) => residue.has(c)))];
    if (found.length > 0) hits.push({ file, line: i + 1, found: `[${found.join('')}]`, text: line.trim() });
    for (const [word, suggestion] of words) {
      if (line.includes(word)) hits.push({ file, line: i + 1, found: `${word} → ${suggestion}`, text: line.trim() });
    }
  });
}

if (hits.length === 0) process.exit(0);

console.error(`\n❌ Chinese found in ${hits.length} place(s). Please rewrite them in Japanese.\n`);
for (const h of hits.slice(0, MAX_REPORTED)) {
  console.error(`  ${h.file}:${h.line}  ${h.found}  ${h.text.slice(0, 100)}`);
}
if (hits.length > MAX_REPORTED) console.error(`  ... and ${hits.length - MAX_REPORTED} more`);
console.error(`\nIf a line must keep Chinese on purpose, add "${ALLOW_MARKER}" on the same line.\n`);
process.exit(1);
