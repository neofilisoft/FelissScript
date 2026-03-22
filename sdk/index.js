const path = require('path');
const fs = require('fs');

const { loadCore, defaultHtmlPath } = require('./core-loader');
const { preprocessFile, preprocessSource, transformSyntax } = require('./preprocess');
const { installStdlib } = require('./stdlib');

function createRuntime(options = {}) {
  const core = loadCore(options.htmlPath || defaultHtmlPath());
  const outputs = [];
  const onOutput = options.onOutput || (() => {});
  const onErrorOutput = options.onErrorOutput || ((line) => console.error(line));
  const interp = new core.Interp((message) => {
    const text = String(message);
    outputs.push(text);
    onOutput(text);
  });

  installStdlib(interp, {
    cwd: options.cwd || process.cwd(),
    onOutput,
    stderr: onErrorOutput,
  });

  return {
    core,
    interp,
    outputs,
  };
}

function lexSource(source, options = {}) {
  const { Lexer } = loadCore(options.htmlPath || defaultHtmlPath());
  return new Lexer(transformSyntax(source)).tokenize();
}

function parseSource(source, options = {}) {
  const { Lexer, Parser } = loadCore(options.htmlPath || defaultHtmlPath());
  const normalized = transformSyntax(source);
  return new Parser(new Lexer(normalized).tokenize()).parse();
}

function runSource(source, options = {}) {
  const runtime = createRuntime(options);
  const normalized = transformSyntax(source);
  const result = runtime.interp.run(normalized);
  return {
    ...runtime,
    result,
    source: normalized,
  };
}

function lexFile(filePath, options = {}) {
  const prepared = preprocessFile(filePath);
  return {
    ...prepared,
    tokens: lexSource(prepared.code, options),
  };
}

function parseFile(filePath, options = {}) {
  const prepared = preprocessFile(filePath);
  return {
    ...prepared,
    ast: parseSource(prepared.code, options),
  };
}

function checkFile(filePath, options = {}) {
  const parsed = parseFile(filePath, options);
  return {
    file: parsed.file,
    modules: parsed.modules,
    trace: parsed.trace,
    ast: parsed.ast,
    code: parsed.code,
  };
}

function runFile(filePath, options = {}) {
  const prepared = preprocessFile(filePath);
  const runtime = createRuntime({
    ...options,
    cwd: path.dirname(prepared.file),
  });
  const result = runtime.interp.run(prepared.code);
  return {
    ...runtime,
    result,
    file: prepared.file,
    modules: prepared.modules,
    trace: prepared.trace,
    code: prepared.code,
  };
}

function transpileFileToRunner(filePath, outFile, options = {}) {
  const prepared = preprocessFile(filePath);
  const target = path.resolve(outFile || path.basename(prepared.file, '.flss') + '.js');
  const sdkPath = path.relative(path.dirname(target), path.resolve(__dirname, '..', 'sdk')).replace(/\\/g, '/');
  const js = `#!/usr/bin/env node
const sdk = require(${JSON.stringify(sdkPath)});

const source = ${JSON.stringify(prepared.code)};

try {
  sdk.runSource(source, {
    cwd: ${JSON.stringify(path.dirname(prepared.file))},
    onOutput: (line) => console.log(line),
    onErrorOutput: (line) => console.error(line),
  });
} catch (error) {
  console.error('[flss build-runner]', error.message);
  process.exit(1);
}
`;

  fs.writeFileSync(target, js, 'utf8');
  return {
    file: prepared.file,
    outFile: target,
    modules: prepared.modules,
    trace: prepared.trace,
  };
}

module.exports = {
  checkFile,
  createRuntime,
  defaultHtmlPath,
  lexFile,
  lexSource,
  loadCore,
  parseFile,
  parseSource,
  preprocessFile,
  preprocessSource,
  runFile,
  runSource,
  transformSyntax,
  transpileFileToRunner,
};
