const fs = require('fs');
const path = require('path');

const includeRegex = /^\s*#(?:include|imp)\s+"([^"]+)"\s*$/;
const packageRegex = /^\s*#imp\s+([A-Za-z0-9_:.+-]+)\s*$/;
const fromImportRegex = /^\s*from\s+([A-Za-z0-9_:.+-]+)\s+import\s+/;

function rewriteStdNamespaces(source) {
  return source
    .replace(/\blet\s+mut\s+/g, 'let ')
    .replace(/std::io::show\s*\(/g, 'show(')
    .replace(/std::io::read_line\s*\(/g, 'read_line(')
    .replace(/std::math::random\s*\(/g, 'random(')
    .replace(/std::random\s*\(/g, 'random(')
    .replace(/std::str::trim\s*\(/g, 'trim(')
    .replace(/std::str::to_lower\s*\(/g, 'to_lower(')
    .replace(/std::str::to_upper\s*\(/g, 'to_upper(')
    .replace(/([A-Za-z_][A-Za-z0-9_]*)\.strip\s*\(/g, 'strip($1, ')
    .replace(/([A-Za-z_][A-Za-z0-9_]*)\.isdigit\s*\(\s*\)/g, 'is_digit($1)')
    .replace(/,\s*end\s*=\s*"[^"]*"\s*\)/g, ')');
}

function rewriteConstructors(source) {
  const classNames = [...source.matchAll(/\bclass\s+([A-Z][A-Za-z0-9_]*)\b/g)].map((match) => match[1]);

  if (!classNames.length) {
    return source;
  }

  const pattern = new RegExp(`(?<!new\\s)(?<!class\\s)(?<!fn\\s)(?<!::)\\b(${classNames.join('|')})\\s*\\(`, 'g');
  return source.replace(pattern, 'new $1(');
}

function transformSyntax(source) {
  return rewriteConstructors(rewriteStdNamespaces(source));
}

function preprocessSource(source, filePath, state) {
  const ctx = state || {
    seen: new Set(),
    modules: new Set(),
    trace: [],
  };
  const resolved = filePath ? path.resolve(filePath) : null;

  if (resolved) {
    if (ctx.seen.has(resolved)) {
      return `// skipped circular include: ${resolved}`;
    }
    ctx.seen.add(resolved);
  }

  const baseDir = resolved ? path.dirname(resolved) : process.cwd();
  const out = [];

  for (const line of source.split(/\r?\n/)) {
    let match = line.match(includeRegex);
    if (match) {
      const target = path.resolve(baseDir, match[1]);
      ctx.trace.push(target);
      const child = fs.readFileSync(target, 'utf8');
      out.push(`// begin include ${match[1]}`);
      out.push(preprocessSource(child, target, ctx));
      out.push(`// end include ${match[1]}`);
      continue;
    }

    match = line.match(packageRegex);
    if (match) {
      ctx.modules.add(match[1]);
      out.push(`// using package ${match[1]}`);
      continue;
    }

    match = line.match(fromImportRegex);
    if (match) {
      ctx.modules.add(match[1]);
    }

    out.push(line);
  }

  return out.join('\n');
}

function preprocessFile(filePath) {
  const resolved = path.resolve(filePath);
  const state = {
    seen: new Set(),
    modules: new Set(),
    trace: [],
  };
  const code = transformSyntax(preprocessSource(fs.readFileSync(resolved, 'utf8'), resolved, state));

  return {
    file: resolved,
    code,
    modules: [...state.modules],
    trace: state.trace,
  };
}

module.exports = {
  preprocessFile,
  preprocessSource,
  transformSyntax,
};
