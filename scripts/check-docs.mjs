#!/usr/bin/env node
// check-docs.mjs — docs quality gate for dsh-cc.github.io.
// Zero-dependency (node:fs / node:path only). Run: node scripts/check-docs.mjs
//
// Checks (per WRITING.md):
//   a. locale parity        — every site/**.md has a twin in site/zh/** and vice versa (hard)
//   b. frontmatter          — title+description in both twins; distilled-from for reference/* (hard)
//   c. code-block identity  — fenced code blocks byte-identical between twins (hard)
//   d. token fact-check     — every command/flag/env/package token appears in the
//                             upstream corpus or the allowlist (hard; skipped if $DSHCC_SRC missing)
//   e. freshness            — twin mtimes differing >14 days (warn only)
//
// Exit 1 on any hard fail. Summary: "check-docs: N errors, M warnings".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_ROOT = process.env.DOCS_ROOT
  ? path.resolve(REPO_ROOT, process.env.DOCS_ROOT)
  : path.join(REPO_ROOT, 'site');
const SRC_ROOT = process.env.DSHCC_SRC
  ? path.resolve(REPO_ROOT, process.env.DSHCC_SRC)
  : path.resolve(REPO_ROOT, '..', 'dsh-cc');
const ALLOWLIST_FILE = path.join(REPO_ROOT, 'scripts', 'check-docs-allowlist.txt');
const FRESHNESS_DAYS = 14;

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---------- helpers ----------

function walkMd(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(p));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

/** Parse YAML frontmatter (--- delimited) into a plain key->string map. */
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { fm: null, rest: text };
  const fm = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      currentKey = kv[1];
      fm[currentKey] = kv[2].trim().replace(/^["']|["']$/g, '');
    } else if (currentKey && /^\s+\S/.test(line)) {
      fm[currentKey] += ' ' + line.trim();
    }
  }
  return { fm, rest: text.slice(m[0].length) };
}

/** Split markdown body into fenced code blocks. Returns [{lang, lines}] */
function codeBlocks(text) {
  const blocks = [];
  let inFence = false;
  let lang = '';
  let lines = [];
  for (const line of text.split(/\r?\n/)) {
    const fence = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (fence && (!inFence || line.trim().startsWith(fence[2][0].repeat(3)))) {
      if (inFence) {
        blocks.push({ lang, lines });
        inFence = false;
        lines = [];
      } else {
        inFence = true;
        lang = line.trim().replace(/^[`~]+/, '').split(/\s+/)[0] || '';
      }
      continue;
    }
    if (inFence) lines.push(line);
  }
  if (inFence) blocks.push({ lang, lines });
  return blocks;
}

/** Inline-code spans (`...`) outside code fences. */
function inlineCode(text) {
  const blocks = codeBlocks(text);
  let rest = text;
  for (const b of blocks) rest = rest.replace(b.lines.join('\n'), '');
  const spans = [];
  const re = /`([^`\n]+)`/g;
  let m;
  while ((m = re.exec(rest))) spans.push(m[1]);
  return { rest, spans };
}

/** Strip HTML comments (tokens inside them are skipped per spec). */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function isPlaceholder(tok) {
  return /^<.*>$/.test(tok) || tok.includes('<') || tok.includes('>');
}

// ---------- load docs ----------

if (!fs.existsSync(DOCS_ROOT) || !fs.statSync(DOCS_ROOT).isDirectory()) {
  console.error(`check-docs: docs root not found: ${DOCS_ROOT}`);
  process.exit(1);
}

const allFiles = walkMd(DOCS_ROOT);
const relOf = (p) => path.relative(DOCS_ROOT, p).split(path.sep).join('/');
const enFiles = new Map(); // rel -> abs
const zhFiles = new Map();
for (const p of allFiles) {
  const rel = relOf(p);
  if (rel.startsWith('zh/')) zhFiles.set(rel.slice(3), p);
  else enFiles.set(rel, p);
}

const fileText = new Map();
for (const p of allFiles) fileText.set(p, fs.readFileSync(p, 'utf8'));

console.log('== check-docs ==');
console.log(`docs root: ${path.relative(REPO_ROOT, DOCS_ROOT) || '.'}`);
console.log(`files: ${enFiles.size} EN, ${zhFiles.size} ZH\n`);

// ---------- a. locale parity ----------

console.log('[a] locale parity');
{
  let bad = 0;
  for (const rel of enFiles.keys()) {
    if (!zhFiles.has(rel)) {
      err(`locale parity: missing ZH twin for site/${rel}`);
      bad++;
    }
  }
  for (const rel of zhFiles.keys()) {
    if (!enFiles.has(rel)) {
      err(`locale parity: missing EN twin for site/zh/${rel}`);
      bad++;
    }
  }
  console.log(bad === 0 ? '  OK — all twins present\n' : `  ${bad} missing twin(s)\n`);
}

// ---------- b. frontmatter ----------

console.log('[b] frontmatter');
{
  let bad = 0;
  const checkOne = (abs, label) => {
    const { fm } = parseFrontmatter(fileText.get(abs));
    if (!fm) {
      err(`frontmatter: ${label} has no frontmatter block`);
      bad++;
      return;
    }
    for (const key of ['title', 'description']) {
      if (!fm[key]) {
        err(`frontmatter: ${label} missing \`${key}\``);
        bad++;
      }
    }
    if (/^reference\//.test(label) && !/^dsh-cc v/.test(fm['distilled-from'] || '')) {
      err(`frontmatter: ${label} (reference/*) missing \`distilled-from: dsh-cc v...\``);
      bad++;
    }
  };
  for (const rel of new Set([...enFiles.keys(), ...zhFiles.keys()])) {
    if (enFiles.has(rel)) checkOne(enFiles.get(rel), rel);
    if (zhFiles.has(rel)) checkOne(zhFiles.get(rel), `zh/${rel}`);
  }
  console.log(bad === 0 ? '  OK — frontmatter complete\n' : `  ${bad} frontmatter problem(s)\n`);
}

// ---------- c. code-block identity ----------

console.log('[c] code-block identity');
{
  let bad = 0;
  for (const rel of enFiles.keys()) {
    if (!zhFiles.has(rel)) continue;
    const en = codeBlocks(fileText.get(enFiles.get(rel)));
    const zh = codeBlocks(fileText.get(zhFiles.get(rel)));
    if (en.length !== zh.length) {
      err(`code-blocks: ${rel}: EN has ${en.length} fenced block(s), ZH has ${zh.length}`);
      bad++;
      continue;
    }
    for (let i = 0; i < en.length; i++) {
      const a = en[i].lines.join('\n');
      const b = zh[i].lines.join('\n');
      if (a !== b) {
        const lineNo = (t) => {
          const idx = fileText.get(zhFiles.get(rel)).indexOf(t.split('\n')[0]);
          return idx >= 0 ? fileText.get(zhFiles.get(rel)).slice(0, idx).split('\n').length : 1;
        };
        err(`code-blocks: ${rel}: block #${i} (lang=${en[i].lang || '?'}) differs between EN and ZH (first differing ZH line ~${lineNo(b)})`);
        bad++;
      }
    }
  }
  console.log(bad === 0 ? '  OK — code blocks identical\n' : `  ${bad} mismatched pair(s)/block(s)\n`);
}

// ---------- d. token fact-check ----------

console.log('[d] token fact-check');
let skipFactCheck = false;
if (!fs.existsSync(SRC_ROOT)) {
  skipFactCheck = true;
  console.log(`  WARNING: upstream corpus not found at ${SRC_ROOT} (set DSHCC_SRC)`);
  console.log('  skipping token fact-check; exit status governed by checks a-c');
  warn(`token fact-check skipped: upstream corpus not found at ${SRC_ROOT}`);
} else {
  // Load allowlist.
  const allowlist = new Set();
  if (fs.existsSync(ALLOWLIST_FILE)) {
    for (const line of fs.readFileSync(ALLOWLIST_FILE, 'utf8').split(/\r?\n/)) {
      const t = line.split('#')[0].trim();
      if (t) allowlist.add(t);
    }
  }

  // Build corpus.
  const corpusParts = [];
  const addCorpusFile = (p) => {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) corpusParts.push(fs.readFileSync(p, 'utf8'));
  };
  const walk = (dir, exts, capExtOnly = false) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(p, exts, capExtOnly);
      } else if (exts.includes(path.extname(e.name))) {
        addCorpusFile(p);
      }
    }
  };
  addCorpusFile(path.join(SRC_ROOT, 'README.md'));
  addCorpusFile(path.join(SRC_ROOT, 'README.zh.md'));
  walk(path.join(SRC_ROOT, 'docs'), ['.md', '.yaml', '.yml']);
  walk(path.join(SRC_ROOT, 'packages'), ['.md']);
  const corpus = corpusParts.join('\n');
  console.log(`  corpus: ${corpusParts.length} file(s), ${corpus.length} chars`);

  const tokensByFile = new Map();
  const seenTokens = new Set();
  const addToken = (rel, tok) => {
    if (!tok || tok.length < 3 || isPlaceholder(tok)) return;
    const key = tok;
    if (!tokensByFile.has(key)) tokensByFile.set(key, new Set());
    tokensByFile.get(key).add(rel);
    seenTokens.add(key);
  };

  for (const [abs, text] of fileText) {
    const rel = relOf(abs);
    const cleaned = stripHtmlComments(text);
    const { rest, spans } = inlineCode(cleaned);
    const blocks = codeBlocks(rest);
    const blockText = blocks.map((b) => b.lines.join('\n')).join('\n');
    const shellText = blocks
      .flatMap((b) => b.lines)
      .filter((l) => /^\s*\$\s/.test(l))
      .join('\n');

    for (const s of spans) {
      // slash commands: /word inside backticks (allow flags after, e.g. `/plan --model x`).
      // A `/` directly attached to a path/component is not a command (e.g. `foo/bar`,
      // `.claude/agents/x.md`, `../apps/cli`).
      for (const m of s.matchAll(/(?<![\w@./-])\/([a-z][a-z0-9-]*)/g)) addToken(rel, '/' + m[1]);
      // long flags inside backticks
      for (const m of s.matchAll(/--[a-z][a-z-]+/g)) addToken(rel, m[0]);
      // env vars inside backticks
      for (const m of s.matchAll(/\b[A-Z][A-Z0-9_]{3,}\b/g)) addToken(rel, m[0]);
      // package names anywhere in inline code
      for (const m of s.matchAll(/@[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*/g)) addToken(rel, m[0]);
    }
    // long flags after `$ ` in code blocks
    for (const m of shellText.matchAll(/--[a-z][a-z-]+/g)) addToken(rel, m[0]);
    // env vars in code blocks
    for (const m of blockText.matchAll(/\b[A-Z][A-Z0-9_]{3,}\b/g)) addToken(rel, m[0]);
    // package names in code blocks
    for (const m of blockText.matchAll(/@[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*/g)) addToken(rel, m[0]);
  }

  const missing = [];
  for (const tok of [...seenTokens].sort()) {
    if (corpus.includes(tok) || allowlist.has(tok)) continue;
    missing.push([tok, [...tokensByFile.get(tok)].sort()]);
  }
  for (const [tok, files] of missing) {
    err(`fact-check: token \`${tok}\` not found in upstream corpus or allowlist (used in: ${files.map((f) => 'site/' + f).join(', ')})`);
  }
  console.log(
    missing.length === 0
      ? `  OK — ${seenTokens.size} token(s) all sourced or allowlisted\n`
      : `  ${missing.length} unsourced token(s)\n`
  );
}

// ---------- e. freshness ----------

console.log('[e] freshness (warn only)');
{
  let stale = 0;
  for (const rel of enFiles.keys()) {
    if (!zhFiles.has(rel)) continue;
    const enM = fs.statSync(enFiles.get(rel)).mtimeMs;
    const zhM = fs.statSync(zhFiles.get(rel)).mtimeMs;
    const diffDays = Math.abs(enM - zhM) / 86400000;
    if (diffDays > FRESHNESS_DAYS) {
      warn(`freshness: ${rel}: EN/ZH mtimes differ by ${Math.round(diffDays)} days (> ${FRESHNESS_DAYS})`);
      stale++;
    }
  }
  console.log(stale === 0 ? '  OK — twins fresh\n' : `  ${stale} stale pair(s)\n`);
}

// ---------- summary ----------

console.log('---');
for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
console.log(`check-docs: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length > 0 ? 1 : 0);
