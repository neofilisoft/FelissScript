#!/usr/bin/env python3
import argparse
import math
import os
import random as py_random
import re
import sys
from dataclasses import dataclass


KEYWORDS = {
    "let": "LET",
    "const": "CONST",
    "fn": "FN",
    "return": "RETURN",
    "if": "IF",
    "else": "ELSE",
    "for": "FOR",
    "while": "WHILE",
    "loop": "LOOP",
    "in": "IN",
    "show": "SHOW",
    "break": "BREAK",
    "continue": "CONTINUE",
    "class": "CLASS",
    "self": "SELF",
    "new": "NEW",
    "true": "BOOL",
    "false": "BOOL",
}


INCLUDE_RE = re.compile(r'^\s*#(?:include|imp)\s+"([^"]+)"\s*$')
PACKAGE_RE = re.compile(r"^\s*#imp\s+([A-Za-z0-9_:.+-]+)\s*$")


def transform_std_namespaces(source: str) -> str:
    return (
        source.replace("let mut ", "let ")
        .replace("std::io::show(", "show(")
        .replace("std::io::read_line(", "read_line(")
        .replace("std::math::random(", "random(")
        .replace("std::random(", "random(")
        .replace("std::str::trim(", "trim(")
        .replace("std::str::to_lower(", "to_lower(")
        .replace("std::str::to_upper(", "to_upper(")
    )


def transform_method_compat(source: str) -> str:
    source = re.sub(r"([A-Za-z_][A-Za-z0-9_]*)\.strip\s*\(", r"strip(\1, ", source)
    source = re.sub(r"([A-Za-z_][A-Za-z0-9_]*)\.isdigit\s*\(\s*\)", r"is_digit(\1)", source)
    source = re.sub(r',\s*end\s*=\s*"[^"]*"\s*\)', ")", source)
    return source


def transform_constructors(source: str) -> str:
    class_names = re.findall(r"\bclass\s+([A-Z][A-Za-z0-9_]*)\b", source)
    if not class_names:
        return source
    pattern = re.compile(rf"(?<!new\s)(?<!class\s)(?<!fn\s)(?<!::)\b({'|'.join(class_names)})\s*\(")
    return pattern.sub(r"new \1(", source)


def transform_source(source: str) -> str:
    return transform_constructors(transform_method_compat(transform_std_namespaces(source)))


def preprocess_source(source: str, file_path: str | None, seen: set[str] | None = None) -> tuple[str, list[str], list[str]]:
    seen = seen or set()
    modules: list[str] = []
    includes: list[str] = []
    if file_path:
        file_path = os.path.abspath(file_path)
        if file_path in seen:
            return f"// skipped circular include: {file_path}", modules, includes
        seen.add(file_path)
    base_dir = os.path.dirname(file_path) if file_path else os.getcwd()
    out: list[str] = []
    for line in source.splitlines():
        match = INCLUDE_RE.match(line)
        if match:
            target = os.path.abspath(os.path.join(base_dir, match.group(1)))
            includes.append(target)
            with open(target, "r", encoding="utf8") as handle:
                child_source, child_modules, child_includes = preprocess_source(handle.read(), target, seen)
            modules.extend(child_modules)
            includes.extend(child_includes)
            out.append(f"// begin include {match.group(1)}")
            out.append(child_source)
            out.append(f"// end include {match.group(1)}")
            continue
        match = PACKAGE_RE.match(line)
        if match:
            modules.append(match.group(1))
            out.append(f"// using package {match.group(1)}")
            continue
        out.append(line)
    return transform_source("\n".join(out)), modules, includes


@dataclass
class Token:
    kind: str
    value: object
    line: int


class Lexer:
    def __init__(self, source: str):
        self.source = source
        self.pos = 0
        self.line = 1

    def peek(self, offset: int = 0) -> str:
        idx = self.pos + offset
        if idx >= len(self.source):
            return ""
        return self.source[idx]

    def advance(self) -> str:
        char = self.peek()
        self.pos += 1
        if char == "\n":
            self.line += 1
        return char

    def skip_ws(self):
        while True:
            char = self.peek()
            if char in " \t\r":
                self.pos += 1
                continue
            if char == "/" and self.peek(1) == "/":
                while self.pos < len(self.source) and self.peek() != "\n":
                    self.pos += 1
                continue
            if char == "/" and self.peek(1) == "*":
                self.pos += 2
                while self.pos < len(self.source) and not (self.peek() == "*" and self.peek(1) == "/"):
                    self.advance()
                self.pos += 2
                continue
            break

    def number(self) -> Token:
        start = self.pos
        while self.peek().isdigit():
            self.pos += 1
        if self.peek() == "." and self.peek(1) != ".":
            self.pos += 1
            while self.peek().isdigit():
                self.pos += 1
        return Token("NUM", float(self.source[start:self.pos]), self.line)

    def string(self, quote: str) -> Token:
        self.pos += 1
        chars: list[str] = []
        while self.pos < len(self.source) and self.peek() != quote:
            if self.peek() == "\\":
                self.pos += 1
                esc = self.advance()
                chars.append({"n": "\n", "t": "\t", "r": "\r"}.get(esc, esc))
            else:
                chars.append(self.advance())
        self.pos += 1
        return Token("STR", "".join(chars), self.line)

    def template(self) -> Token:
        self.pos += 1
        chars: list[str] = []
        while self.pos < len(self.source) and self.peek() != "`":
            if self.peek() == "$" and self.peek(1) == "{":
                self.pos += 2
                depth = 1
                expr_chars: list[str] = []
                while self.pos < len(self.source) and depth > 0:
                    char = self.peek()
                    if char == "{":
                        depth += 1
                    elif char == "}":
                        depth -= 1
                        if depth == 0:
                            break
                    expr_chars.append(self.advance())
                self.pos += 1
                chars.append("\x01" + "".join(expr_chars) + "\x02")
            else:
                chars.append(self.advance())
        self.pos += 1
        return Token("TMPL", "".join(chars), self.line)

    def ident(self) -> Token:
        start = self.pos
        while re.match(r"[A-Za-z0-9_]", self.peek()):
            self.pos += 1
        word = self.source[start:self.pos]
        kind = KEYWORDS.get(word)
        if kind == "BOOL":
            return Token("BOOL", word == "true", self.line)
        if kind:
            return Token(kind, word, self.line)
        return Token("IDENT", word, self.line)

    def tokenize(self) -> list[Token]:
        tokens: list[Token] = []
        while self.pos < len(self.source):
            self.skip_ws()
            if self.pos >= len(self.source):
                break
            char = self.peek()
            line = self.line
            if char == "\n":
                self.pos += 1
                self.line += 1
                if tokens and tokens[-1].kind not in {"LB", "LS", "LP", "COMMA", "ARROW", "FATAR", "NL"}:
                    tokens.append(Token("NL", "\n", line))
                continue
            if char.isdigit():
                tokens.append(self.number())
                continue
            if char in {'"', "'"}:
                tokens.append(self.string(char))
                continue
            if char == "`":
                tokens.append(self.template())
                continue
            if re.match(r"[A-Za-z_]", char):
                tokens.append(self.ident())
                continue
            self.pos += 1
            nxt = self.peek()
            if char == "+":
                if nxt == "=":
                    self.pos += 1
                    tokens.append(Token("PEQ", "+=", line))
                else:
                    tokens.append(Token("PLUS", "+", line))
            elif char == "-":
                if nxt == ">":
                    self.pos += 1
                    tokens.append(Token("ARROW", "->", line))
                elif nxt == "=":
                    self.pos += 1
                    tokens.append(Token("MEQ", "-=", line))
                else:
                    tokens.append(Token("MINUS", "-", line))
            elif char == "*":
                if nxt == "=":
                    self.pos += 1
                    tokens.append(Token("SEQ", "*=", line))
                else:
                    tokens.append(Token("STAR", "*", line))
            elif char == "/":
                if nxt == "=":
                    self.pos += 1
                    tokens.append(Token("DEQ", "/=", line))
                else:
                    tokens.append(Token("SLASH", "/", line))
            elif char == "%":
                tokens.append(Token("PCT", "%", line))
            elif char == "=":
                if nxt == "=":
                    self.pos += 1
                    tokens.append(Token("EQEQ", "==", line))
                elif nxt == ">":
                    self.pos += 1
                    tokens.append(Token("FATAR", "=>", line))
                else:
                    tokens.append(Token("EQ", "=", line))
            elif char == "!":
                if nxt == "=":
                    self.pos += 1
                    tokens.append(Token("NEQ", "!=", line))
                else:
                    tokens.append(Token("NOT", "!", line))
            elif char == "<":
                if nxt == "=":
                    self.pos += 1
                    tokens.append(Token("LTE", "<=", line))
                else:
                    tokens.append(Token("LT", "<", line))
            elif char == ">":
                if nxt == "=":
                    self.pos += 1
                    tokens.append(Token("GTE", ">=", line))
                else:
                    tokens.append(Token("GT", ">", line))
            elif char == "&" and nxt == "&":
                self.pos += 1
                tokens.append(Token("AND", "&&", line))
            elif char == "|":
                if nxt == "|":
                    self.pos += 1
                    tokens.append(Token("OR", "||", line))
                else:
                    tokens.append(Token("PIPE", "|", line))
            elif char == ".":
                if nxt == ".":
                    self.pos += 1
                    tokens.append(Token("DOTDOT", "..", line))
                else:
                    tokens.append(Token("DOT", ".", line))
            elif char == ":":
                if nxt == ":":
                    self.pos += 1
                    tokens.append(Token("DCOLON", "::", line))
                else:
                    tokens.append(Token("COLON", ":", line))
            elif char == "(":
                tokens.append(Token("LP", "(", line))
            elif char == ")":
                tokens.append(Token("RP", ")", line))
            elif char == "{":
                tokens.append(Token("LB", "{", line))
            elif char == "}":
                tokens.append(Token("RB", "}", line))
            elif char == "[":
                tokens.append(Token("LS", "[", line))
            elif char == "]":
                tokens.append(Token("RS", "]", line))
            elif char == ",":
                tokens.append(Token("COMMA", ",", line))
            elif char == ";":
                tokens.append(Token("NL", ";", line))
            else:
                raise SyntaxError(f"Line {line}: unexpected character {char!r}")
        tokens.append(Token("EOF", "", self.line))
        return tokens


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = [token for token in tokens if token.kind != "NL"]
        self.pos = 0

    def peek(self, offset: int = 0) -> Token:
        idx = self.pos + offset
        if idx >= len(self.tokens):
            return self.tokens[-1]
        return self.tokens[idx]

    def move(self) -> Token:
        token = self.peek()
        self.pos += 1
        return token

    def is_(self, *kinds: str) -> bool:
        return self.peek().kind in kinds

    def eat(self, kind: str, label: str | None = None) -> Token:
        token = self.peek()
        if token.kind != kind:
            raise SyntaxError(f"Line {token.line}: expected {label or kind}, got {token.value or token.kind}")
        return self.move()

    def match(self, *kinds: str) -> Token | None:
        if self.peek().kind in kinds:
            return self.move()
        return None

    def eat_type_hint(self):
        if self.is_("COLON") and self.peek(1).kind == "IDENT":
            self.move()
            self.move()
            if self.is_("LT"):
                depth = 0
                while not self.is_("EOF"):
                    token = self.move()
                    if token.kind == "LT":
                        depth += 1
                    elif token.kind == "GT":
                        depth -= 1
                        if depth == 0:
                            break

    def parse(self):
        body = []
        while not self.is_("EOF"):
            body.append(self.statement())
        return {"type": "Prog", "body": body}

    def statement(self):
        token = self.peek()
        if token.kind in {"LET", "CONST"}:
            return self.var_decl()
        if token.kind == "FN":
            return self.fn_decl()
        if token.kind == "CLASS":
            return self.class_decl()
        if token.kind == "RETURN":
            self.move()
            value = None if self.is_("RB", "EOF") else self.expr()
            return {"type": "Return", "value": value}
        if token.kind == "IF":
            return self.if_stmt()
        if token.kind == "FOR":
            return self.for_stmt()
        if token.kind == "WHILE":
            return self.while_stmt()
        if token.kind == "LOOP":
            self.move()
            return {"type": "Loop", "body": self.block()}
        if token.kind == "SHOW":
            self.move()
            return {"type": "Show", "value": self.expr()}
        if token.kind == "BREAK":
            self.move()
            return {"type": "Break"}
        if token.kind == "CONTINUE":
            self.move()
            return {"type": "Continue"}
        if token.kind == "LB":
            return self.block()
        return self.assign_stmt()

    def var_decl(self):
        kind = "const" if self.move().kind == "CONST" else "let"
        name = self.eat("IDENT", "variable name").value
        self.eat_type_hint()
        self.eat("EQ", "=")
        return {"type": "VarDecl", "kind": kind, "name": name, "value": self.expr()}

    def fn_decl(self):
        self.eat("FN", "fn")
        name = self.eat("IDENT", "function name").value
        params = self.params()
        if self.match("ARROW") and self.peek().kind == "IDENT":
            self.move()
        body = self.block()
        return {"type": "FnDecl", "name": name, "params": params, "body": body}

    def params(self):
        self.eat("LP", "(")
        params = []
        while not self.is_("RP", "EOF"):
            if self.is_("SELF"):
                self.move()
                params.append("self")
            else:
                params.append(self.eat("IDENT", "param").value)
                self.eat_type_hint()
            if not self.match("COMMA"):
                break
        self.eat("RP", ")")
        return params

    def class_decl(self):
        self.eat("CLASS", "class")
        name = self.eat("IDENT", "class name").value
        self.eat("LB", "{")
        fields = []
        methods = []
        while not self.is_("RB", "EOF"):
            if self.is_("FN"):
                methods.append(self.fn_decl())
            else:
                field_name = self.eat("IDENT", "field").value
                self.eat_type_hint()
                default = None
                if self.match("EQ"):
                    default = self.expr()
                fields.append({"name": field_name, "default": default})
                self.match("COMMA")
        self.eat("RB", "}")
        return {"type": "ClassDecl", "name": name, "fields": fields, "methods": methods}

    def if_stmt(self):
        self.eat("IF", "if")
        cond = self.expr()
        then = self.block()
        else_block = None
        if self.match("ELSE"):
            else_block = self.if_stmt() if self.is_("IF") else self.block()
        return {"type": "If", "cond": cond, "then": then, "else": else_block}

    def for_stmt(self):
        self.eat("FOR", "for")
        name = self.eat("IDENT", "loop variable").value
        self.eat("IN", "in")
        return {"type": "For", "name": name, "iter": self.expr(), "body": self.block()}

    def while_stmt(self):
        self.eat("WHILE", "while")
        return {"type": "While", "cond": self.expr(), "body": self.block()}

    def block(self):
        self.eat("LB", "{")
        body = []
        while not self.is_("RB", "EOF"):
            body.append(self.statement())
        self.eat("RB", "}")
        return {"type": "Block", "body": body}

    def assign_stmt(self):
        expr = self.expr()
        op = self.peek()
        if op.kind in {"EQ", "PEQ", "MEQ", "SEQ", "DEQ"}:
            self.move()
            value = self.expr()
            if expr["type"] == "Ident":
                return {"type": "Assign", "name": expr["name"], "op": op.value, "value": value}
            if expr["type"] == "Member":
                return {"type": "MemberAssign", "obj": expr["obj"], "prop": expr["prop"], "op": op.value, "value": value}
            if expr["type"] == "Index":
                return {"type": "IndexAssign", "obj": expr["obj"], "idx": expr["idx"], "op": op.value, "value": value}
            raise SyntaxError(f"Line {op.line}: invalid assignment target")
        return {"type": "ExprStmt", "expr": expr}

    def expr(self):
        return self.range_expr()

    def range_expr(self):
        left = self.or_expr()
        if self.match("DOTDOT"):
            right = self.or_expr()
            return {"type": "Range", "left": left, "right": right}
        return left

    def or_expr(self):
        left = self.and_expr()
        while self.match("OR"):
            left = {"type": "Bin", "op": "||", "left": left, "right": self.and_expr()}
        return left

    def and_expr(self):
        left = self.eq_expr()
        while self.match("AND"):
            left = {"type": "Bin", "op": "&&", "left": left, "right": self.eq_expr()}
        return left

    def eq_expr(self):
        left = self.cmp_expr()
        while self.peek().kind in {"EQEQ", "NEQ"}:
            op = self.move().value
            left = {"type": "Bin", "op": op, "left": left, "right": self.cmp_expr()}
        return left

    def cmp_expr(self):
        left = self.add_expr()
        while self.peek().kind in {"LT", "GT", "LTE", "GTE"}:
            op = self.move().value
            left = {"type": "Bin", "op": op, "left": left, "right": self.add_expr()}
        return left

    def add_expr(self):
        left = self.mul_expr()
        while self.peek().kind in {"PLUS", "MINUS"}:
            op = self.move().value
            left = {"type": "Bin", "op": op, "left": left, "right": self.mul_expr()}
        return left

    def mul_expr(self):
        left = self.unary()
        while self.peek().kind in {"STAR", "SLASH", "PCT"}:
            op = self.move().value
            left = {"type": "Bin", "op": op, "left": left, "right": self.unary()}
        return left

    def unary(self):
        if self.match("MINUS"):
            return {"type": "Unary", "op": "-", "expr": self.unary()}
        if self.match("NOT"):
            return {"type": "Unary", "op": "!", "expr": self.unary()}
        return self.postfix()

    def postfix(self):
        expr = self.primary()
        while True:
            if self.match("DOT"):
                prop = self.eat("IDENT", "property").value
                if self.is_("LP"):
                    expr = {"type": "MethodCall", "obj": expr, "method": prop, "args": self.args()}
                else:
                    expr = {"type": "Member", "obj": expr, "prop": prop}
            elif self.is_("LS"):
                self.move()
                idx = self.expr()
                self.eat("RS", "]")
                expr = {"type": "Index", "obj": expr, "idx": idx}
            elif self.is_("LP"):
                expr = {"type": "Call", "fn": expr, "args": self.args()}
            else:
                break
        return expr

    def args(self):
        self.eat("LP", "(")
        args = []
        while not self.is_("RP", "EOF"):
            args.append(self.expr())
            if not self.match("COMMA"):
                break
        self.eat("RP", ")")
        return args

    def primary(self):
        if self.is_("NEW"):
            self.move()
            cls = self.eat("IDENT", "class").value
            return {"type": "New", "cls": cls, "args": self.args()}
        if self.is_("SELF"):
            self.move()
            return {"type": "Ident", "name": "self"}
        token = self.move()
        if token.kind == "NUM":
            return {"type": "Num", "value": token.value}
        if token.kind == "STR":
            return {"type": "Str", "value": token.value}
        if token.kind == "TMPL":
            return {"type": "Tmpl", "value": token.value}
        if token.kind == "BOOL":
            return {"type": "Bool", "value": token.value}
        if token.kind == "IDENT":
            if self.is_("FATAR"):
                self.move()
                body = self.block() if self.is_("LB") else self.expr()
                return {"type": "Lambda", "params": [token.value], "body": body}
            return {"type": "Ident", "name": token.value}
        if token.kind == "LP":
            start = self.pos
            params = []
            ok = True
            while not self.is_("RP", "EOF"):
                if not self.is_("IDENT"):
                    ok = False
                    break
                params.append(self.move().value)
                self.eat_type_hint()
                if not self.match("COMMA"):
                    break
            if ok and self.is_("RP"):
                self.move()
                if self.is_("FATAR"):
                    self.move()
                    body = self.block() if self.is_("LB") else self.expr()
                    return {"type": "Lambda", "params": params, "body": body}
            self.pos = start
            inner = self.expr()
            self.eat("RP", ")")
            return inner
        if token.kind == "LS":
            items = []
            while not self.is_("RS", "EOF"):
                items.append(self.expr())
                if not self.match("COMMA"):
                    break
            self.eat("RS", "]")
            return {"type": "List", "items": items}
        if token.kind == "LB":
            entries = []
            while not self.is_("RB", "EOF"):
                if self.is_("IDENT", "STR", "NUM", "BOOL"):
                    key = str(self.move().value)
                else:
                    raise SyntaxError(f"Line {self.peek().line}: expected dict key")
                self.eat("COLON", ":")
                entries.append((key, self.expr()))
                if not self.match("COMMA"):
                    break
            self.eat("RB", "}")
            return {"type": "Dict", "entries": entries}
        raise SyntaxError(f"Line {token.line}: unexpected token {token.value or token.kind}")


class ReturnSignal(Exception):
    def __init__(self, value):
        self.value = value


class BreakSignal(Exception):
    pass


class ContinueSignal(Exception):
    pass


class Env:
    def __init__(self, parent=None):
        self.values = {}
        self.consts = set()
        self.parent = parent

    def define(self, name, value, is_const=False):
        self.values[name] = value
        if is_const:
            self.consts.add(name)

    def get(self, name):
        if name in self.values:
            return self.values[name]
        if self.parent:
            return self.parent.get(name)
        raise RuntimeError(f"Undefined: '{name}'")

    def set(self, name, value):
        if name in self.values:
            if name in self.consts:
                raise RuntimeError(f"Cannot reassign const '{name}'")
            self.values[name] = value
            return
        if self.parent:
            self.parent.set(name, value)
            return
        raise RuntimeError(f"Undefined: '{name}'")


class FLSFunction:
    def __init__(self, name, params, body, closure):
        self.name = name
        self.params = params
        self.body = body
        self.closure = closure


class FLSClass:
    def __init__(self, name, fields, methods):
        self.name = name
        self.fields = fields
        self.methods = methods


class FLSInstance:
    def __init__(self, cls, fields):
        self.cls = cls
        self.fields = fields


class RangeValue:
    def __init__(self, start, end):
        self.start = start
        self.end = end


class Interpreter:
    def __init__(self, stdout=None):
        self.stdout = stdout or (lambda line: print(line))
        self.global_env = Env()
        self.setup_builtins()

    def setup_builtins(self):
        def bi(name, fn):
            self.global_env.define(name, {"builtin": True, "call": fn}, is_const=True)

        bi("show", lambda args: self._show(args))
        bi("print", lambda args: self._show(args))
        bi("read_line", lambda args: sys.stdin.readline().rstrip("\r\n"))
        bi("random", lambda args: py_random.random())
        bi("int", lambda args: int(float(args[0])))
        bi("float", lambda args: float(args[0]))
        bi("str", lambda args: self.format_value(args[0]))
        bi("bool", lambda args: bool(args[0]))
        bi("len", lambda args: len(args[0]))
        bi("sqrt", lambda args: math.sqrt(args[0]))
        bi("abs", lambda args: abs(args[0]))
        bi("floor", lambda args: math.floor(args[0]))
        bi("ceil", lambda args: math.ceil(args[0]))
        bi("round", lambda args: round(args[0]))
        bi("max", lambda args: max(args))
        bi("min", lambda args: min(args))
        bi("trim", lambda args: str(args[0]).strip())
        bi("to_lower", lambda args: str(args[0]).lower())
        bi("to_upper", lambda args: str(args[0]).upper())
        bi("strip", lambda args: str(args[0]).strip(str(args[1] if len(args) > 1 else " ")))
        bi("is_digit", lambda args: str(args[0]).isdigit())
        bi("read_file", lambda args: self._read_file(args[0]))
        bi("write_file", lambda args: self._write_file(args[0], args[1]))
        bi("append_file", lambda args: self._append_file(args[0], args[1]))
        bi("exists", lambda args: os.path.exists(args[0]))
        bi("ls", lambda args: sorted(os.listdir(args[0] if args else ".")))
        bi("mkdir", lambda args: self._mkdir(args[0]))
        bi("rm", lambda args: self._rm(args[0]))
        bi("copy", lambda args: self._copy(args[0], args[1]))
        bi("move", lambda args: self._move(args[0], args[1]))

    def _show(self, args):
        self.stdout(" ".join(self.format_value(arg) for arg in args))
        return None

    def _read_file(self, file_path):
        with open(file_path, "r", encoding="utf8") as handle:
            return handle.read()

    def _write_file(self, file_path, content):
        with open(file_path, "w", encoding="utf8") as handle:
            handle.write(str(content))
        return None

    def _append_file(self, file_path, content):
        with open(file_path, "a", encoding="utf8") as handle:
            handle.write(str(content))
        return None

    def _mkdir(self, dir_path):
        os.makedirs(dir_path, exist_ok=True)
        return None

    def _rm(self, target):
        if os.path.isdir(target):
            for root, dirs, files in os.walk(target, topdown=False):
                for file_name in files:
                    os.remove(os.path.join(root, file_name))
                for dir_name in dirs:
                    os.rmdir(os.path.join(root, dir_name))
            os.rmdir(target)
        elif os.path.exists(target):
            os.remove(target)
        return None

    def _copy(self, src, dst):
        import shutil

        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)
        return None

    def _move(self, src, dst):
        import shutil

        shutil.move(src, dst)
        return None

    def truthy(self, value):
        return value not in (None, False, 0, "")

    def format_value(self, value):
        if isinstance(value, FLSInstance):
            inner = ", ".join(f"{key}: {self.format_value(val)}" for key, val in value.fields.items())
            return f"{value.cls.name} {{ {inner} }}"
        if isinstance(value, list):
            return "[" + ", ".join(self.format_value(item) for item in value) + "]"
        if isinstance(value, dict):
            if "builtin" in value:
                return "<builtin>"
            return "{ " + ", ".join(f"{key}: {self.format_value(val)}" for key, val in value.items()) + " }"
        if isinstance(value, FLSFunction):
            return f"<fn {value.name}>"
        if value is True:
            return "true"
        if value is False:
            return "false"
        if value is None:
            return ""
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)

    def eval(self, node, env):
        if node is None:
            return None
        node_type = node["type"]
        if node_type in {"Prog", "Block"}:
            block_env = Env(env) if node_type == "Block" else env
            last = None
            for stmt in node["body"]:
                last = self.eval(stmt, block_env)
            return last
        if node_type == "VarDecl":
            value = self.eval(node["value"], env)
            env.define(node["name"], value, is_const=node["kind"] == "const")
            return value
        if node_type == "FnDecl":
            fn = FLSFunction(node["name"], node["params"], node["body"], env)
            env.define(node["name"], fn, is_const=True)
            return fn
        if node_type == "ClassDecl":
            methods = {method["name"]: FLSFunction(method["name"], method["params"], method["body"], env) for method in node["methods"]}
            cls = FLSClass(node["name"], node["fields"], methods)
            env.define(node["name"], cls, is_const=True)
            return cls
        if node_type == "Return":
            raise ReturnSignal(self.eval(node["value"], env) if node["value"] else None)
        if node_type == "Show":
            value = self.eval(node["value"], env)
            self.stdout(self.format_value(value))
            return value
        if node_type == "If":
            if self.truthy(self.eval(node["cond"], env)):
                return self.eval(node["then"], Env(env))
            if node["else"] is not None:
                return self.eval(node["else"], env)
            return None
        if node_type == "While":
            while self.truthy(self.eval(node["cond"], env)):
                try:
                    self.eval(node["body"], Env(env))
                except BreakSignal:
                    break
                except ContinueSignal:
                    continue
            return None
        if node_type == "Loop":
            while True:
                try:
                    self.eval(node["body"], Env(env))
                except BreakSignal:
                    break
                except ContinueSignal:
                    continue
            return None
        if node_type == "For":
            iterable = self.eval(node["iter"], env)
            if isinstance(iterable, RangeValue):
                items = list(range(int(iterable.start), int(iterable.end)))
            elif isinstance(iterable, list):
                items = iterable
            elif isinstance(iterable, str):
                items = list(iterable)
            elif isinstance(iterable, dict):
                items = [[key, value] for key, value in iterable.items()]
            else:
                raise RuntimeError("for..in needs iterable")
            for item in items:
                loop_env = Env(env)
                loop_env.define(node["name"], item)
                try:
                    self.eval(node["body"], loop_env)
                except BreakSignal:
                    break
                except ContinueSignal:
                    continue
            return None
        if node_type == "Break":
            raise BreakSignal()
        if node_type == "Continue":
            raise ContinueSignal()
        if node_type == "Assign":
            value = self.eval(node["value"], env)
            if node["op"] != "=":
                value = self.apply_assign_op(node["op"], env.get(node["name"]), value)
            env.set(node["name"], value)
            return value
        if node_type == "MemberAssign":
            obj = self.eval(node["obj"], env)
            value = self.eval(node["value"], env)
            if node["op"] != "=":
                value = self.apply_assign_op(node["op"], self.get_member(obj, node["prop"]), value)
            self.set_member(obj, node["prop"], value)
            return value
        if node_type == "IndexAssign":
            obj = self.eval(node["obj"], env)
            idx = self.eval(node["idx"], env)
            value = self.eval(node["value"], env)
            if node["op"] != "=":
                value = self.apply_assign_op(node["op"], obj[idx], value)
            obj[idx] = value
            return value
        if node_type == "ExprStmt":
            return self.eval(node["expr"], env)
        if node_type == "Bin":
            if node["op"] == "&&":
                left = self.eval(node["left"], env)
                return self.eval(node["right"], env) if self.truthy(left) else left
            if node["op"] == "||":
                left = self.eval(node["left"], env)
                return left if self.truthy(left) else self.eval(node["right"], env)
            left = self.eval(node["left"], env)
            right = self.eval(node["right"], env)
            if node["op"] == "+":
                return self.format_value(left) + self.format_value(right) if isinstance(left, str) or isinstance(right, str) else left + right
            if node["op"] == "-":
                return left - right
            if node["op"] == "*":
                return left * right
            if node["op"] == "/":
                if right == 0:
                    raise RuntimeError("Division by zero")
                return left / right
            if node["op"] == "%":
                return left % right
            if node["op"] == "==":
                return left == right
            if node["op"] == "!=":
                return left != right
            if node["op"] == "<":
                return left < right
            if node["op"] == ">":
                return left > right
            if node["op"] == "<=":
                return left <= right
            if node["op"] == ">=":
                return left >= right
            raise RuntimeError(f"Unknown operator {node['op']}")
        if node_type == "Unary":
            value = self.eval(node["expr"], env)
            return -value if node["op"] == "-" else (not self.truthy(value))
        if node_type == "Call":
            return self.call(self.eval(node["fn"], env), [self.eval(arg, env) for arg in node["args"]])
        if node_type == "MethodCall":
            return self.call_method(self.eval(node["obj"], env), node["method"], [self.eval(arg, env) for arg in node["args"]])
        if node_type == "Member":
            return self.get_member(self.eval(node["obj"], env), node["prop"])
        if node_type == "Index":
            obj = self.eval(node["obj"], env)
            idx = self.eval(node["idx"], env)
            if isinstance(obj, RangeValue):
                return obj.start + idx
            if isinstance(obj, (list, str)):
                return obj[idx]
            return obj.get(idx)
        if node_type == "Lambda":
            return FLSFunction("<lambda>", node["params"], node["body"], env)
        if node_type == "List":
            return [self.eval(item, env) for item in node["items"]]
        if node_type == "Dict":
            return {key: self.eval(value, env) for key, value in node["entries"]}
        if node_type == "Range":
            return RangeValue(self.eval(node["left"], env), self.eval(node["right"], env))
        if node_type == "New":
            cls = env.get(node["cls"])
            if not isinstance(cls, FLSClass):
                raise RuntimeError(f"'{node['cls']}' is not a class")
            fields = {}
            for field in cls.fields:
                fields[field["name"]] = self.eval(field["default"], env) if field["default"] is not None else 0
            inst = FLSInstance(cls, fields)
            if "init" in cls.methods:
                self.call(cls.methods["init"], [inst] + [self.eval(arg, env) for arg in node["args"]])
            return inst
        if node_type == "Tmpl":
            return self.render_template(node["value"], env)
        if node_type == "Ident":
            return env.get(node["name"])
        if node_type == "Num":
            return node["value"]
        if node_type == "Str":
            return node["value"]
        if node_type == "Bool":
            return node["value"]
        raise RuntimeError(f"Unknown node type: {node_type}")

    def apply_assign_op(self, op, current, value):
        if op == "+=":
            return self.format_value(current) + self.format_value(value) if isinstance(current, str) or isinstance(value, str) else current + value
        if op == "-=":
            return current - value
        if op == "*=":
            return current * value
        if op == "/=":
            return current / value
        raise RuntimeError(f"Unknown assignment operator {op}")

    def get_member(self, obj, prop):
        if isinstance(obj, FLSInstance):
            if prop in obj.fields:
                return obj.fields[prop]
            if prop in obj.cls.methods:
                return {"bound": obj, "function": obj.cls.methods[prop]}
            raise RuntimeError(f"'{obj.cls.name}' has no field '{prop}'")
        if isinstance(obj, list) and prop in {"len", "length"}:
            return len(obj)
        if isinstance(obj, str) and prop in {"len", "length"}:
            return len(obj)
        if isinstance(obj, dict):
            return obj.get(prop)
        raise RuntimeError(f"Cannot access .{prop}")

    def set_member(self, obj, prop, value):
        if isinstance(obj, FLSInstance):
            obj.fields[prop] = value
            return
        if isinstance(obj, dict):
            obj[prop] = value
            return
        raise RuntimeError(f"Cannot assign .{prop}")

    def call(self, callee, args):
        if isinstance(callee, dict) and callee.get("builtin"):
            return callee["call"](args)
        if isinstance(callee, dict) and "bound" in callee:
            return self.call(callee["function"], [callee["bound"]] + args)
        if isinstance(callee, FLSFunction):
            local_env = Env(callee.closure)
            for idx, name in enumerate(callee.params):
                local_env.define(name, args[idx] if idx < len(args) else None)
            try:
                return self.eval(callee.body, local_env)
            except ReturnSignal as signal:
                return signal.value
        raise RuntimeError(f"Not callable: {self.format_value(callee)}")

    def call_method(self, obj, method, args):
        if isinstance(obj, FLSInstance):
            if method not in obj.cls.methods:
                raise RuntimeError(f"'{obj.cls.name}' has no method '{method}'")
            return self.call(obj.cls.methods[method], [obj] + args)
        if isinstance(obj, list):
            if method == "push":
                obj.extend(args)
                return obj
            if method == "map":
                return [self.call(args[0], [item]) for item in obj]
            if method == "filter":
                return [item for item in obj if self.truthy(self.call(args[0], [item]))]
            if method in {"len", "length"}:
                return len(obj)
            if method == "sum":
                return sum(obj)
            if method == "entries":
                return [[str(index), value] for index, value in enumerate(obj)]
        if isinstance(obj, dict):
            if method == "entries":
                return [[key, value] for key, value in obj.items()]
            if method == "keys":
                return list(obj.keys())
            if method == "values":
                return list(obj.values())
            if method in {"has", "contains"}:
                return args[0] in obj
            if method == "get":
                return obj.get(args[0], args[1] if len(args) > 1 else None)
            if method in {"len", "length"}:
                return len(obj)
        if isinstance(obj, str):
            if method == "split":
                return obj.split(args[0] if args else "")
            if method == "trim":
                return obj.strip()
            if method == "lower":
                return obj.lower()
            if method == "upper":
                return obj.upper()
            if method in {"len", "length"}:
                return len(obj)
        raise RuntimeError(f"Method .{method}() not supported")

    def render_template(self, template: str, env):
        result = []
        idx = 0
        while idx < len(template):
            if template[idx] == "\x01":
                end = template.find("\x02", idx + 1)
                expr_source = template[idx + 1:end]
                expr = Parser(Lexer(transform_source(expr_source)).tokenize()).expr()
                result.append(self.format_value(self.eval(expr, env)))
                idx = end + 1
            else:
                result.append(template[idx])
                idx += 1
        return "".join(result)

    def run(self, source: str):
        program = Parser(Lexer(source).tokenize()).parse()
        return self.eval(program, self.global_env)


def parse_args():
    parser = argparse.ArgumentParser(prog="flss", description="Standalone FelissScript runtime")
    sub = parser.add_subparsers(dest="command")
    run_parser = sub.add_parser("run", help="Run a .flss file")
    run_parser.add_argument("file")
    check_parser = sub.add_parser("check", help="Parse-check a .flss file")
    check_parser.add_argument("file")
    repl_parser = sub.add_parser("repl", help="Start a simple REPL")
    repl_parser.set_defaults(command="repl")
    if len(sys.argv) == 2 and not sys.argv[1].startswith("-") and sys.argv[1] not in {"run", "check", "repl"}:
        return argparse.Namespace(command="run", file=sys.argv[1])
    return parser.parse_args()


def run_file(file_path: str):
    abs_path = os.path.abspath(file_path)
    with open(abs_path, "r", encoding="utf8") as handle:
        source = handle.read()
    prepared, _, _ = preprocess_source(source, abs_path)
    runtime = Interpreter()
    cwd = os.getcwd()
    os.chdir(os.path.dirname(abs_path) or cwd)
    try:
        runtime.run(prepared)
    finally:
        os.chdir(cwd)


def check_file(file_path: str):
    abs_path = os.path.abspath(file_path)
    with open(abs_path, "r", encoding="utf8") as handle:
        source = handle.read()
    prepared, modules, includes = preprocess_source(source, abs_path)
    Parser(Lexer(prepared).tokenize()).parse()
    print(f"OK: {abs_path}")
    if modules:
        print("Modules: " + ", ".join(modules))
    if includes:
        print("Includes: " + ", ".join(includes))


def repl():
    runtime = Interpreter()
    print("FelissScript standalone REPL")
    print("Enter code, submit an empty line to run, .exit to quit.")
    buffer: list[str] = []
    prompt = "flss> "
    while True:
        try:
            line = input(prompt)
        except EOFError:
            print()
            break
        if line.strip() == ".exit":
            break
        if line.strip() == "" and buffer:
            source = "\n".join(buffer)
            try:
                runtime.run(transform_source(source))
            except Exception as error:  # noqa: BLE001
                print(f"[flss] {error}", file=sys.stderr)
            buffer.clear()
            prompt = "flss> "
            continue
        buffer.append(line)
        prompt = "... "


def main():
    args = parse_args()
    try:
        if args.command == "run":
            run_file(args.file)
            return 0
        if args.command == "check":
            check_file(args.file)
            return 0
        if args.command == "repl":
            repl()
            return 0
        if args.file:
            run_file(args.file)
            return 0
        print("FelissScript standalone runtime")
        print("Usage: flss run <file.flss> | flss check <file.flss> | flss repl")
        return 0
    except Exception as error:  # noqa: BLE001
        print(f"[flss] {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
