#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const pkg = require('../package.json');
const sdk = require('../sdk');

function printHelp() {
  console.log(`FelissScript SDK CLI ${pkg.version}

Usage:
  flss run <file.flss>      Run a FelissScript file
  flss check <file.flss>    Parse-check a FelissScript file
  flss build <file.flss>    Generate a runnable Node launcher
  flss tokens <file.flss>   Print lexer output as JSON
  flss ast <file.flss>      Print AST as JSON
  flss repl                 Start a simple multiline REPL
  flss init [name]          Create a starter FelissScript project
  flss version              Print CLI version
  flss help                 Show this help
`);
}

function printError(message) {
  console.error(`[flss] ${message}`);
}

function ensureArg(value, label) {
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function runCommand(file) {
  const result = sdk.runFile(file, {
    onOutput: (line) => console.log(line),
    onErrorOutput: (line) => console.error(line),
  });

  return result;
}

function checkCommand(file) {
  const checked = sdk.checkFile(file);
  console.log(`OK: ${checked.file}`);
  if (checked.modules.length) {
    console.log(`Modules: ${checked.modules.join(', ')}`);
  }
  if (checked.trace.length) {
    console.log(`Includes: ${checked.trace.join(', ')}`);
  }
}

function jsonCommand(kind, file) {
  if (kind === 'tokens') {
    const data = sdk.lexFile(file);
    console.log(JSON.stringify(data.tokens, null, 2));
    return;
  }

  const data = sdk.parseFile(file);
  console.log(JSON.stringify(data.ast, null, 2));
}

function buildCommand(file, outFile) {
  const built = sdk.transpileFileToRunner(file, outFile);
  console.log(`Built: ${built.outFile}`);
  if (built.modules.length) {
    console.log(`Modules: ${built.modules.join(', ')}`);
  }
}

function initCommand(name) {
  const target = name ? path.resolve(process.cwd(), name) : process.cwd();
  const srcDir = path.join(target, 'src');
  const mainFile = path.join(srcDir, 'main.flss');
  const tomlFile = path.join(target, 'flss.toml');

  fs.mkdirSync(srcDir, { recursive: true });

  if (!fs.existsSync(tomlFile)) {
    fs.writeFileSync(tomlFile, `[package]
name = "${name || path.basename(target)}"
version = "0.1.0"
edition = "2026"

[build]
target = "dev"
`, 'utf8');
  }

  if (!fs.existsSync(mainFile)) {
    fs.writeFileSync(mainFile, `show "Hello from FelissScript!"

fn add(a: int, b: int) {
    return a + b
}

show \`2 + 3 = \${add(2, 3)}\`
`, 'utf8');
  }

  console.log(`Created FelissScript project at ${target}`);
}

function replCommand() {
  const runtime = sdk.createRuntime({
    cwd: process.cwd(),
    onOutput: (line) => console.log(line),
    onErrorOutput: (line) => console.error(line),
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'flss> ',
  });

  let buffer = '';

  console.log('FelissScript REPL');
  console.log('Enter code, then submit an empty line to run it. Use .exit to quit.');
  rl.prompt();

  rl.on('line', (line) => {
    if (line.trim() === '.exit') {
      rl.close();
      return;
    }

    if (line.trim() === '' && buffer.trim()) {
      try {
        runtime.interp.run(buffer);
      } catch (error) {
        printError(error.message);
      }
      buffer = '';
      rl.setPrompt('flss> ');
      rl.prompt();
      return;
    }

    buffer += `${line}\n`;
    rl.setPrompt('... ');
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

function main() {
  const [, , command = 'help', ...rest] = process.argv;

  try {
    switch (command) {
      case 'run':
        runCommand(ensureArg(rest[0], 'file path'));
        return;
      case 'check':
        checkCommand(ensureArg(rest[0], 'file path'));
        return;
      case 'build':
        buildCommand(ensureArg(rest[0], 'file path'), rest[1]);
        return;
      case 'tokens':
      case 'ast':
        jsonCommand(command, ensureArg(rest[0], 'file path'));
        return;
      case 'init':
        initCommand(rest[0]);
        return;
      case 'repl':
        replCommand();
        return;
      case 'version':
      case '--version':
      case '-v':
        console.log(pkg.version);
        return;
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        return;
      default:
        throw new Error(`Unknown command '${command}'`);
    }
  } catch (error) {
    printError(error.message);
    process.exit(1);
  }
}

main();
