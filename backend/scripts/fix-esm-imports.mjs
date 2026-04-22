import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.cwd(), 'dist');

const exts = new Set(['.js', '.mjs', '.cjs', '.json']);

function shouldRewrite(spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return false;
  const parsed = path.parse(spec);
  if (exts.has(parsed.ext)) return false;
  return true;
}

function resolveRelativeImport(baseFile, spec) {
  if (!shouldRewrite(spec)) return spec;

  const baseDir = path.dirname(baseFile);
  const candidateFile = path.resolve(baseDir, `${spec}.js`);
  if (fs.existsSync(candidateFile)) return `${spec}.js`;

  const candidateDir = path.resolve(baseDir, spec);
  if (fs.existsSync(candidateDir) && fs.statSync(candidateDir).isDirectory()) {
    return `${spec}/index.js`;
  }

  return `${spec}.js`;
}

function rewriteContent(content, filePath) {
  let updated = content;

  // import ... from '...'
  updated = updated.replace(
    /(import\s+[^'"]+?\s+from\s+)(['"])([^'"]+)\2/g,
    (m, pre, q, spec) => `${pre}${q}${resolveRelativeImport(filePath, spec)}${q}`
  );

  // import '...'
  updated = updated.replace(
    /(import\s+)(['"])([^'"]+)\2/g,
    (m, pre, q, spec) => `${pre}${q}${resolveRelativeImport(filePath, spec)}${q}`
  );

  // export ... from '...'
  updated = updated.replace(
    /(export\s+[^'"]+?\s+from\s+)(['"])([^'"]+)\2/g,
    (m, pre, q, spec) => `${pre}${q}${resolveRelativeImport(filePath, spec)}${q}`
  );

  // export * from '...'
  updated = updated.replace(
    /(export\s+\*\s+from\s+)(['"])([^'"]+)\2/g,
    (m, pre, q, spec) => `${pre}${q}${resolveRelativeImport(filePath, spec)}${q}`
  );

  // dynamic import('...')
  updated = updated.replace(
    /(import\(\s*)(['"])([^'"]+)\2(\s*\))/g,
    (m, pre, q, spec, post) => `${pre}${q}${resolveRelativeImport(filePath, spec)}${q}${post}`
  );

  return updated;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!full.endsWith('.js')) continue;
    const content = fs.readFileSync(full, 'utf8');
    const rewritten = rewriteContent(content, full);
    if (rewritten !== content) {
      fs.writeFileSync(full, rewritten);
    }
  }
}

if (fs.existsSync(distDir)) {
  walk(distDir);
}
