#!/usr/bin/env python3
"""Build an executable, source-verified JASS action AST for ORD 2.305C.

The preceding profile builders intentionally leave tooltip numbers as
non-authoritative mentions.  This pass parses the map script itself, keeps its
control flow and exact numeric expressions, and adds a semantic action layer
for damage, RNG, state writes, scheduling, actors, abilities, and orders.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter, defaultdict, deque
from copy import deepcopy
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "deliverables"
JASS_PATH = ROOT / "shared_map" / "extracted" / "war3map.j"
BASE_PATH = OUT / "ORD_2305C_all_upper_skill_profiles.json"
TARGET = OUT / "ORD_2305C_all_upper_skill_profiles_action_ast.json"
SCHEMA_OUT = OUT / "ORD_2305C_action_ast.schema.json"
AUDIT_OUT = OUT / "ORD_2305C_action_ast_audit.md"

# The user-unit skill module is a contiguous generated section in the verified
# 2.305C script. Calls outside it are map runtime primitives; following their
# generic callback registries would pull unrelated UI/login/game-mode programs
# into character skill closures.
SKILL_FUNCTION_LINE_MIN = 17965
SKILL_FUNCTION_LINE_MAX = 37860


Ast = dict[str, Any]


class ParseError(ValueError):
    pass


@dataclass(frozen=True)
class Token:
    kind: str
    value: str
    start: int
    end: int


NUMBER_RE = re.compile(
    r"(?:\$[0-9A-Fa-f]+|(?:\d+\.\d*|\.\d+|\d+)(?:[Ee][+-]?\d+)?)"
)
IDENT_RE = re.compile(r"[A-Za-z_]\w*")


def sha256_path(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tokenize_expression(text: str) -> list[Token]:
    result: list[Token] = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch.isspace():
            i += 1
            continue
        if ch == '"':
            start = i
            i += 1
            while i < len(text):
                if text[i] == '"':
                    # JASS strings in generated map scripts have no backslash
                    # escapes; doubled quotes are retained as a literal quote.
                    if i + 1 < len(text) and text[i + 1] == '"':
                        i += 2
                        continue
                    i += 1
                    break
                if text[i] == "\\" and i + 1 < len(text):
                    i += 2
                else:
                    i += 1
            else:
                raise ParseError(f"unterminated string at {start}: {text!r}")
            result.append(Token("string", text[start:i], start, i))
            continue
        number_match = NUMBER_RE.match(text, i)
        if number_match:
            result.append(Token("number", number_match.group(0), i, number_match.end()))
            i = number_match.end()
            continue
        ident_match = IDENT_RE.match(text, i)
        if ident_match:
            value = ident_match.group(0)
            kind = "operator" if value in {"and", "or", "not"} else "identifier"
            result.append(Token(kind, value, i, ident_match.end()))
            i = ident_match.end()
            continue
        two = text[i:i + 2]
        if two in {"<=", ">=", "==", "!="}:
            result.append(Token("operator", two, i, i + 2))
            i += 2
            continue
        if ch in "+-*/<>":
            result.append(Token("operator", ch, i, i + 1))
            i += 1
            continue
        if ch in "(),[]":
            result.append(Token("punct", ch, i, i + 1))
            i += 1
            continue
        raise ParseError(f"unexpected character {ch!r} at {i}: {text!r}")
    result.append(Token("eof", "", len(text), len(text)))
    return result


def literal_number(raw: str) -> Ast:
    if raw.startswith("$"):
        value = int(raw[1:], 16)
        node: Ast = {
            "node": "literal",
            "valueType": "integer",
            "encoding": "jass_hex_integer",
            "raw": raw,
            "value": value,
        }
        hex_part = raw[1:]
        if len(hex_part) == 8:
            try:
                decoded = bytes.fromhex(hex_part).decode("latin1")
            except (ValueError, UnicodeDecodeError):
                decoded = ""
            if decoded and all(32 <= ord(ch) <= 126 for ch in decoded):
                node["fourcc"] = decoded
        return node
    is_real = any(mark in raw for mark in (".", "E", "e"))
    if not is_real:
        return {"node": "literal", "valueType": "integer", "raw": raw, "value": int(raw)}
    try:
        decimal_value = Decimal(raw)
    except InvalidOperation as exc:
        raise ParseError(f"invalid number: {raw}") from exc
    value = float(decimal_value)
    if not math.isfinite(value):
        raise ParseError(f"non-finite number: {raw}")
    return {
        "node": "literal",
        "valueType": "real",
        "raw": raw,
        "value": value,
        "decimal": str(decimal_value),
    }


class ExpressionParser:
    PRECEDENCE = {
        "or": 1,
        "and": 2,
        "==": 3,
        "!=": 3,
        "<": 3,
        "<=": 3,
        ">": 3,
        ">=": 3,
        "+": 4,
        "-": 4,
        "*": 5,
        "/": 5,
    }

    def __init__(self, text: str):
        self.text = text.strip()
        self.tokens = tokenize_expression(self.text)
        self.pos = 0

    @property
    def current(self) -> Token:
        return self.tokens[self.pos]

    def consume(self, value: str | None = None) -> Token:
        token = self.current
        if value is not None and token.value != value:
            raise ParseError(f"expected {value!r}, got {token.value!r} in {self.text!r}")
        self.pos += 1
        return token

    def parse(self) -> Ast:
        if not self.text:
            raise ParseError("empty expression")
        result = self.parse_binary(0)
        if self.current.kind != "eof":
            raise ParseError(f"trailing token {self.current.value!r} in {self.text!r}")
        result["source"] = self.text
        return result

    def parse_binary(self, minimum_precedence: int) -> Ast:
        left = self.parse_prefix()
        while self.current.kind == "operator":
            operator = self.current.value
            precedence = self.PRECEDENCE.get(operator)
            if precedence is None or precedence < minimum_precedence:
                break
            self.consume()
            right = self.parse_binary(precedence + 1)
            left = {"node": "binary", "operator": operator, "left": left, "right": right}
        return left

    def parse_prefix(self) -> Ast:
        token = self.current
        if token.kind == "operator" and token.value in {"not", "+", "-"}:
            operator = self.consume().value
            return {"node": "unary", "operator": operator, "operand": self.parse_prefix()}
        if token.kind == "identifier" and token.value == "function":
            self.consume()
            name = self.consume().value
            return {"node": "function_ref", "function": name}
        if token.kind == "number":
            self.consume()
            return literal_number(token.value)
        if token.kind == "string":
            self.consume()
            raw = token.value
            value = raw[1:-1].replace('""', '"')
            return {"node": "literal", "valueType": "string", "raw": raw, "value": value}
        if token.value == "(":
            self.consume("(")
            nested = self.parse_binary(0)
            self.consume(")")
            return {"node": "group", "expression": nested}
        if token.kind != "identifier":
            raise ParseError(f"expected primary, got {token.value!r} in {self.text!r}")
        name = self.consume().value
        if name in {"true", "false"}:
            return {"node": "literal", "valueType": "boolean", "raw": name, "value": name == "true"}
        if name == "null":
            return {"node": "literal", "valueType": "null", "raw": name, "value": None}
        if self.current.value == "(":
            self.consume("(")
            arguments: list[Ast] = []
            if self.current.value != ")":
                while True:
                    arguments.append(self.parse_binary(0))
                    if self.current.value != ",":
                        break
                    self.consume(",")
            self.consume(")")
            return {"node": "call", "function": name, "arguments": arguments}
        if self.current.value == "[":
            self.consume("[")
            index = self.parse_binary(0)
            self.consume("]")
            return {"node": "array_ref", "array": name, "index": index}
        return {"node": "variable", "name": name}


def parse_expression(text: str, fallbacks: list[dict[str, Any]], context: str) -> Ast:
    try:
        return ExpressionParser(text).parse()
    except ParseError as exc:
        fallback = {"node": "raw_expression", "source": text.strip(), "parseError": str(exc)}
        fallbacks.append({"context": context, "source": text.strip(), "error": str(exc)})
        return fallback


def without_source(node: Ast) -> Ast:
    result = deepcopy(node)
    result.pop("source", None)
    return result


def unwrap_group(node: Ast) -> Ast:
    while node.get("node") == "group":
        node = node["expression"]
    return node


def constant_number(node: Ast) -> int | float | None:
    node = unwrap_group(node)
    if node.get("node") == "literal" and node.get("valueType") in {"integer", "real"}:
        return node["value"]
    if node.get("node") == "unary" and node.get("operator") in {"+", "-"}:
        value = constant_number(node["operand"])
        if value is not None:
            return value if node["operator"] == "+" else -value
    return None


def expression_key(node: Ast) -> str | None:
    node = unwrap_group(node)
    if node.get("node") == "variable":
        return node["name"]
    if node.get("node") == "array_ref":
        return f"{node['array']}[{json.dumps(without_source(node['index']), ensure_ascii=False, sort_keys=True)}]"
    return None


def walk_ast(node: Any) -> Iterator[Ast]:
    if isinstance(node, dict):
        if "node" in node:
            yield node
        for value in node.values():
            yield from walk_ast(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk_ast(value)


def function_refs(node: Any) -> set[str]:
    return {item["function"] for item in walk_ast(node) if item.get("node") == "function_ref"}


def called_functions(node: Any) -> set[str]:
    return {item["function"] for item in walk_ast(node) if item.get("node") == "call"}


def referenced_variables(node: Any) -> set[str]:
    result: set[str] = set()
    for item in walk_ast(node):
        if item.get("node") == "variable":
            result.add(item["name"])
        elif item.get("node") == "array_ref":
            result.add(item["array"])
    return result


def find_calls(node: Any, name: str | None = None) -> list[Ast]:
    return [
        item for item in walk_ast(node)
        if item.get("node") == "call" and (name is None or item.get("function") == name)
    ]


def symbol_name(node: Ast) -> str | None:
    node = unwrap_group(node)
    if node.get("node") == "variable":
        return node["name"]
    return None


def literal_symbol(node: Ast) -> str | None:
    node = unwrap_group(node)
    if node.get("node") == "variable":
        return node["name"]
    return None


FUNCTION_HEADER_RE = re.compile(
    r"^function\s+(?P<name>\w+)\s+takes\s+(?P<takes>.+?)\s+returns\s+(?P<returns>\w+)\s*$"
)


def parse_parameters(raw: str) -> list[dict[str, str]]:
    if raw == "nothing":
        return []
    result = []
    for part in raw.split(","):
        fields = part.strip().split()
        if len(fields) != 2:
            raise ParseError(f"invalid parameter declaration: {part!r}")
        result.append({"type": fields[0], "name": fields[1]})
    return result


def parse_jass_source(path: Path) -> tuple[list[str], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    functions: dict[str, dict[str, Any]] = {}
    first_function_line = next(
        index for index, line in enumerate(lines, start=1) if line.startswith("function ")
    )
    current: dict[str, Any] | None = None
    for line_number, line in enumerate(lines, start=1):
        header = FUNCTION_HEADER_RE.match(line)
        if header:
            if current is not None:
                raise ParseError(f"nested function at line {line_number}")
            current = {
                "name": header.group("name"),
                "parameters": parse_parameters(header.group("takes")),
                "returnType": header.group("returns"),
                "lineStart": line_number,
                "bodyLines": [],
            }
            continue
        if current is not None and line == "endfunction":
            current["lineEnd"] = line_number
            functions[current["name"]] = current
            current = None
            continue
        if current is not None:
            current["bodyLines"].append((line_number, line.strip()))
    if current is not None:
        raise ParseError(f"unterminated function {current['name']}")

    globals_out: list[dict[str, Any]] = []
    fallback_sink: list[dict[str, Any]] = []
    for line_number, raw_line in enumerate(lines[2:first_function_line - 1], start=3):
        line = raw_line.strip()
        if not line or line.startswith("//"):
            continue
        match = re.match(
            r"^(?:(constant)\s+)?(\w+)\s+(?:(array)\s+)?(\w+)(?:=(.+))?$",
            line,
        )
        if not match:
            globals_out.append({
                "name": f"unparsed_line_{line_number}",
                "line": line_number,
                "source": line,
                "parseStatus": "raw",
            })
            continue
        constant_mark, value_type, array_mark, name, initializer_raw = match.groups()
        item: dict[str, Any] = {
            "name": name,
            "type": value_type,
            "array": bool(array_mark),
            "constant": bool(constant_mark),
            "line": line_number,
            "source": line,
            "parseStatus": "parsed",
        }
        if initializer_raw is not None:
            item["initializer"] = parse_expression(
                initializer_raw, fallback_sink, f"global:{name}:{line_number}"
            )
        globals_out.append(item)
    if fallback_sink:
        # Global initializer syntax is part of the same expression grammar and
        # must parse before the artifact can claim exact source normalization.
        raise ParseError(f"global initializer parse failures: {fallback_sink[:5]}")
    return lines, functions, globals_out


def split_assignment(text: str) -> tuple[str, str]:
    depth = 0
    in_string = False
    for index, ch in enumerate(text):
        if ch == '"':
            in_string = not in_string
        elif not in_string:
            if ch in "([":
                depth += 1
            elif ch in ")]":
                depth -= 1
            elif ch == "=" and depth == 0:
                return text[:index].strip(), text[index + 1:].strip()
    raise ParseError(f"assignment without top-level '=': {text!r}")


def parse_lvalue(text: str, fallbacks: list[dict[str, Any]], context: str) -> Ast:
    node = parse_expression(text, fallbacks, context)
    if node.get("node") not in {"variable", "array_ref", "raw_expression"}:
        fallbacks.append({
            "context": context,
            "source": text,
            "error": f"invalid lvalue node {node.get('node')}",
        })
    return node


class StatementParser:
    def __init__(
        self,
        function_name: str,
        body_lines: Sequence[tuple[int, str]],
        expression_fallbacks: list[dict[str, Any]],
    ):
        self.function_name = function_name
        self.lines = list(body_lines)
        self.pos = 0
        self.fallbacks = expression_fallbacks

    def expr(self, raw: str, line: int, label: str) -> Ast:
        return parse_expression(raw, self.fallbacks, f"{self.function_name}:{line}:{label}")

    def parse(self) -> list[Ast]:
        body, stop = self.parse_block(set())
        if stop is not None or self.pos != len(self.lines):
            raise ParseError(f"unexpected block stop in {self.function_name}: {stop}")
        return body

    def parse_block(self, stops: set[str]) -> tuple[list[Ast], str | None]:
        result: list[Ast] = []
        while self.pos < len(self.lines):
            line_number, line = self.lines[self.pos]
            keyword = line.split(maxsplit=1)[0] if line else ""
            if line in stops or keyword in stops:
                return result, keyword if keyword in stops else line
            if line.startswith("if ") and line.endswith(" then"):
                result.append(self.parse_if())
                continue
            if line == "loop":
                result.append(self.parse_loop())
                continue
            self.pos += 1
            if line.startswith("local "):
                match = re.match(r"^local\s+(\w+)\s+(?:(array)\s+)?(\w+)(?:=(.+))?$", line)
                if not match:
                    raise ParseError(f"invalid local at {self.function_name}:{line_number}: {line}")
                value_type, array_mark, name, initializer_raw = match.groups()
                node: Ast = {
                    "node": "local_declaration",
                    "line": line_number,
                    "source": line,
                    "valueType": value_type,
                    "name": name,
                    "array": bool(array_mark),
                }
                if initializer_raw is not None:
                    node["initializer"] = self.expr(initializer_raw, line_number, "local_initializer")
                result.append(node)
            elif line.startswith("set "):
                left_raw, right_raw = split_assignment(line[4:])
                result.append({
                    "node": "assignment",
                    "line": line_number,
                    "source": line,
                    "target": parse_lvalue(
                        left_raw, self.fallbacks, f"{self.function_name}:{line_number}:assignment_target"
                    ),
                    "value": self.expr(right_raw, line_number, "assignment_value"),
                })
            elif line.startswith("call "):
                expression = self.expr(line[5:], line_number, "call")
                result.append({
                    "node": "call_statement",
                    "line": line_number,
                    "source": line,
                    "expression": expression,
                })
            elif line.startswith("exitwhen "):
                result.append({
                    "node": "exitwhen",
                    "line": line_number,
                    "source": line,
                    "condition": self.expr(line[9:], line_number, "exitwhen"),
                })
            elif line == "return":
                result.append({"node": "return", "line": line_number, "source": line})
            elif line.startswith("return "):
                result.append({
                    "node": "return",
                    "line": line_number,
                    "source": line,
                    "value": self.expr(line[7:], line_number, "return"),
                })
            elif not line or line.startswith("//"):
                continue
            else:
                raise ParseError(f"unrecognized statement at {self.function_name}:{line_number}: {line}")
        return result, None

    def parse_if(self) -> Ast:
        line_number, line = self.lines[self.pos]
        start = line_number
        first_condition = self.expr(line[3:-5], line_number, "if_condition")
        self.pos += 1
        branches: list[dict[str, Any]] = []
        body, stop = self.parse_block({"elseif", "else", "endif"})
        branches.append({"line": line_number, "condition": first_condition, "body": body})
        while stop == "elseif":
            branch_line, branch_source = self.lines[self.pos]
            condition = self.expr(branch_source[7:-5], branch_line, "elseif_condition")
            self.pos += 1
            body, stop = self.parse_block({"elseif", "else", "endif"})
            branches.append({"line": branch_line, "condition": condition, "body": body})
        else_body: list[Ast] | None = None
        if stop == "else":
            self.pos += 1
            else_body, stop = self.parse_block({"endif"})
        if stop != "endif":
            raise ParseError(f"unterminated if at {self.function_name}:{start}")
        end_line = self.lines[self.pos][0]
        self.pos += 1
        node: Ast = {
            "node": "if",
            "lineStart": start,
            "lineEnd": end_line,
            "source": line,
            "branches": branches,
        }
        if else_body is not None:
            node["elseBody"] = else_body
        return node

    def parse_loop(self) -> Ast:
        line_number, line = self.lines[self.pos]
        self.pos += 1
        body, stop = self.parse_block({"endloop"})
        if stop != "endloop":
            raise ParseError(f"unterminated loop at {self.function_name}:{line_number}")
        end_line = self.lines[self.pos][0]
        self.pos += 1
        return {
            "node": "loop",
            "lineStart": line_number,
            "lineEnd": end_line,
            "source": line,
            "body": body,
        }


def lvalue_base(node: Ast) -> str | None:
    node = unwrap_group(node)
    if node.get("node") == "variable":
        return node["name"]
    if node.get("node") == "array_ref":
        return node["array"]
    return None


def ast_equal(left: Ast, right: Ast) -> bool:
    return without_source(left) == without_source(right)


def assignment_update(target: Ast, value: Ast) -> dict[str, Any]:
    candidate = unwrap_group(value)
    if candidate.get("node") == "binary" and candidate.get("operator") in {"+", "-", "*", "/"}:
        if ast_equal(unwrap_group(target), unwrap_group(candidate["left"])):
            return {
                "mode": {
                    "+": "increment",
                    "-": "decrement",
                    "*": "multiply",
                    "/": "divide",
                }[candidate["operator"]],
                "operand": candidate["right"],
            }
    return {"mode": "replace"}


def random_gate(condition: Ast) -> dict[str, Any] | None:
    condition = unwrap_group(condition)
    if condition.get("node") != "binary" or condition.get("operator") not in {
        "<", "<=", ">", ">=", "==", "!="
    }:
        return None
    left = unwrap_group(condition["left"])
    right = unwrap_group(condition["right"])
    operator = condition["operator"]
    call_side: Ast | None = None
    threshold_side: Ast | None = None
    rng_functions = {"zL", "zM", "zK", "GetRandomInt", "GetRandomReal"}
    if left.get("node") == "call" and left.get("function") in rng_functions:
        call_side, threshold_side = left, right
    elif right.get("node") == "call" and right.get("function") in rng_functions:
        call_side, threshold_side = right, left
        operator = {"<": ">", "<=": ">=", ">": "<", ">=": "<=", "==": "==", "!=": "!="}[operator]
    if call_side is None or threshold_side is None:
        return None
    function = call_side["function"]
    gate: dict[str, Any] = {
        "kind": {
            "zL": "uniform_integer_inclusive",
            "zM": "uniform_real",
            "zK": "uniform_real_zero_to_one",
            "GetRandomInt": "uniform_integer_inclusive",
            "GetRandomReal": "uniform_real",
        }[function],
        "rngFunction": function,
        "operator": operator,
        "threshold": threshold_side,
        "verification": "verified_jass_helper_and_branch",
    }
    arguments = call_side.get("arguments", [])
    if function in {"zL", "zM", "GetRandomInt", "GetRandomReal"} and len(arguments) == 2:
        gate["minimum"] = arguments[0]
        gate["maximum"] = arguments[1]
    elif function == "zK":
        gate["minimum"] = literal_number("0.")
        gate["maximum"] = literal_number("1.")
    minimum = constant_number(gate.get("minimum", {}))
    maximum = constant_number(gate.get("maximum", {}))
    threshold = constant_number(threshold_side)
    if minimum is not None and maximum is not None and threshold is not None:
        probability: float | None = None
        if function in {"zL", "GetRandomInt"}:
            lo = int(min(minimum, maximum))
            hi = int(max(minimum, maximum))
            total = hi - lo + 1
            if operator == "<=":
                success = max(0, min(hi, math.floor(threshold)) - lo + 1)
            elif operator == "<":
                success = max(0, min(hi, math.ceil(threshold) - 1) - lo + 1)
            elif operator == ">=":
                success = max(0, hi - max(lo, math.ceil(threshold)) + 1)
            elif operator == ">":
                success = max(0, hi - max(lo, math.floor(threshold) + 1) + 1)
            elif operator == "==":
                success = 1 if float(threshold).is_integer() and lo <= int(threshold) <= hi else 0
            else:  # !=
                success = total - (
                    1 if float(threshold).is_integer() and lo <= int(threshold) <= hi else 0
                )
            probability = success / total if total > 0 else None
            gate["supportCount"] = total
            gate["successCount"] = success
        elif maximum != minimum:
            lo = float(min(minimum, maximum))
            hi = float(max(minimum, maximum))
            point = float(threshold)
            if operator in {"<", "<="}:
                probability = min(1.0, max(0.0, (point - lo) / (hi - lo)))
            elif operator in {">", ">="}:
                probability = min(1.0, max(0.0, (hi - point) / (hi - lo)))
            elif operator == "==":
                probability = 0.0
            elif operator == "!=":
                probability = 1.0
        if probability is not None:
            gate["probability"] = round(probability, 12)
            gate["probabilityPercent"] = round(probability * 100, 10)
    return gate


def random_gates_in_condition(
    condition: Ast,
    function_name: str,
    line: int,
) -> list[dict[str, Any]]:
    gates: list[dict[str, Any]] = []
    seen_call_sources: set[str] = set()
    for candidate in walk_ast(condition):
        gate = random_gate(candidate)
        if gate is None:
            continue
        rng_calls = [
            call for call in find_calls(candidate)
            if call.get("function") in {"zL", "zM", "zK", "GetRandomInt", "GetRandomReal"}
        ]
        rng_source = (rng_calls[0].get("source") if rng_calls else None) or json.dumps(
            without_source(candidate), ensure_ascii=False, sort_keys=True
        )
        if rng_source in seen_call_sources:
            continue
        seen_call_sources.add(rng_source)
        gate["rollId"] = f"rng.{function_name}.L{line}.R{len(gates) + 1}"
        gate["sourceLine"] = line
        gates.append(gate)
    return gates


def expr_dependencies(expression: Ast) -> list[dict[str, Any]]:
    mapping = {
        "GetHeroStatBJ": "hero_stat",
        "GetHeroStr": "hero_strength",
        "GetHeroAgi": "hero_agility",
        "GetHeroInt": "hero_intelligence",
        "GetUnitState": "unit_state",
        "GetUnitStateSwap": "unit_state",
        "GetWidgetLife": "current_life",
        "GetUnitAbilityLevel": "ability_level",
        "GetUnitAbilityLevelSwapped": "ability_level",
        "LoadInteger": "hashtable_integer",
        "LoadReal": "hashtable_real",
        "LoadBoolean": "hashtable_boolean",
        "GetRandomInt": "random_integer",
        "GetRandomReal": "random_real",
        "zL": "random_integer",
        "zM": "random_real",
        "zK": "random_real",
    }
    result: list[dict[str, Any]] = []
    seen = set()
    for call in find_calls(expression):
        if call["function"] not in mapping:
            continue
        key = json.dumps(without_source(call), ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        result.append({"kind": mapping[call["function"]], "expression": call})
    return result


def fixed_or_uniform_amount(base: Ast, low: Ast | None = None, high: Ast | None = None) -> dict[str, Any]:
    if low is None or high is None:
        return {
            "expression": base,
            "expectedExpression": base,
            "distribution": {"type": "deterministic"},
            "dependencies": expr_dependencies(base),
        }
    low_value = constant_number(low)
    high_value = constant_number(high)
    if low_value is not None and high_value is not None and low_value == high_value:
        expression: Ast = {
            "node": "binary",
            "operator": "*",
            "left": base,
            "right": low,
            "source": f"({base.get('source', '<expr>')})*({low.get('source', '<expr>')})",
        }
        distribution: dict[str, Any] = {"type": "deterministic_multiplier", "multiplier": low}
        expected_expression = expression
    else:
        uniform_call: Ast = {
            "node": "call",
            "function": "zM",
            "arguments": [low, high],
            "source": f"zM({low.get('source', '<expr>')},{high.get('source', '<expr>')})",
        }
        expression = {
            "node": "binary",
            "operator": "*",
            "left": base,
            "right": uniform_call,
            "source": f"({base.get('source', '<expr>')})*({uniform_call['source']})",
        }
        distribution = {
            "type": "uniform_real_multiplier",
            "minimum": low,
            "maximum": high,
            "rerollScope": "per_wrapper_invocation",
        }
        if low_value is not None and high_value is not None:
            distribution["expectedMultiplier"] = (float(low_value) + float(high_value)) / 2
        mean_expression: Ast = {
            "node": "binary",
            "operator": "/",
            "left": {
                "node": "binary",
                "operator": "+",
                "left": low,
                "right": high,
            },
            "right": literal_number("2."),
        }
        expected_expression = {
            "node": "binary",
            "operator": "*",
            "left": base,
            "right": mean_expression,
        }
    return {
        "expression": expression,
        "expectedExpression": expected_expression,
        "baseExpression": base,
        "distribution": distribution,
        "dependencies": expr_dependencies(expression),
    }


def semantic_for_call(call: Ast) -> dict[str, Any] | None:
    name = call.get("function")
    args: list[Ast] = call.get("arguments", [])
    if name == "BWE" and len(args) == 7:
        return {
            "kind": "damage",
            "targeting": "single_unit",
            "sourceUnit": args[0],
            "targetUnit": args[1],
            "amount": fixed_or_uniform_amount(args[2], args[3], args[4]),
            "attackType": args[5],
            "damageType": args[6],
            "nativeExpansion": "UnitDamageTarget(source,target,zM(low,high)*base,true,false,attackType,damageType,WEAPON_TYPE_WHOKNOWS)",
            "verification": "verified_jass_wrapper_BWE",
        }
    if name == "BWF" and len(args) == 9:
        return {
            "kind": "damage",
            "targeting": "point_area",
            "sourceUnit": args[0],
            "delaySeconds": args[1],
            "radius": args[2],
            "center": args[3],
            "amount": fixed_or_uniform_amount(args[4], args[5], args[6]),
            "attackType": args[7],
            "damageType": args[8],
            "nativeExpansion": "UnitDamagePointLoc(source,delay,radius,center,zM(low,high)*base,attackType,damageType)",
            "verification": "verified_jass_wrapper_BWF",
        }
    if name == "UnitDamageTarget" and len(args) >= 7:
        return {
            "kind": "damage",
            "targeting": "single_unit",
            "sourceUnit": args[0],
            "targetUnit": args[1],
            "amount": fixed_or_uniform_amount(args[2]),
            "attack": args[3],
            "ranged": args[4],
            "attackType": args[5],
            "damageType": args[6],
            "weaponType": args[7] if len(args) > 7 else None,
            "verification": "verified_jass_native_call",
        }
    if name in {"UnitDamagePointLoc", "UnitDamagePoint"} and len(args) >= 7:
        return {
            "kind": "damage",
            "targeting": "point_area",
            "sourceUnit": args[0],
            "delaySeconds": args[1],
            "radius": args[2],
            "center": args[3],
            "amount": fixed_or_uniform_amount(args[4]),
            "attackType": args[5],
            "damageType": args[6],
            "verification": "verified_jass_native_call",
        }
    if name in {"SetUnitState", "SetUnitStateSwap", "SetUnitStateBJ"} and len(args) >= 3:
        # SetUnitStateSwap/BJ reverse their first two arguments in common.j.
        if name == "SetUnitState":
            unit, state, value = args[0], args[1], args[2]
        else:
            state, unit, value = args[0], args[1], args[2]
        return {
            "kind": "unit_resource_set",
            "unit": unit,
            "resource": state,
            "value": value,
            "dependencies": expr_dependencies(value),
            "verification": "verified_jass_call",
        }
    if name in {"BWR", "BWV"} and len(args) == 2:
        return {
            "kind": "unit_resource_add",
            "unit": args[0],
            "resource": "UNIT_STATE_LIFE" if name == "BWR" else "UNIT_STATE_MANA",
            "amount": args[1],
            "dependencies": expr_dependencies(args[1]),
            "verification": f"verified_jass_wrapper_{name}",
        }
    if name in {"BWI", "BWL", "BWO"} and len(args) == 2:
        resource = {"BWI": "gold", "BWL": "lumber", "BWO": "food_used"}[name]
        return {
            "kind": "player_resource_add",
            "player": args[0],
            "resource": resource,
            "amount": args[1],
            "verification": f"verified_jass_wrapper_{name}",
        }
    if name == "SetPlayerState" and len(args) == 3:
        return {
            "kind": "player_resource_set",
            "player": args[0],
            "resource": args[1],
            "value": args[2],
            "verification": "verified_jass_native_call",
        }
    if name in {
        "SaveInteger", "SaveReal", "SaveBoolean", "SaveStr", "SaveString",
        "SaveUnitHandle", "SaveLocationHandle", "SaveGroupHandle", "SaveTriggerHandle",
        "SaveTimerHandle", "SaveEffectHandle", "SavePlayerHandle", "SaveItemHandle",
    } and len(args) >= 4:
        return {
            "kind": "hashtable_write",
            "valueType": name[4:].replace("Handle", "").lower(),
            "table": args[0],
            "parentKey": args[1],
            "childKey": args[2],
            "value": args[3],
            "update": hashtable_update(name, args),
            "verification": "verified_jass_native_call",
        }
    if name.startswith("RemoveSaved") and len(args) >= 3:
        return {
            "kind": "hashtable_remove",
            "valueType": name[len("RemoveSaved"):].lower(),
            "table": args[0],
            "parentKey": args[1],
            "childKey": args[2],
            "verification": "verified_jass_native_call",
        }
    if name == "FlushChildHashtable" and len(args) == 2:
        return {
            "kind": "hashtable_flush_child",
            "table": args[0],
            "parentKey": args[1],
            "verification": "verified_jass_native_call",
        }
    if name in {"CreateUnit", "CreateUnitAtLoc", "CreateUnitAtLocByName", "CreateUnitAtLocSaveLast"}:
        return {
            "kind": "actor_spawn",
            "constructor": name,
            "arguments": args,
            "unitType": args[1] if len(args) > 1 else None,
            "verification": "verified_jass_native_call",
        }
    if name in {"RemoveUnit", "KillUnit"} and args:
        return {
            "kind": "actor_remove" if name == "RemoveUnit" else "actor_kill",
            "unit": args[0],
            "verification": "verified_jass_native_call",
        }
    if name == "UnitApplyTimedLife" and len(args) == 3:
        return {
            "kind": "actor_timed_life",
            "unit": args[0],
            "buffRawcode": args[1],
            "durationSeconds": args[2],
            "verification": "verified_jass_native_call",
        }
    if name in {"UnitAddAbility", "UnitRemoveAbility", "SetUnitAbilityLevel", "SetUnitAbilityLevelSwapped"}:
        return {
            "kind": "ability_mutation",
            "operation": name,
            "arguments": args,
            "verification": "verified_jass_call",
        }
    if name in {"UnitAddBuffBJ", "UnitRemoveBuffBJ", "UnitRemoveBuffs", "UnitRemoveBuffsBJ"}:
        return {
            "kind": "buff_mutation",
            "operation": name,
            "arguments": args,
            "verification": "verified_jass_call",
        }
    if name.startswith("Issue") and "Order" in name:
        return {
            "kind": "unit_order",
            "operation": name,
            "arguments": args,
            "verification": "verified_jass_call",
        }
    if name in {"TriggerExecute", "TriggerEvaluate"} and args:
        return {
            "kind": "trigger_dispatch",
            "mode": "execute_actions" if name == "TriggerExecute" else "evaluate_conditions",
            "trigger": args[0],
            "dispatchKey": expression_key(args[0]),
            "verification": "verified_jass_call",
        }
    if name == "TimerStart" and len(args) == 4:
        return {
            "kind": "schedule_timer",
            "timer": args[0],
            "delaySeconds": args[1],
            "periodic": args[2],
            "callback": args[3],
            "verification": "verified_jass_call",
        }
    if name == "BD1" and len(args) == 1:
        return {
            "kind": "fsm_start_or_set_state",
            "initialState": args[0],
            "fsmInstanceContext": "DR (created when no active frame; otherwise mutates current frame)",
            "verification": "verified_jass_wrapper_BD1",
        }
    if name == "BDr" and len(args) == 1:
        return {
            "kind": "fsm_terminate",
            "fsmInstance": args[0],
            "verification": "verified_jass_wrapper_BDr",
        }
    if name == "BEF" and len(args) == 5:
        return {
            "kind": "await_unit_event",
            "fsmInstance": args[0],
            "unit": args[1],
            "event": args[2],
            "filter": args[3],
            "resumeState": args[4],
            "verification": "verified_jass_wrapper_BEF",
        }
    if name == "BEY" and len(args) == 1:
        return {
            "kind": "cancel_unit_event_wait",
            "fsmInstance": args[0],
            "verification": "verified_jass_wrapper_BEY",
        }
    if name in {"BDw", "BDx", "BDz"}:
        result: dict[str, Any] = {
            "kind": "schedule_fsm_step",
            "operation": name,
            "fsmInstance": args[0] if args else None,
            "delaySeconds": args[1] if len(args) > 1 else None,
            "verification": f"verified_jass_wrapper_{name}",
        }
        if name == "BDw" and len(args) > 2:
            result["nextState"] = args[2]
        elif name == "BDx":
            result["nextStateExpression"] = "HN[instance]+1"
        elif name == "BDz" and len(args) > 2:
            result["stateDelta"] = args[2]
        return result
    if name in {"BPO", "BGN", "BIQ", "BKQ", "BMN", "BNP", "BQN", "BRM", "BTK"} and len(args) >= 3:
        slot_type = {
            "BPO": "integer", "BGN": "player", "BIQ": "group", "BKQ": "effect",
            "BMN": "unit", "BNP": "location", "BQN": "real", "BRM": "boolean",
            "BTK": "string",
        }[name]
        return {
            "kind": "fsm_slot_write",
            "operation": name,
            "valueType": slot_type,
            "fsmInstance": args[0],
            "slot": args[1],
            "value": args[2],
            "verification": f"verified_jass_wrapper_{name}",
        }
    if name == "BWB" and len(args) == 4:
        return {
            "kind": "forced_movement",
            "unit": args[0],
            "destination": args[1],
            "durationSeconds": args[2],
            "tickSeconds": args[3],
            "verification": "verified_jass_wrapper_BWB",
        }
    if name == "BWt" and len(args) == 3:
        return {
            "kind": "restore_attack_order",
            "attacker": args[0],
            "target": args[1],
            "priorOrderId": args[2],
            "verification": "verified_jass_wrapper_BWt",
        }
    if name == "EXPauseUnit" and len(args) >= 2:
        return {
            "kind": "actor_pause_set",
            "unit": args[0],
            "paused": args[1],
            "verification": "verified_jass_native_extension_call",
        }
    if name == "BXR" and len(args) == 2:
        return {
            "kind": "status_stack_add",
            "status": "armor_break",
            "abilityRawcode": "A04M",
            "target": args[0],
            "delta": args[1],
            "logicalStackExpression": "GetUnitAbilityLevel(target,'A04M')-1",
            "maximumLogicalStacks": 75,
            "verification": "verified_jass_wrapper_BXR",
        }
    if name in {"BcF", "BcK"} and len(args) >= 5:
        result = {
            "kind": "for_each_unit",
            "shape": "radius" if name == "BcF" else "rect",
            "groupPoolId": args[0],
            "filter": args[-2],
            "callback": args[-1],
            "verification": f"verified_jass_wrapper_{name}",
        }
        if name == "BcF":
            result.update({"radius": args[1], "center": args[2]})
        else:
            result["rect"] = args[1]
        return result
    if name == "ForGroup" and len(args) == 2:
        return {
            "kind": "for_each_unit",
            "shape": "existing_group",
            "group": args[0],
            "callback": args[1],
            "verification": "verified_jass_native_call",
        }
    if name in {"PauseUnit", "ShowUnit", "SetUnitInvulnerable", "SetUnitPathing", "SetUnitMoveSpeed", "SetUnitTimeScale"}:
        return {
            "kind": "actor_property_set",
            "property": name,
            "arguments": args,
            "verification": "verified_jass_call",
        }
    if name in {
        "SetUnitPosition", "SetUnitPositionLoc", "SetUnitX", "SetUnitY", "SetUnitFacing",
        "SetUnitFacingTimed", "SetUnitFlyHeight",
    }:
        return {
            "kind": "actor_spatial_set",
            "property": name,
            "arguments": args,
            "verification": "verified_jass_call",
        }
    if name in {
        "SetHeroStr", "SetHeroAgi", "SetHeroInt", "ModifyHeroStat", "BlzSetUnitBaseDamage",
        "BlzSetUnitAttackCooldown", "SetUnitAcquireRange",
    }:
        return {
            "kind": "actor_combat_stat_set",
            "property": name,
            "arguments": args,
            "verification": "verified_jass_call",
        }
    return None


def hashtable_update(name: str, args: list[Ast]) -> dict[str, Any]:
    if len(args) < 4:
        return {"mode": "replace"}
    load_name = {
        "SaveInteger": "LoadInteger",
        "SaveReal": "LoadReal",
        "SaveBoolean": "LoadBoolean",
        "SaveStr": "LoadStr",
        "SaveString": "LoadStr",
    }.get(name)
    value = unwrap_group(args[3])
    if load_name and value.get("node") == "binary" and value.get("operator") in {"+", "-", "*", "/"}:
        left = unwrap_group(value["left"])
        if (
            left.get("node") == "call"
            and left.get("function") == load_name
            and len(left.get("arguments", [])) >= 3
            and all(ast_equal(left["arguments"][i], args[i]) for i in range(3))
        ):
            return {
                "mode": {
                    "+": "increment",
                    "-": "decrement",
                    "*": "multiply",
                    "/": "divide",
                }[value["operator"]],
                "operand": value["right"],
            }
    return {"mode": "replace"}


SEMANTIC_TERMINALS = {
    "BWE", "BWF", "BWR", "BWV", "BWI", "BWL", "BWO",
    "BD1", "BDr", "BDw", "BDx", "BDz", "BEF", "BEY",
    "BPO", "BGN", "BIQ", "BKQ", "BMN", "BNP", "BQN", "BRM", "BTK",
    "BcF", "BcK", "BWB", "BWt", "BXR",
}


def normalize_assignment(
    statement: Ast,
    local_names: set[str],
    global_names: set[str],
) -> dict[str, Any] | None:
    target = statement["target"]
    base = lvalue_base(target)
    if base is None or base in local_names or base not in global_names:
        return None
    return {
        "kind": "state_write",
        "storage": "global_array" if unwrap_group(target).get("node") == "array_ref" else "global_scalar",
        "target": target,
        "value": statement["value"],
        "update": assignment_update(target, statement["value"]),
        "verification": "verified_jass_assignment",
    }


def expression_semantics(expression: Ast) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    expression = unwrap_group(expression)
    # Constructors can be nested in a state-slot write or another call and are
    # still side effects (for example BMN(...,CreateUnitAtLoc(...))). Preserve
    # their evaluation before the outer action. Other nested calls are values.
    calls = list(find_calls(expression))
    nested_calls = calls[1:] if expression.get("node") == "call" else calls
    for nested in nested_calls:
        semantic = semantic_for_call(nested)
        if semantic and semantic.get("kind") in {"actor_spawn"}:
            result.append(semantic)
    if expression.get("node") == "call":
        semantic = semantic_for_call(expression)
        if semantic:
            result.append(semantic)
    return result


def decorate_statements(
    function_name: str,
    statements: list[Ast],
    local_names: set[str],
    global_names: set[str],
    actions: list[dict[str, Any]],
    guards: list[dict[str, Any]] | None = None,
    loops: list[dict[str, Any]] | None = None,
) -> None:
    guards = list(guards or [])
    loops = list(loops or [])
    def attach(statement: Ast, semantics: Iterable[dict[str, Any]]) -> None:
        ids: list[str] = []
        for semantic in semantics:
            action_ordinal = 1 + sum(1 for item in actions if item["function"] == function_name)
            action_id = (
                f"jass.{function_name}.L{statement.get('line', statement.get('lineStart'))}.A{action_ordinal}"
            )
            action = {
                "actionId": action_id,
                "function": function_name,
                "line": statement.get("line", statement.get("lineStart")),
                "source": statement.get("source"),
                "guards": deepcopy(guards),
                "loopContexts": deepcopy(loops),
                **semantic,
            }
            actions.append(action)
            ids.append(action_id)
        if ids:
            statement["semanticActionRefs"] = ids

    for statement in statements:
        node_type = statement.get("node")
        if node_type == "call_statement":
            attach(statement, expression_semantics(statement["expression"]))
        elif node_type in {"assignment", "local_declaration"}:
            semantics: list[dict[str, Any]] = []
            if node_type == "assignment":
                assignment_semantic = normalize_assignment(statement, local_names, global_names)
                if assignment_semantic:
                    semantics.append(assignment_semantic)
                semantics.extend(expression_semantics(statement["value"]))
            elif "initializer" in statement:
                semantics.extend(expression_semantics(statement["initializer"]))
            attach(statement, semantics)
        elif node_type == "if":
            previous_conditions: list[Ast] = []
            for branch in statement["branches"]:
                branch_guards = deepcopy(guards)
                for prior in previous_conditions:
                    prior_line = next(
                        item["line"] for item in statement["branches"]
                        if item["condition"] is prior
                    )
                    prior_gates = random_gates_in_condition(prior, function_name, prior_line)
                    branch_guards.append({
                        "truth": False,
                        "expression": prior,
                        "sourceLine": prior_line,
                        "randomGate": prior_gates[0] if len(prior_gates) == 1 else None,
                        "randomGates": prior_gates,
                    })
                condition = branch["condition"]
                condition_gates = random_gates_in_condition(
                    condition, function_name, branch["line"]
                )
                branch_guards.append({
                    "truth": True,
                    "expression": condition,
                    "sourceLine": branch["line"],
                    "randomGate": condition_gates[0] if len(condition_gates) == 1 else None,
                    "randomGates": condition_gates,
                })
                decorate_statements(
                    function_name, branch["body"], local_names, global_names,
                    actions, branch_guards, loops,
                )
                previous_conditions.append(condition)
            if "elseBody" in statement:
                else_guards = deepcopy(guards)
                for prior in previous_conditions:
                    prior_line = next(
                        item["line"] for item in statement["branches"]
                        if item["condition"] is prior
                    )
                    prior_gates = random_gates_in_condition(prior, function_name, prior_line)
                    else_guards.append({
                        "truth": False,
                        "expression": prior,
                        "sourceLine": prior_line,
                        "randomGate": prior_gates[0] if len(prior_gates) == 1 else None,
                        "randomGates": prior_gates,
                    })
                decorate_statements(
                    function_name, statement["elseBody"], local_names, global_names,
                    actions, else_guards, loops,
                )
        elif node_type == "loop":
            exit_conditions = [
                child["condition"] for child in statement["body"] if child.get("node") == "exitwhen"
            ]
            loop_context = {
                "lineStart": statement["lineStart"],
                "lineEnd": statement["lineEnd"],
                "exitConditions": exit_conditions,
                "iterationCount": "runtime_state_dependent",
            }
            decorate_statements(
                function_name, statement["body"], local_names, global_names,
                actions, guards, [*loops, loop_context],
            )


def collect_statement_expressions(statements: list[Ast]) -> Iterator[Ast]:
    for statement in statements:
        node_type = statement.get("node")
        for key in ("expression", "target", "value", "initializer", "condition"):
            if key in statement:
                yield statement[key]
        if node_type == "if":
            for branch in statement["branches"]:
                yield branch["condition"]
                yield from collect_statement_expressions(branch["body"])
            if "elseBody" in statement:
                yield from collect_statement_expressions(statement["elseBody"])
        elif node_type == "loop":
            yield from collect_statement_expressions(statement["body"])


def collect_rng_sites_from_statements(
    function_name: str,
    statements: list[Ast],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for statement in statements:
        node_type = statement.get("node")
        if node_type == "if":
            for branch in statement["branches"]:
                result.extend(random_gates_in_condition(
                    branch["condition"], function_name, branch["line"]
                ))
                result.extend(collect_rng_sites_from_statements(function_name, branch["body"]))
            if "elseBody" in statement:
                result.extend(collect_rng_sites_from_statements(function_name, statement["elseBody"]))
        elif node_type == "loop":
            result.extend(collect_rng_sites_from_statements(function_name, statement["body"]))
        elif node_type == "exitwhen":
            result.extend(random_gates_in_condition(
                statement["condition"], function_name, statement["line"]
            ))
    unique = {item["rollId"]: item for item in result}
    return [unique[key] for key in sorted(unique)]


def dispatch_key(node: Ast) -> str:
    key = expression_key(node)
    if key is not None:
        return key
    return json.dumps(without_source(node), ensure_ascii=False, sort_keys=True)


def scoped_dispatch_key(node: Ast, function_name: str, global_names: set[str]) -> str:
    raw_key = dispatch_key(node)
    base = lvalue_base(node)
    if base is not None and base not in global_names:
        return f"{function_name}::{raw_key}"
    return raw_key


def build_dispatch_tables(
    function_documents: dict[str, dict[str, Any]],
    global_names: set[str],
) -> dict[str, Any]:
    registrations: dict[str, list[dict[str, Any]]] = defaultdict(list)
    dispatch_sites: list[dict[str, Any]] = []
    callback_contexts: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for function_name, document in function_documents.items():
        for expression in collect_statement_expressions(document["body"]):
            root = unwrap_group(expression)
            if root.get("node") != "call":
                continue
            name = root["function"]
            args = root.get("arguments", [])
            if name in {"TriggerAddAction", "TriggerAddCondition"} and len(args) >= 2:
                refs = sorted(function_refs(args[1]))
                key = scoped_dispatch_key(args[0], function_name, global_names)
                for target in refs:
                    registrations[key].append({
                        "targetFunction": target,
                        "registrationFunction": function_name,
                        "mode": "actions" if name == "TriggerAddAction" else "conditions",
                        "source": root.get("source"),
                    })
            if name in {"TriggerExecute", "TriggerEvaluate"} and args:
                key = scoped_dispatch_key(args[0], function_name, global_names)
                dispatch_sites.append({
                    "function": function_name,
                    "mode": "actions" if name == "TriggerExecute" else "conditions",
                    "dispatchKey": key,
                    "source": root.get("source"),
                })
            if name in {"BcF", "BcK", "ForGroup"}:
                callback_arg = args[-1] if args else {}
                for target in sorted(function_refs(callback_arg)):
                    context: dict[str, Any] = {
                        "callerFunction": function_name,
                        "iterator": name,
                        "source": root.get("source"),
                    }
                    if name == "BcF" and len(args) >= 5:
                        context.update({"shape": "radius", "radius": args[1], "center": args[2], "filter": args[3]})
                    elif name == "BcK" and len(args) >= 5:
                        context.update({"shape": "rect", "rect": args[1], "filter": args[3]})
                    else:
                        context.update({"shape": "existing_group", "group": args[0] if args else None})
                    callback_contexts[target].append(context)
    normalized_registrations = {
        key: sorted(value, key=lambda item: (item["targetFunction"], item["registrationFunction"], item["mode"]))
        for key, value in sorted(registrations.items())
    }
    for key, values in normalized_registrations.items():
        unique: list[dict[str, Any]] = []
        seen = set()
        for item in values:
            identity = (item["targetFunction"], item["registrationFunction"], item["mode"])
            if identity not in seen:
                seen.add(identity)
                unique.append(item)
        normalized_registrations[key] = unique
    return {
        "registrations": normalized_registrations,
        "dispatchSites": sorted(dispatch_sites, key=lambda item: (item["function"], item["source"] or "")),
        "callbackContexts": {
            key: sorted(value, key=lambda item: (item["callerFunction"], item["source"] or ""))
            for key, value in sorted(callback_contexts.items())
        },
    }


def build_call_graph(
    function_documents: dict[str, dict[str, Any]],
    dispatch_tables: dict[str, Any],
    global_names: set[str],
) -> tuple[dict[str, list[dict[str, str]]], list[dict[str, Any]]]:
    function_names = set(function_documents)

    def skill_target(name: str) -> bool:
        document = function_documents.get(name)
        if document is None:
            return False
        line_start = document["source"]["lineStart"]
        return SKILL_FUNCTION_LINE_MIN <= line_start <= SKILL_FUNCTION_LINE_MAX

    registration_targets = {
        key: {item["targetFunction"] for item in registrations}
        for key, registrations in dispatch_tables["registrations"].items()
    }
    graph: dict[str, list[dict[str, str]]] = {}
    unresolved_dispatch: list[dict[str, Any]] = []
    for function_name, document in function_documents.items():
        edges: set[tuple[str, str]] = set()
        for expression in collect_statement_expressions(document["body"]):
            root = unwrap_group(expression)
            for called in called_functions(expression):
                if called in function_names and called not in SEMANTIC_TERMINALS and skill_target(called):
                    edges.add((called, "direct_call"))
            for callback in function_refs(expression):
                if callback in function_names and skill_target(callback):
                    edges.add((callback, "code_callback"))
            if root.get("node") == "call" and root.get("function") in {"TriggerExecute", "TriggerEvaluate"}:
                args = root.get("arguments", [])
                if args:
                    key = scoped_dispatch_key(args[0], function_name, global_names)
                    targets = registration_targets.get(key, set())
                    if targets:
                        for target in targets:
                            if skill_target(target):
                                edges.add((target, "resolved_trigger_dispatch"))
                    else:
                        unresolved_dispatch.append({
                            "function": function_name,
                            "dispatchKey": key,
                            "mode": root["function"],
                            "source": root.get("source"),
                            "classification": classify_unresolved_dispatch(key, root),
                        })
        graph[function_name] = [
            {"target": target, "edgeType": edge_type}
            for target, edge_type in sorted(edges)
        ]
    return graph, sorted(
        unresolved_dispatch,
        key=lambda item: (item["classification"], item["function"], item["source"] or ""),
    )


def classify_unresolved_dispatch(key: str, call: Ast) -> str:
    source = call.get("source") or ""
    if "DW[" in source:
        return "fsm_current_trigger_self_dispatch"
    if "LoadTriggerHandle(Jt" in source:
        return "attack_registry_dispatch_by_unit_rawcode"
    if "LoadTriggerHandle(Jv" in source:
        return "spell_or_event_registry_dispatch_by_rawcode"
    if key.startswith("F9[") or key.startswith("DZ["):
        return "fsm_event_type_dispatch"
    if key.startswith("Fw["):
        return "runtime_event_context_dispatch"
    if key == "Dp":
        return "runtime_global_trigger_dispatch"
    if key.startswith("{"):
        return "runtime_trigger_expression"
    return "unresolved_static_trigger"


def closure_for_roots(
    roots: Iterable[str],
    call_graph: dict[str, list[dict[str, str]]],
) -> list[str]:
    seen: set[str] = set()
    queue = deque(sorted(set(roots)))
    while queue:
        function_name = queue.popleft()
        if function_name in seen:
            continue
        seen.add(function_name)
        for edge in call_graph.get(function_name, []):
            if edge["target"] not in seen:
                queue.append(edge["target"])
    return sorted(seen)


def rawcode_from_literal(
    node: Ast,
    global_constant_initializers: dict[str, Ast] | None = None,
) -> str | None:
    node = unwrap_group(node)
    if node.get("node") == "variable" and global_constant_initializers:
        initializer = global_constant_initializers.get(node["name"])
        if initializer is not None:
            return rawcode_from_literal(initializer, global_constant_initializers)
    if node.get("node") != "literal" or node.get("valueType") != "integer":
        return None
    fourcc = node.get("fourcc")
    if fourcc:
        return fourcc
    value = node.get("value")
    if not isinstance(value, int) or value < 0 or value > 0xFFFFFFFF:
        return None
    try:
        decoded = value.to_bytes(4, "big").decode("latin1")
    except (OverflowError, UnicodeDecodeError):
        return None
    return decoded


def init_registrations(
    profile: dict[str, Any],
    function_documents: dict[str, dict[str, Any]],
    global_constant_initializers: dict[str, Ast],
) -> list[dict[str, Any]]:
    init_function = profile["jassInit"]["function"]
    document = function_documents[init_function]
    entries: list[dict[str, Any]] = []
    for expression in collect_statement_expressions(document["body"]):
        root = unwrap_group(expression)
        if root.get("node") != "call":
            continue
        name = root["function"]
        args = root.get("arguments", [])
        if name == "sc" and len(args) == 2:
            refs = sorted(function_refs(args[1]))
            rawcode = rawcode_from_literal(args[0], global_constant_initializers)
            for function_name in refs:
                entries.append({
                    "entryPointId": f"{profile['profileId']}.attack.{rawcode or args[0].get('source')}.{function_name}",
                    "kind": "attack_started",
                    "function": function_name,
                    "unitRawcode": rawcode,
                    "rawcodeBinding": "literal" if unwrap_group(args[0]).get("node") == "literal" else "global_constant",
                    "registration": root,
                    "verification": "verified_jass_sc_registration",
                })
        elif name == "xc" and len(args) == 3:
            refs = sorted(function_refs(args[2]))
            rawcode = rawcode_from_literal(args[1], global_constant_initializers)
            for function_name in refs:
                entries.append({
                    "entryPointId": f"{profile['profileId']}.spell.{rawcode or args[1].get('source')}.{function_name}",
                    "kind": "spell_effect",
                    "function": function_name,
                    "dispatchNamespace": args[0],
                    "abilityRawcode": rawcode,
                    "rawcodeBinding": "literal" if unwrap_group(args[1]).get("node") == "literal" else "global_constant",
                    "registration": root,
                    "verification": "verified_jass_xc_registration",
                })
        elif name == "xh" and len(args) == 2:
            refs = sorted(function_refs(args[1]))
            rawcode = rawcode_from_literal(args[0], global_constant_initializers)
            for function_name in refs:
                entries.append({
                    "entryPointId": f"{profile['profileId']}.death.{rawcode or args[0].get('source')}.{function_name}",
                    "kind": "unit_death",
                    "function": function_name,
                    "unitRawcode": rawcode,
                    "rawcodeBinding": "literal" if unwrap_group(args[0]).get("node") == "literal" else "global_constant",
                    "registration": root,
                    "verification": "verified_jass_xh_registration",
                })
    entries.append({
        "entryPointId": f"{profile['profileId']}.initialization.{init_function}",
        "kind": "initialization",
        "function": init_function,
        "verification": "verified_profile_init_binding",
    })
    result: list[dict[str, Any]] = []
    seen = set()
    for entry in entries:
        identity = (entry["kind"], entry["function"], entry.get("unitRawcode"), entry.get("abilityRawcode"))
        if identity not in seen:
            seen.add(identity)
            result.append(entry)
    return result


def entry_closure_summary(
    entry: dict[str, Any],
    call_graph: dict[str, list[dict[str, str]]],
    actions_by_function: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    function_refs = closure_for_roots([entry["function"]], call_graph)
    action_refs = [
        action["actionId"]
        for function_name in function_refs
        for action in actions_by_function.get(function_name, [])
    ]
    damage_refs = [
        action["actionId"]
        for function_name in function_refs
        for action in actions_by_function.get(function_name, [])
        if action["kind"] == "damage"
    ]
    return {
        **entry,
        "functionRefs": function_refs,
        "actionRefs": action_refs,
        "damageActionRefs": damage_refs,
        "counts": {
            "functions": len(function_refs),
            "actions": len(action_refs),
            "damageActions": len(damage_refs),
        },
    }


def discover_auxiliary_setup_roots(
    function_documents: dict[str, dict[str, Any]],
    profile_init_functions: set[str],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen = set()
    for caller_name, document in function_documents.items():
        for expression in collect_statement_expressions(document["body"]):
            root = unwrap_group(expression)
            if root.get("node") != "call" or root.get("function") != "ExecuteFunc":
                continue
            args = root.get("arguments", [])
            if len(args) != 1:
                continue
            arg = unwrap_group(args[0])
            if arg.get("node") != "literal" or arg.get("valueType") != "string":
                continue
            target = arg["value"]
            target_document = function_documents.get(target)
            if target_document is None or target in profile_init_functions:
                continue
            line_start = target_document["source"]["lineStart"]
            if not (SKILL_FUNCTION_LINE_MIN <= line_start <= SKILL_FUNCTION_LINE_MAX):
                continue
            identity = (caller_name, target)
            if identity in seen:
                continue
            seen.add(identity)
            result.append({
                "entryPointId": f"auxiliary_setup.{target}",
                "kind": "auxiliary_setup",
                "function": target,
                "registeredBy": caller_name,
                "registration": root,
                "verification": "verified_jass_ExecuteFunc_registration",
            })
    return sorted(result, key=lambda item: item["function"])


def enrich_action_rawcodes(
    actions: list[dict[str, Any]],
    global_constant_initializers: dict[str, Ast],
) -> tuple[set[str], set[str]]:
    unit_rawcodes: set[str] = set()
    ability_rawcodes: set[str] = set()
    for action in actions:
        if action["kind"] == "actor_spawn" and action.get("unitType"):
            rawcode = rawcode_from_literal(action["unitType"], global_constant_initializers)
            if rawcode:
                action["unitRawcode"] = rawcode
                action["unitObjectRef"] = f"#/actionAst/objectData/units/{rawcode}"
                unit_rawcodes.add(rawcode)
        elif action["kind"] == "ability_mutation":
            args = action.get("arguments", [])
            operation = action.get("operation")
            ability_expression: Ast | None = None
            if operation in {"UnitAddAbility", "UnitRemoveAbility", "SetUnitAbilityLevel"} and len(args) > 1:
                ability_expression = args[1]
            elif operation == "SetUnitAbilityLevelSwapped" and args:
                ability_expression = args[0]
            if ability_expression is not None:
                rawcode = rawcode_from_literal(ability_expression, global_constant_initializers)
                if rawcode:
                    action["abilityRawcode"] = rawcode
                    action["abilityObjectRef"] = f"#/actionAst/objectData/abilities/{rawcode}"
                    ability_rawcodes.add(rawcode)
        elif action["kind"] == "status_stack_add" and action.get("abilityRawcode"):
            ability_rawcodes.add(action["abilityRawcode"])
        elif action["kind"] == "unit_order":
            order_strings: list[str] = []
            for order_call in find_calls({"arguments": action.get("arguments", [])}, "OrderId"):
                args = order_call.get("arguments", [])
                if args:
                    value = unwrap_group(args[0])
                    if value.get("node") == "literal" and value.get("valueType") == "string":
                        order_strings.append(value["value"])
            if order_strings:
                action["orderStrings"] = order_strings
    return unit_rawcodes, ability_rawcodes


def unit_attack_snapshot(rawcode: str, weapons: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    row = weapons.get(rawcode, {})
    mask = int(row.get("weapsOn", 0) or 0)
    result = []
    for index in (1, 2):
        dice = int(row.get(f"dice{index}", 0) or 0)
        sides = int(row.get(f"sides{index}", 0) or 0)
        plus = float(row.get(f"dmgplus{index}", 0) or 0)
        enabled = bool(mask & (1 << (index - 1)))
        minimum = plus + (dice if dice and sides else 0)
        maximum = plus + (dice * sides if dice and sides else 0)
        cooldown = float(row.get(f"cool{index}", 0) or 0)
        result.append({
            "index": index,
            "enabled": enabled,
            "damage": {
                "dice": dice,
                "sides": sides,
                "plus": plus,
                "minimum": minimum,
                "maximum": maximum,
            },
            "cooldownSeconds": cooldown,
            "rawDpsOneTarget": (
                (minimum + maximum) / 2 / cooldown if enabled and cooldown > 0 else 0
            ),
            "attackType": row.get(f"atkType{index}"),
            "weaponType": row.get(f"weapTp{index}"),
            "range": row.get(f"rangeN{index}"),
            "targets": row.get(f"targs{index}"),
            "targetCount": row.get(f"targCount{index}"),
            "fullArea": row.get(f"Farea{index}"),
            "halfArea": row.get(f"Harea{index}"),
            "quarterArea": row.get(f"Qarea{index}"),
            "damagePoint": row.get(f"dmgpt{index}"),
            "backswing": row.get(f"backSw{index}"),
        })
    return result


def build_object_catalog(
    spawned_unit_rawcodes: set[str],
    dynamic_ability_rawcodes: set[str],
) -> dict[str, Any]:
    # Reuse the established SLK parser so object rows are decoded identically
    # to the base-combat profiles.
    import sys

    sys.path.insert(0, str(ROOT / "shared_map"))
    import build_transcend_profiles as profile_base  # type: ignore

    extracted = ROOT / "shared_map" / "extracted"
    balance = profile_base.parse_sylk(extracted / "Units" / "UnitBalance.slk")
    weapons = profile_base.parse_sylk(extracted / "Units" / "UnitWeapons.slk")
    unit_abilities = profile_base.parse_sylk(extracted / "Units" / "UnitAbilities.slk")
    unit_strings = profile_base.parse_ini_sections(extracted / "Units" / "CampaignUnitStrings.txt")
    ability_data = profile_base.parse_sylk(extracted / "Units" / "AbilityData.slk")
    ability_strings = profile_base.parse_ini_sections(extracted / "Units" / "CampaignAbilityStrings.txt")
    override_path = ROOT / "shared_map" / "objects_json" / "abilities.json"
    overrides_raw = json.loads(override_path.read_text(encoding="utf-8")) if override_path.exists() else {}
    override_by_id = {
        **overrides_raw.get("original", {}),
        **overrides_raw.get("custom", {}),
    }
    source_paths = {
        "unitBalance": extracted / "Units" / "UnitBalance.slk",
        "unitWeapons": extracted / "Units" / "UnitWeapons.slk",
        "unitAbilities": extracted / "Units" / "UnitAbilities.slk",
        "abilityData": extracted / "Units" / "AbilityData.slk",
        "abilityOverrides": override_path,
    }

    units: dict[str, Any] = {}
    all_ability_rawcodes = set(dynamic_ability_rawcodes)
    missing_units: list[str] = []
    for rawcode in sorted(spawned_unit_rawcodes):
        ability_ids = [
            item for item in str(unit_abilities.get(rawcode, {}).get("abilList", "")).split(",")
            if item and item != "_"
        ]
        all_ability_rawcodes.update(ability_ids)
        if rawcode not in balance and rawcode not in weapons and rawcode not in unit_abilities:
            missing_units.append(rawcode)
        b = balance.get(rawcode, {})
        strings = unit_strings.get(rawcode, {})
        units[rawcode] = {
            "rawcode": rawcode,
            "name": profile_base.clean_text(strings.get("Name")) or None,
            "properName": profile_base.clean_text(strings.get("Propernames")) or None,
            "hp": b.get("HP"),
            "hpRegen": b.get("regenHP"),
            "manaMaximum": b.get("manaN"),
            "manaInitial": b.get("mana0"),
            "manaRegen": b.get("regenMana"),
            "armor": b.get("def"),
            "armorType": b.get("defType"),
            "moveSpeed": b.get("spd"),
            "primaryStat": b.get("Primary"),
            "strength": b.get("STR"),
            "agility": b.get("AGI"),
            "intelligence": b.get("INT"),
            "abilities": ability_ids,
            "attacks": unit_attack_snapshot(rawcode, weapons),
            "verification": "verified_object_data",
        }

    abilities: dict[str, Any] = {}
    missing_abilities: list[str] = []
    for rawcode in sorted(all_ability_rawcodes):
        data = ability_data.get(rawcode)
        strings = ability_strings.get(rawcode, {})
        override = override_by_id.get(rawcode)
        if data is None and not strings and override is None:
            missing_abilities.append(rawcode)
        abilities[rawcode] = {
            "rawcode": rawcode,
            "name": profile_base.clean_text(strings.get("Name")) or None,
            "tip": profile_base.clean_text(strings.get("Tip")) or None,
            "tooltip": profile_base.clean_text(strings.get("Ubertip")) or None,
            "slk": data,
            "w3aOverride": override,
            "verification": "verified_object_data",
        }
    return {
        "source": {
            key: {
                "file": str(path.relative_to(ROOT)),
                "sha256": sha256_path(path),
            }
            for key, path in source_paths.items()
        },
        "orderAliases": {
            "dreadlordinferno": {
                "abilityOrder": "inferno",
                "reason": "Warcraft native order alias used by IssuePointOrderById",
                "verification": "verified_jass_and_object_data",
            }
        },
        "units": units,
        "abilities": abilities,
        "validation": {
            "missingUnitObjectRows": missing_units,
            "missingAbilityObjectRows": missing_abilities,
        },
    }


def schema_document() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://local.invalid/schemas/ord-2305c-action-ast-1.0.json",
        "title": "ORD 2.305C all-upper profiles with verified JASS action AST",
        "type": "object",
        "required": ["schemaVersion", "map", "profiles", "actionAst", "validation"],
        "properties": {
            "schemaVersion": {"const": "ord-all-upper-skill-profile/2.0-action-ast"},
            "map": {"type": "object", "required": ["version", "scriptSha256"]},
            "profiles": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["profileId", "actionProgram", "profileStatus", "simulationPolicy"],
                    "properties": {
                        "profileStatus": {"const": "verified_action_ast_ready"},
                        "actionProgram": {
                            "type": "object",
                            "required": ["astVersion", "entryPoints", "functionRefs", "actionRefs", "counts"],
                        },
                    },
                },
            },
            "actionAst": {
                "type": "object",
                "required": [
                    "astVersion", "numericAuthorityPolicy", "runtimePrimitives", "globalSymbols",
                    "dispatch", "functions", "actions",
                ],
            },
            "validation": {"type": "object"},
        },
        "$defs": {
            "expression": {
                "type": "object",
                "required": ["node"],
                "properties": {
                    "node": {
                        "enum": [
                            "literal", "variable", "array_ref", "call", "function_ref", "binary",
                            "unary", "group", "raw_expression",
                        ]
                    }
                },
            },
            "action": {
                "type": "object",
                "required": ["actionId", "function", "line", "kind", "verification"],
                "properties": {
                    "verification": {"pattern": "^verified_jass"},
                    "kind": {
                        "enum": [
                            "damage", "state_write", "hashtable_write", "hashtable_remove",
                            "hashtable_flush_child", "unit_resource_set", "unit_resource_add",
                            "player_resource_set", "player_resource_add", "actor_spawn", "actor_remove",
                            "actor_kill", "actor_timed_life", "ability_mutation", "buff_mutation",
                            "unit_order", "trigger_dispatch", "schedule_timer", "schedule_fsm_step",
                            "fsm_slot_write", "for_each_unit", "actor_property_set", "actor_spatial_set",
                            "actor_combat_stat_set", "fsm_start_or_set_state", "fsm_terminate",
                            "await_unit_event", "cancel_unit_event_wait", "forced_movement",
                            "restore_attack_order", "actor_pause_set", "status_stack_add",
                        ]
                    },
                },
            },
        },
    }


def build_audit(document: dict[str, Any], base_sha: str) -> str:
    counts = document["counts"]
    ast_counts = counts["actionAst"]
    validation = document["validation"]
    missing_spell_profiles = document["actionAst"]["entryPointAudit"]["previouslyUnrepresentedSpellRoots"]
    lines = [
        "# ORD 2.305C 전체 상위 JASS 액션 AST 정규화 감사 보고서",
        "",
        "## 결과",
        "",
        f"- 기반 통합 프로필 SHA-256: `{base_sha}`",
        f"- 전투 프로필: **{counts['combatProfiles']}개**",
        f"- JASS 전체 함수 파싱: **{ast_counts['allParsedFunctions']}개**",
        f"- 프로필 실행 도달 함수: **{ast_counts['reachableFunctions']}개**",
        f"- 공격 시작 진입점(`sc`): **{ast_counts['attackEntryPoints']}개**",
        f"- 스펠 효과 진입점(`xc`): **{ast_counts['spellEntryPoints']}개**",
        f"  - 리터럴 rawcode {ast_counts['literalSpellEntryPoints']}개 + 전역 상수 해석 {ast_counts['globalConstantSpellEntryPoints']}개",
        f"- 초기화 진입점: **{ast_counts['initializationEntryPoints']}개**",
        f"- 정규화 액션: **{ast_counts['semanticActions']}개**",
        f"- 피해 액션: **{ast_counts['damageActions']}개**",
        f"- 정적 확률 게이트: **{ast_counts['randomGates']}개**",
        f"- 소환/더미 유닛 객체: **{ast_counts['spawnedUnitRawcodes']} rawcode**",
        f"- 연결된 능력 객체: **{ast_counts['referencedAbilityRawcodes']} rawcode**",
        "",
        "`numericMentions`는 그대로 보존했지만 계산 권위에서 제외했습니다. 피해량·확률·범위·상태식은 "
        "`actionAst.functions`의 제어 흐름과 `actionAst.actions`의 JASS 식만 사용해야 합니다.",
        "",
        "## 실행 모델",
        "",
        "- `sc(rawcode, handler)`는 명중이 아니라 `EVENT_PLAYER_UNIT_ATTACKED`, 즉 공격 시작입니다.",
        "- `zL(a,b)`는 양 끝을 포함하는 균등 정수, `zM(a,b)`는 균등 실수입니다.",
        "- `BWE`와 `BWF`는 내부 `zM(low,high) × base`를 피해량 AST로 펼쳤습니다.",
        "- `TriggerExecute`는 `TriggerAddAction` 등록표를 따라 정적 콜백으로 연결했습니다.",
        "- `BcF`/`BcK`/`ForGroup` 콜백과 `TimerStart`, `BDw`/`BDx`/`BDz` 지연 상태 전이를 보존했습니다.",
        "- 전역 배열·해시테이블·유닛 자원 쓰기는 상태 액션으로 분리했습니다.",
        "",
        "전체 프로그램 AST를 실행할 때는 기존 툴팁 `triggers[].probability`를 다시 곱하면 안 됩니다. "
        "확률 분기는 이미 JASS `if` 조건에 들어 있습니다.",
        "",
        "## 기존 파일에서 빠졌던 스펠 루트",
        "",
    ]
    if missing_spell_profiles:
        for item in missing_spell_profiles:
            lines.append(
                f"- {item['profileId']}: {item['count']}개 — "
                + ", ".join(f"{entry['abilityRawcode']}→{entry['function']}" for entry in item["entries"])
            )
    else:
        lines.append("- 없음")
    lines.extend([
        "",
        "## 액션 분류",
        "",
        "| 액션 종류 | 개수 |",
        "|---|---:|",
    ])
    for kind, count in ast_counts["actionKindCounts"].items():
        lines.append(f"| `{kind}` | {count} |")
    lines.extend([
        "",
        "## 무결성 검증",
        "",
    ])
    for key, value in validation.items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend([
        "",
        "## 남은 런타임 경계",
        "",
        "액션 AST는 도달 가능한 스킬 JASS 제어 흐름을 손실 없이 보존하며 피해식은 확정값입니다. 다만 자동 DPS에 넣을지 여부는 "
        "수동 스킬 사용 정책, 보스/라인 대상 수, 소환체 타게팅, 더미 주문의 시전자→능력→주문 경로 해석이 필요합니다. "
        "따라서 `allowSkillDpsDerivation=true`이지만 `allowKillVerdict=false`로 유지했습니다.",
    ])
    return "\n".join(lines) + "\n"


def profile_existing_handler_set(profile: dict[str, Any]) -> set[tuple[str | None, str]]:
    result: set[tuple[str | None, str]] = set()
    for entity in profile.get("entities", []):
        if entity.get("attackHandler"):
            result.add((entity.get("rawcode"), entity["attackHandler"]))
    if profile.get("spellHandlers"):
        for item in profile["spellHandlers"]:
            if item.get("spellEffectHandler"):
                result.add((item.get("ability", {}).get("rawcode"), item["spellEffectHandler"]))
    else:
        for item in profile.get("traits", []):
            if item.get("spellEffectHandler"):
                result.add((item.get("ability", {}).get("rawcode"), item["spellEffectHandler"]))
    return result


def main() -> None:
    if not BASE_PATH.exists() or not JASS_PATH.exists():
        raise FileNotFoundError("Run the profile builders and extract the 2.305C map first.")
    base_document = json.loads(BASE_PATH.read_text(encoding="utf-8"))
    base_sha = sha256_path(BASE_PATH)
    jass_sha = sha256_path(JASS_PATH)
    if base_document["map"]["scriptSha256"] != jass_sha:
        raise SystemExit(
            f"JASS SHA mismatch: profile={base_document['map']['scriptSha256']} actual={jass_sha}"
        )

    _lines, raw_functions, globals_out = parse_jass_source(JASS_PATH)
    global_names = {item["name"] for item in globals_out if item.get("parseStatus") == "parsed"}
    global_constant_initializers = {
        item["name"]: item["initializer"]
        for item in globals_out
        if item.get("constant") and item.get("initializer") is not None
    }
    expression_fallbacks: list[dict[str, Any]] = []
    function_parse_failures: list[dict[str, Any]] = []
    function_documents: dict[str, dict[str, Any]] = {}
    actions: list[dict[str, Any]] = []
    actions_by_function: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for function_name, raw in raw_functions.items():
        try:
            body = StatementParser(
                function_name, raw["bodyLines"], expression_fallbacks
            ).parse()
        except ParseError as exc:
            function_parse_failures.append({
                "function": function_name,
                "lineStart": raw["lineStart"],
                "error": str(exc),
            })
            continue
        local_names = {parameter["name"] for parameter in raw["parameters"]}
        local_names.update(
            node["name"] for node in walk_ast(body) if node.get("node") == "local_declaration"
        )
        function_actions: list[dict[str, Any]] = []
        decorate_statements(
            function_name, body, local_names, global_names, function_actions
        )
        actions.extend(function_actions)
        actions_by_function[function_name].extend(function_actions)
        function_documents[function_name] = {
            "programId": f"jass.{function_name}",
            "function": function_name,
            "parameters": raw["parameters"],
            "returnType": raw["returnType"],
            "source": {
                "scriptSha256": jass_sha,
                "lineStart": raw["lineStart"],
                "lineEnd": raw["lineEnd"],
            },
            "locals": sorted(local_names - {parameter["name"] for parameter in raw["parameters"]}),
            "body": body,
            "actionRefs": [item["actionId"] for item in function_actions],
        }

    if function_parse_failures:
        raise SystemExit(f"function parse failures: {function_parse_failures[:10]}")
    if expression_fallbacks:
        raise SystemExit(f"expression parse fallbacks: {expression_fallbacks[:10]}")
    if set(function_documents) != set(raw_functions):
        raise SystemExit("Not every JASS function produced an AST.")

    dispatch = build_dispatch_tables(function_documents, global_names)
    call_graph, unresolved_dispatch = build_call_graph(
        function_documents, dispatch, global_names
    )
    for function_name, document in function_documents.items():
        document["callEdges"] = call_graph[function_name]
        contexts = dispatch["callbackContexts"].get(function_name)
        if contexts:
            document["callbackInvocationContexts"] = contexts

    profile_init_functions = {
        profile["jassInit"]["function"] for profile in base_document["profiles"]
    }
    auxiliary_setup_entries = [
        entry_closure_summary(entry, call_graph, actions_by_function)
        for entry in discover_auxiliary_setup_roots(
            function_documents, profile_init_functions
        )
    ]

    profiles = deepcopy(base_document["profiles"])
    all_profile_function_refs: set[str] = set()
    all_entry_points: list[dict[str, Any]] = []
    missing_entry_functions: list[str] = []
    previously_unrepresented: list[dict[str, Any]] = []
    attack_registration_pairs: list[tuple[str | None, str]] = []
    spell_registration_pairs: list[tuple[str | None, str]] = []
    for profile in profiles:
        bare_entries = init_registrations(
            profile, function_documents, global_constant_initializers
        )
        existing = profile_existing_handler_set(profile)
        missing_spell_entries = [
            entry for entry in bare_entries
            if entry["kind"] == "spell_effect"
            and (entry.get("abilityRawcode"), entry["function"]) not in existing
        ]
        if missing_spell_entries:
            previously_unrepresented.append({
                "profileId": profile["profileId"],
                "count": len(missing_spell_entries),
                "entries": [
                    {"abilityRawcode": entry.get("abilityRawcode"), "function": entry["function"]}
                    for entry in missing_spell_entries
                ],
            })
        entry_points = []
        for bare_entry in bare_entries:
            if bare_entry["function"] not in function_documents:
                missing_entry_functions.append(
                    f"{profile['profileId']}:{bare_entry['kind']}:{bare_entry['function']}"
                )
                continue
            entry = entry_closure_summary(bare_entry, call_graph, actions_by_function)
            entry_points.append(entry)
            all_entry_points.append({
                "profileId": profile["profileId"],
                "entryPointId": entry["entryPointId"],
                "kind": entry["kind"],
                "function": entry["function"],
                "unitRawcode": entry.get("unitRawcode"),
                "abilityRawcode": entry.get("abilityRawcode"),
                "rawcodeBinding": entry.get("rawcodeBinding"),
            })
            if entry["kind"] == "attack_started":
                attack_registration_pairs.append((entry.get("unitRawcode"), entry["function"]))
            elif entry["kind"] == "spell_effect":
                spell_registration_pairs.append((entry.get("abilityRawcode"), entry["function"]))
        profile_functions = sorted({
            function_name
            for entry in entry_points
            for function_name in entry["functionRefs"]
        })
        profile_actions = [
            action
            for function_name in profile_functions
            for action in actions_by_function.get(function_name, [])
        ]
        profile_action_refs = [action["actionId"] for action in profile_actions]
        all_profile_function_refs.update(profile_functions)
        kind_counts = dict(sorted(Counter(action["kind"] for action in profile_actions).items()))
        profile["actionProgram"] = {
            "astVersion": "ord-jass-action-ast/1.0",
            "numericAuthority": "verified_jass_only",
            "entryPoints": entry_points,
            "functionRefs": profile_functions,
            "actionRefs": profile_action_refs,
            "damageActionRefs": [
                action["actionId"] for action in profile_actions if action["kind"] == "damage"
            ],
            "counts": {
                "entryPoints": len(entry_points),
                "attackEntryPoints": sum(entry["kind"] == "attack_started" for entry in entry_points),
                "spellEntryPoints": sum(entry["kind"] == "spell_effect" for entry in entry_points),
                "initializationEntryPoints": sum(entry["kind"] == "initialization" for entry in entry_points),
                "functions": len(profile_functions),
                "actions": len(profile_actions),
                "damageActions": sum(action["kind"] == "damage" for action in profile_actions),
                "actionKindCounts": kind_counts,
            },
        }
        profile["coverage"]["jassActionAstNormalized"] = len(entry_points)
        profile["coverage"]["jassActionAstFunctions"] = len(profile_functions)
        profile["coverage"]["verifiedDamageActions"] = sum(
            action["kind"] == "damage" for action in profile_actions
        )
        profile["profileStatus"] = "verified_action_ast_ready"
        profile["simulationPolicy"] = {
            "allowActionAstExecution": True,
            "allowSkillDpsDerivation": True,
            "allowAutomaticManualSkillUse": False,
            "allowKillVerdict": False,
            "reason": (
                "The source-verified JASS AST is ready. Kill verdict remains disabled until the state/event "
                "simulator supplies cast policy, target population, summons, and round timeline."
            ),
        }

    auxiliary_function_refs = {
        function_name
        for entry in auxiliary_setup_entries
        for function_name in entry["functionRefs"]
    }
    all_reachable_function_refs = all_profile_function_refs | auxiliary_function_refs
    reachable_actions = [
        action for action in actions if action["function"] in all_reachable_function_refs
    ]
    reachable_function_documents = {
        name: function_documents[name] for name in sorted(all_reachable_function_refs)
    }
    referenced_global_names = sorted({
        name
        for document in reachable_function_documents.values()
        for name in referenced_variables(document["body"])
        if name in global_names
    })
    globals_by_name = {item["name"]: item for item in globals_out}
    referenced_globals = [globals_by_name[name] for name in referenced_global_names]

    primitive_definitions = {
        "zL": {
            "kind": "rng_uniform_integer_inclusive",
            "arguments": ["minimum", "maximum"],
            "semantics": "R2I(zK()*(abs(max-min)+1))+min(min,max)",
            "source": function_documents["zL"]["source"],
        },
        "zM": {
            "kind": "rng_uniform_real",
            "arguments": ["minimum", "maximum"],
            "semantics": "min(min,max)+abs(max-min)*zK()",
            "source": function_documents["zM"]["source"],
        },
        "BWE": {
            "kind": "damage_single_wrapper",
            "semantics": "UnitDamageTarget(source,target,zM(low,high)*base,true,false,attackType,damageType,WEAPON_TYPE_WHOKNOWS)",
            "source": function_documents["BWE"]["source"],
        },
        "BWF": {
            "kind": "damage_area_wrapper",
            "semantics": "UnitDamagePointLoc(source,delay,radius,center,zM(low,high)*base,attackType,damageType)",
            "source": function_documents["BWF"]["source"],
        },
        "sc": {
            "kind": "attack_started_registration",
            "semantics": "EVENT_PLAYER_UNIT_ATTACKED via unit rawcode trigger registry",
            "source": function_documents["sc"]["source"],
        },
        "xc": {
            "kind": "spell_effect_registration",
            "semantics": "spell/event namespace and ability rawcode trigger registry",
            "source": function_documents["xc"]["source"],
        },
        "BcF": {
            "kind": "for_each_unit_in_radius",
            "semantics": "GroupEnumUnitsInRangeOfLoc then ForGroup callback",
            "source": function_documents["BcF"]["source"],
        },
        "BDw": {
            "kind": "schedule_fsm_absolute_state",
            "semantics": "set next state and resume current trigger after delay",
            "source": function_documents["BDw"]["source"],
        },
        "BDx": {
            "kind": "schedule_fsm_next_state",
            "semantics": "BDw(instance,delay,HN[instance]+1)",
            "source": function_documents["BDx"]["source"],
        },
        "BDz": {
            "kind": "schedule_fsm_relative_state",
            "semantics": "BDw(instance,delay,HN[instance]+delta)",
            "source": function_documents["BDz"]["source"],
        },
    }

    random_gate_candidates = [
        gate
        for function_name, function_document in reachable_function_documents.items()
        for gate in collect_rng_sites_from_statements(function_name, function_document["body"])
    ]
    random_gates_by_id = {
        gate["rollId"]: gate for gate in random_gate_candidates
    }
    random_gates = [random_gates_by_id[key] for key in sorted(random_gates_by_id)]
    action_kind_counts = dict(sorted(Counter(action["kind"] for action in reachable_actions).items()))
    damage_actions = [action for action in reachable_actions if action["kind"] == "damage"]
    damage_primitive_counts = Counter()
    for action in damage_actions:
        source = action.get("source") or ""
        if "BWE(" in source:
            damage_primitive_counts["BWE"] += 1
        elif "BWF(" in source:
            damage_primitive_counts["BWF"] += 1
        elif "UnitDamagePointLoc(" in source or "UnitDamagePoint(" in source:
            damage_primitive_counts["UnitDamagePointLoc"] += 1
        elif "UnitDamageTarget(" in source:
            damage_primitive_counts["UnitDamageTarget"] += 1
        else:
            damage_primitive_counts["other"] += 1
    spawned_unit_rawcodes, dynamic_ability_rawcodes = enrich_action_rawcodes(
        reachable_actions, global_constant_initializers
    )
    object_catalog = build_object_catalog(
        spawned_unit_rawcodes, dynamic_ability_rawcodes
    )
    object_catalog["validation"]["actorSpawnActionsWithoutResolvedRawcode"] = [
        action["actionId"]
        for action in reachable_actions
        if action["kind"] == "actor_spawn" and not action.get("unitRawcode")
    ]
    semantic_expression_fallbacks = [
        action["actionId"]
        for action in reachable_actions
        if any(node.get("node") == "raw_expression" for node in walk_ast(action))
    ]
    relevant_unresolved_dispatch = [
        item for item in unresolved_dispatch if item["function"] in all_reachable_function_refs
    ]
    unexpected_unresolved_dispatch = [
        item for item in relevant_unresolved_dispatch
        if item["classification"] not in {
            "fsm_current_trigger_self_dispatch",
            "attack_registry_dispatch_by_unit_rawcode",
            "spell_or_event_registry_dispatch_by_rawcode",
            "runtime_trigger_expression",
            "fsm_event_type_dispatch",
            "runtime_event_context_dispatch",
            "runtime_global_trigger_dispatch",
        }
    ]

    validation = deepcopy(base_document["validation"])
    validation.update({
        "functionParseFailures": function_parse_failures,
        "expressionFallbacks": expression_fallbacks,
        "semanticActionExpressionFallbacks": semantic_expression_fallbacks,
        "missingEntryFunctions": sorted(missing_entry_functions),
        "attackEntryPointCountMismatch": len(attack_registration_pairs) != 107,
        "spellEntryPointCountMismatch": len(spell_registration_pairs) != 91,
        "auxiliarySetupEntryPointCountMismatch": len(auxiliary_setup_entries) != 29,
        "duplicateAttackRegistrations": sorted(
            f"{rawcode}:{handler}" for (rawcode, handler), count in Counter(attack_registration_pairs).items() if count > 1
        ),
        "duplicateSpellRegistrations": sorted(
            f"{rawcode}:{handler}" for (rawcode, handler), count in Counter(spell_registration_pairs).items() if count > 1
        ),
        "damageActionsMissingAmountAst": [
            action["actionId"] for action in damage_actions if not action.get("amount", {}).get("expression")
        ],
        "duplicateActionIds": sorted(
            action_id for action_id, count in Counter(
                action["actionId"] for action in reachable_actions
            ).items() if count > 1
        ),
        "damagePrimitiveCountMismatch": (
            dict(sorted(damage_primitive_counts.items()))
            != {"BWE": 385, "BWF": 82, "UnitDamagePointLoc": 166}
        ),
        "unexpectedUnresolvedTriggerDispatch": unexpected_unresolved_dispatch,
        "tooltipNumericMentionsUsedAsAuthority": 0,
        "profilesNotActionAstReady": sorted(
            profile["profileId"] for profile in profiles if profile["profileStatus"] != "verified_action_ast_ready"
        ),
    })
    failures = {
        key: value for key, value in validation.items()
        if value not in ([], {}, False, 0, None)
        and key not in {"profilesAllowingKillVerdict"}
    }
    # profilesAllowingKillVerdict is expected to stay empty.  Every other
    # non-empty validation field is a build failure.
    if failures:
        raise SystemExit(f"action AST validation failed: {json.dumps(failures, ensure_ascii=False)[:12000]}")

    ast_counts = {
        "allParsedFunctions": len(function_documents),
        "reachableFunctions": len(reachable_function_documents),
        "entryPoints": len(all_entry_points) + len(auxiliary_setup_entries),
        "attackEntryPoints": len(attack_registration_pairs),
        "spellEntryPoints": len(spell_registration_pairs),
        "literalSpellEntryPoints": sum(
            item["kind"] == "spell_effect" and item.get("rawcodeBinding") == "literal"
            for item in all_entry_points
        ),
        "globalConstantSpellEntryPoints": sum(
            item["kind"] == "spell_effect" and item.get("rawcodeBinding") == "global_constant"
            for item in all_entry_points
        ),
        "initializationEntryPoints": sum(item["kind"] == "initialization" for item in all_entry_points),
        "auxiliarySetupEntryPoints": len(auxiliary_setup_entries),
        "semanticActions": len(reachable_actions),
        "damageActions": len(damage_actions),
        "damagePrimitiveCounts": dict(sorted(damage_primitive_counts.items())),
        "uniqueAttackHandlers": len({handler for _rawcode, handler in attack_registration_pairs}),
        "uniqueSpellHandlers": len({handler for _rawcode, handler in spell_registration_pairs}),
        "randomGates": len(random_gates),
        "referencedGlobals": len(referenced_globals),
        "spawnedUnitRawcodes": len(object_catalog["units"]),
        "referencedAbilityRawcodes": len(object_catalog["abilities"]),
        "actionKindCounts": action_kind_counts,
    }
    document = deepcopy(base_document)
    document["$schema"] = SCHEMA_OUT.name
    document["schemaVersion"] = "ord-all-upper-skill-profile/2.0-action-ast"
    document["generatedBy"] = "shared_map/build_action_ast.py"
    document["baseArtifact"] = {
        "file": BASE_PATH.name,
        "sha256": base_sha,
        "schemaVersion": base_document["schemaVersion"],
    }
    document["profiles"] = profiles
    document["counts"] = {**base_document["counts"], "actionAst": ast_counts}
    document["globalSimulationPolicy"] = {
        "allowActionAstExecution": True,
        "allowSkillDpsDerivation": True,
        "allowAutomaticManualSkillUse": False,
        "allowKillVerdict": False,
        "reason": "Verified JASS action programs are ready; the round state/event simulator is the remaining integration step.",
    }
    document["actionAst"] = {
        "astVersion": "ord-jass-action-ast/1.0",
        "source": {
            "file": str(JASS_PATH.relative_to(ROOT)),
            "sha256": jass_sha,
            "mapVersion": "2.305C",
        },
        "numericAuthorityPolicy": {
            "authoritative": "JASS expression AST and verified object data only",
            "tooltipNumericMentions": "provenance_and_human_cross_check_only",
            "dpsRule": "Execute the JASS control-flow AST. Do not multiply tooltip trigger probabilities again.",
        },
        "runtimePrimitives": primitive_definitions,
        "globalSymbols": referenced_globals,
        "dispatch": {
            "registrations": dispatch["registrations"],
            "dispatchSites": [
                item for item in dispatch["dispatchSites"] if item["function"] in all_reachable_function_refs
            ],
            "unresolvedDispatchSites": relevant_unresolved_dispatch,
        },
        "rngSites": random_gates,
        "objectData": object_catalog,
        "entryPointAudit": {
            "all": all_entry_points,
            "auxiliarySetup": auxiliary_setup_entries,
            "previouslyUnrepresentedSpellRoots": previously_unrepresented,
        },
        "functions": reachable_function_documents,
        "actions": reachable_actions,
    }
    document["validation"] = validation

    schema = schema_document()
    # The AST is machine-consumed and large; compact JSON keeps the persistent
    # artifact below the direct Library transfer threshold without losing data.
    TARGET.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    SCHEMA_OUT.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    AUDIT_OUT.write_text(build_audit(document, base_sha), encoding="utf-8")
    print(json.dumps({
        "outputs": [str(TARGET), str(SCHEMA_OUT), str(AUDIT_OUT)],
        "counts": document["counts"],
        "validation": validation,
        "previouslyUnrepresentedSpellRoots": previously_unrepresented,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
