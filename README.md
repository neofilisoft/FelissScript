# FelissScript SDK

FelissScript SDK in this folder is built from the two source artifacts already here:

- `feliss_v1.0.html`
- `FelissScript_v1.0.docx`

The HTML file is treated as the current executable interpreter core. The DOCX acts as the higher-level language/spec roadmap. This SDK wraps the interpreter in a reusable Node CLI so `.flss` files can run outside the browser playground.

## What Was Added

- `sdk/` reusable runtime wrapper and standard library bridge
- `bin/flss.js` local CLI
- `flss.cmd` Windows launcher
- `standalone/flss_standalone.py` Python-only parser/interpreter
- `dist/flss/flss.exe` standalone Windows build
- `examples/` runnable `.flss` samples

## Quick Start

```powershell
.\flss.cmd run .\examples\hello.flss
.\flss.cmd check .\examples\hello.flss
.\flss.cmd build .\examples\hello.flss .\dist\hello.js
.\flss.cmd ast .\examples\hello.flss
.\flss.cmd repl

.\dist\flss\flss.exe run .\examples\hello.flss
.\dist\flss\flss.exe check .\sample.flss
```

You can also call the CLI directly with Node:

```powershell
node .\bin\flss.js run .\examples\hello.flss
```

## Supported SDK Features

- Run `.flss` files from disk
- Syntax check with `flss check`
- Build a runnable Node launcher with `flss build`
- Token dump / AST dump
- Multiline REPL
- Starter project generation with `flss init`
- Preprocessing for `#include "file.flss"` and `#imp "file.flss"`
- Local stdlib bridge for file system, JSON, time, and test helpers
- Compatibility rewrites for `std::io::show`, `std::random`, `let mut`, and constructor sugar
- Standalone Windows runtime build that does not depend on HTML or Node

## Current Runtime Notes

This SDK is intentionally honest about the implementation state:

- Current execution is still interpreter-first
- `#include` and local `#imp` are implemented by a preprocessing step
- `from std::module import ...` is accepted by the language core, and the SDK exposes stdlib helpers globally
- Native compilation, LLVM backend, borrow checker, package registry, and real async networking are still roadmap items from the spec

The current runtime truth table lives in [SUPPORTED_SYNTAX.md](/c:/Users/BEST/Desktop/flss/SUPPORTED_SYNTAX.md).

## Example Commands

```powershell
.\flss.cmd run .\examples\include_demo.flss
.\flss.cmd run .\sample.flss
.\flss.cmd init demo-app
```
