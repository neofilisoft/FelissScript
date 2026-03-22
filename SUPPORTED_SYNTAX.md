# FelissScript Runtime Support

This file is the truth for what the local SDK supports today.

## Works Now

- `.flss` files can run with `flss run file.flss`
- `let` and `const`
- `let mut` is accepted and normalized to `let`
- `fn`, `return`, `if`, `else`, `while`, `for`, `loop`, `break`, `continue`
- classes with `fn init(self, ...)`
- trait/interface/enum syntax from the core prototype
- `new ClassName(...)`
- constructor sugar `ClassName(...)` is rewritten to `new ClassName(...)`
- lists, dicts, indexing, list methods, dict methods
- template strings using backticks
- `Ok(...)`, `Err(...)`, `match`, `try/catch`, `throw`
- `#include "file.flss"` and `#imp "file.flss"` local preprocessing
- `#imp std::...` as stdlib/module markers
- `show(...)` and `show value`
- `read_line()`
- file helpers: `read_file`, `write_file`, `append_file`, `exists`, `ls`, `mkdir`, `rm`, `copy`, `move`, `stat`
- string helpers: `trim`, `to_lower`, `to_upper`, `strip`, `is_digit`
- JSON helpers: `parse`, `stringify`, `pretty`, `is_valid`
- `flss build file.flss [out.js]` creates a runnable Node launcher

## Compatibility Rewrites

The SDK intentionally rewrites a few higher-level FelissScript forms so code feels closer to the spec:

- `std::io::show(...)` -> `show(...)`
- `std::io::read_line()` -> `read_line()`
- `std::random()` / `std::math::random()` -> `random()`
- `std::str::trim(x)` -> `trim(x)`
- `std::str::to_lower(x)` -> `to_lower(x)`
- `word.strip("...")` -> `strip(word, "...")`
- `raw.isdigit()` -> `is_digit(raw)`

## Roadmap / Not Fully Real Yet

- native compiler / LLVM backend
- true package manager / registry
- real module namespace resolution
- full generics and trait bounds enforcement
- optional borrow checker / `@safe` enforcement
- destructuring loops like `for word, count in ...`
- expression `if` assignments
- named arguments like `show("x", end="")`
- async networking in `std::net`

## Recommendation

If you want code that runs today, prefer the patterns in `examples/` and this support file over the broader v1.0 spec document.
