const fs = require('fs');
const path = require('path');

function readLineSync() {
  const chunks = [];
  const buffer = Buffer.alloc(1);

  for (;;) {
    const bytes = fs.readSync(0, buffer, 0, 1, null);
    if (bytes === 0) {
      break;
    }
    if (buffer[0] === 10) {
      break;
    }
    if (buffer[0] !== 13) {
      chunks.push(Buffer.from(buffer.slice(0, 1)));
    }
  }

  return Buffer.concat(chunks).toString('utf8');
}

function installStdlib(interp, options = {}) {
  const cwd = options.cwd || process.cwd();
  const stderr = options.stderr || ((line) => console.error(line));

  function resolvePath(input = '.') {
    return path.resolve(cwd, String(input));
  }

  function define(name, handler) {
    interp.defineBuiltin(name, (args) => handler(args));
  }

  define('eprint', (args) => {
    stderr(args.map((value) => interp.fmt(value)).join(' '));
    return null;
  });

  define('read_file', ([file]) => fs.readFileSync(resolvePath(file), 'utf8'));
  define('read_line', () => readLineSync());
  define('write_file', ([file, content]) => {
    fs.writeFileSync(resolvePath(file), String(content ?? ''), 'utf8');
    return null;
  });
  define('append_file', ([file, content]) => {
    fs.appendFileSync(resolvePath(file), String(content ?? ''), 'utf8');
    return null;
  });

  define('read', ([file]) => fs.readFileSync(resolvePath(file), 'utf8'));
  define('write', ([file, content]) => {
    fs.writeFileSync(resolvePath(file), String(content ?? ''), 'utf8');
    return null;
  });
  define('append', ([file, content]) => {
    fs.appendFileSync(resolvePath(file), String(content ?? ''), 'utf8');
    return null;
  });

  define('exists', ([file]) => fs.existsSync(resolvePath(file)));
  define('mkdir', ([dir]) => {
    fs.mkdirSync(resolvePath(dir), { recursive: true });
    return null;
  });
  define('ls', ([dir = '.']) => fs.readdirSync(resolvePath(dir)).sort());
  define('rm', ([target]) => {
    fs.rmSync(resolvePath(target), { recursive: true, force: true });
    return null;
  });
  define('copy', ([from, to]) => {
    fs.cpSync(resolvePath(from), resolvePath(to), { recursive: true, force: true });
    return null;
  });
  define('move', ([from, to]) => {
    fs.renameSync(resolvePath(from), resolvePath(to));
    return null;
  });
  define('stat', ([target]) => {
    const stat = fs.statSync(resolvePath(target));
    return {
      size: stat.size,
      is_file: stat.isFile(),
      is_dir: stat.isDirectory(),
      mtime: stat.mtime.toISOString(),
    };
  });

  define('parse', ([text]) => JSON.parse(String(text)));
  define('stringify', ([value]) => JSON.stringify(value));
  define('pretty', ([value, spaces = 2]) => JSON.stringify(value, null, Number(spaces) || 2));
  define('trim', ([text]) => String(text ?? '').trim());
  define('to_lower', ([text]) => String(text ?? '').toLowerCase());
  define('to_upper', ([text]) => String(text ?? '').toUpperCase());
  define('strip', ([text, chars]) => {
    const source = String(text ?? '');
    const rawChars = chars === undefined ? ' ' : String(chars);
    const escaped = rawChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^[${escaped}]+|[${escaped}]+$`, 'g');
    return source.replace(pattern, '');
  });
  define('is_digit', ([text]) => /^[0-9]+$/.test(String(text ?? '')));
  define('is_valid', ([text]) => {
    try {
      JSON.parse(String(text));
      return true;
    } catch {
      return false;
    }
  });

  define('now', () => Date.now());
  define('parse_date', ([value]) => new Date(String(value)).getTime());
  define('format_date', ([value]) => new Date(value ?? Date.now()).toISOString());
  define('duration', ([start, end]) => Number(end ?? Date.now()) - Number(start ?? 0));
  define('since', ([start]) => Date.now() - Number(start ?? 0));
  define('sleep', ([ms = 0]) => {
    const sab = new SharedArrayBuffer(4);
    const view = new Int32Array(sab);
    Atomics.wait(view, 0, 0, Math.max(0, Number(ms) || 0));
    return null;
  });

  define('assert_eq', ([actual, expected, message]) => {
    if (actual !== expected) {
      throw new Error(message || `assert_eq failed: expected ${interp.fmt(expected)}, got ${interp.fmt(actual)}`);
    }
    return true;
  });

  define('assert_err', ([value, message]) => {
    const isErr = interp.fmt(value).startsWith('Err(');
    if (!isErr) {
      throw new Error(message || `assert_err failed: got ${interp.fmt(value)}`);
    }
    return true;
  });

  define('describe', ([name, fn]) => {
    if (options.onOutput) {
      options.onOutput(`[suite] ${String(name)}`);
    }
    return interp.callFn(fn, [], interp.G);
  });

  define('it', ([name, fn]) => {
    if (options.onOutput) {
      options.onOutput(`[test] ${String(name)}`);
    }
    return interp.callFn(fn, [], interp.G);
  });

  const netUnavailable = () => {
    throw new Error('std::net is not available in the synchronous local SDK yet');
  };

  define('get', netUnavailable);
  define('post', netUnavailable);
  define('put', netUnavailable);
  define('delete_http', netUnavailable);
  define('fetch', netUnavailable);

  return interp;
}

module.exports = {
  installStdlib,
};
