const fs = require('fs');
const path = require('path');
const generatedCorePath = path.resolve(__dirname, 'core.generated.js');

const END_MARKER = "const ce=document.getElementById('ce')";
const cache = new Map();

function defaultHtmlPath() {
  return path.resolve(__dirname, '..', 'feliss_v1.0.html');
}

function extractCoreSource(html) {
  const start = html.indexOf('<script>');
  const end = html.indexOf(END_MARKER);

  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not locate the FelissScript interpreter core inside feliss_v1.0.html');
  }

  return html.slice(start + '<script>'.length, end);
}

function applyPatches(core) {
  const { Parser, Interp, T } = core;

  if (!Parser || Parser.__flssSdkPatched) {
    return core;
  }

  Parser.__flssSdkPatched = true;

  Parser.prototype.primary = function primaryPatched() {
    if (this.is(T.OK)) {
      this.mv();
      this.eat(T.LP, '(');
      const v = this.expr();
      this.eat(T.RP, ')');
      return { type: 'OkE', v };
    }
    if (this.is(T.ERR)) {
      this.mv();
      this.eat(T.LP, '(');
      const v = this.expr();
      this.eat(T.RP, ')');
      return { type: 'ErrE', v };
    }
    if (this.is(T.NEW)) {
      this.mv();
      const cls = this.eat(T.IDENT, 'class').v;
      const args = this.args();
      return { type: 'New', cls, args };
    }
    if (this.is(T.SELF)) {
      this.mv();
      return { type: 'Ident', n: 'self' };
    }

    const t = this.mv();

    if (t.type === T.NUM) return { type: 'Num', v: t.v };
    if (t.type === T.STR) return { type: 'Str', v: t.v };
    if (t.type === T.TMPL) return { type: 'Tmpl', v: t.v };
    if (t.type === T.BOOL) return { type: 'Bool', v: t.v };

    if (t.type === T.IDENT) {
      if (this.is(T.FATAR)) {
        this.mv();
        const b = this.is(T.LB) ? this.block() : this.expr();
        return { type: 'Lambda', ps: [t.v], b };
      }
      return { type: 'Ident', n: t.v };
    }

    if (t.type === T.LP) {
      const sp = this.p;
      const lps = [];
      let ok = true;
      while (!this.is(T.RP) && !this.is(T.EOF)) {
        if (!this.is(T.IDENT)) {
          ok = false;
          break;
        }
        lps.push(this.mv().v);
        this.eatTH();
        if (!this.mat(T.COMMA)) break;
      }
      if (ok && this.is(T.RP)) {
        this.mv();
        if (this.is(T.FATAR)) {
          this.mv();
          const b = this.is(T.LB) ? this.block() : this.expr();
          return { type: 'Lambda', ps: lps, b };
        }
      }
      this.p = sp;
      const e = this.expr();
      this.eat(T.RP, ')');
      return e;
    }

    if (t.type === T.LS) {
      const items = [];
      while (!this.is(T.RS) && !this.is(T.EOF)) {
        items.push(this.expr());
        if (!this.mat(T.COMMA)) break;
      }
      this.eat(T.RS, ']');
      return { type: 'List', items };
    }

    if (t.type === T.LB) {
      const es = [];
      while (!this.is(T.RB) && !this.is(T.EOF)) {
        let k;
        if (this.is(T.IDENT) || this.is(T.STR) || this.is(T.NUM) || this.is(T.BOOL)) {
          k = String(this.mv().v);
        } else {
          throw new Error(`Expected dict key at line ${this.pk().ln}`);
        }
        this.eat(T.COLON, ':');
        es.push({ k, v: this.expr() });
        if (!this.mat(T.COMMA)) break;
      }
      this.eat(T.RB, '}');
      return { type: 'Dict', es };
    }

    throw new Error(`Line ${t.ln}: Unexpected '${t.v || t.type}'`);
  };

  Interp.prototype.defineBuiltin = function defineBuiltin(name, fn) {
    this.G.def(name, { __b__: true, call: fn });
  };

  return core;
}

function loadCore(htmlPath = defaultHtmlPath()) {
  const resolved = path.resolve(htmlPath);
  const cacheKey = fs.existsSync(generatedCorePath) ? generatedCorePath : resolved;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const core = fs.existsSync(generatedCorePath)
    ? applyPatches(require(generatedCorePath))
    : (() => {
        const vm = require('vm');
        const html = fs.readFileSync(resolved, 'utf8');
        const coreSource = extractCoreSource(html);
        const script = `
${coreSource}
this.__flssExports = { T, KW, TYPES, Lexer, Parser, Interp, highlight };
`;

        const context = {
          console,
          require,
          module: { exports: {} },
          exports: {},
          setTimeout,
          clearTimeout,
        };
        context.global = context;
        context.globalThis = context;

        vm.createContext(context);
        vm.runInContext(script, context, { filename: resolved });
        return applyPatches(context.__flssExports || {});
      })();

  if (!core.Lexer || !core.Parser || !core.Interp) {
    throw new Error('FelissScript core did not export Lexer/Parser/Interp correctly');
  }

  cache.set(cacheKey, core);
  return core;
}

module.exports = {
  defaultHtmlPath,
  extractCoreSource,
  loadCore,
};
