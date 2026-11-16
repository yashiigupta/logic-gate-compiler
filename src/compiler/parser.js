/**
 * PHASE 2 — SYNTAX ANALYSIS (Parsing)
 * ---------------------------------------------------------------
 * Input : list of tokens (from the lexer)
 * Output: Abstract Syntax Tree (AST)  +  list of syntax errors
 *
 * Technique: RECURSIVE DESCENT parsing — one function per grammar rule.
 *
 * Grammar (lowest precedence at the top, highest at the bottom):
 *
 *   program      → ( declaration | assignment )* EOF
 *   declaration  → ( INPUT | OUTPUT ) IDENTIFIER ( "," IDENTIFIER )* ";"
 *   assignment   → IDENTIFIER "=" or_expr ";"
 *   or_expr      → xor_expr  ( ( OR  | NOR  ) xor_expr )*
 *   xor_expr     → and_expr  ( XOR and_expr )*
 *   and_expr     → not_expr  ( ( AND | NAND ) not_expr )*
 *   not_expr     → NOT not_expr | primary
 *   primary      → IDENTIFIER | CONSTANT | "(" or_expr ")"
 *
 * Operator precedence:  NOT  >  AND/NAND  >  XOR  >  OR/NOR
 *
 * Error recovery ("panic mode"): when a statement has a syntax error we
 * record it, skip tokens up to the next ";" and continue parsing, so the
 * user sees ALL syntax errors at once.
 */

function parse(tokens) {
  let pos = 0;
  const errors = [];

  // ---------- helpers ----------
  const peek = () => tokens[pos];
  const check = (...types) => types.includes(peek().type);
  const advance = () => (peek().type === "EOF" ? peek() : tokens[pos++]);

  function describe(token) {
    return token.type === "EOF" ? "end of input" : `'${token.value}'`;
  }

  function syntaxError(message, token = peek()) {
    return { isSyntaxError: true, phase: "Syntax", message, line: token.line, col: token.col };
  }

  function expect(type, what) {
    if (check(type)) return advance();
    throw syntaxError(`Expected ${what} but found ${describe(peek())}`);
  }

  // Panic-mode recovery: skip to the end of the broken statement.
  function synchronize() {
    while (!check("SEMICOLON", "EOF")) advance();
    if (check("SEMICOLON")) advance();
  }

  // ---------- grammar rules ----------

  // program → ( declaration | assignment )* EOF
  function parseProgram() {
    const body = [];
    while (!check("EOF")) {
      try {
        body.push(parseStatement());
      } catch (e) {
        if (!e.isSyntaxError) throw e;
        delete e.isSyntaxError;
        errors.push(e);
        synchronize();
      }
    }
    return { kind: "Program", body };
  }

  function parseStatement() {
    if (check("INPUT", "OUTPUT")) return parseDeclaration();
    if (check("IDENTIFIER")) return parseAssignment();
    throw syntaxError(`Expected INPUT, OUTPUT or an assignment but found ${describe(peek())}`);
  }

  // declaration → (INPUT | OUTPUT) IDENTIFIER ("," IDENTIFIER)* ";"
  function parseDeclaration() {
    const keyword = advance();
    const names = [parseName()];
    while (check("COMMA")) {
      advance();
      names.push(parseName());
    }
    expect("SEMICOLON", "';' after declaration");
    return {
      kind: "Declaration",
      role: keyword.type.toLowerCase(), // "input" | "output"
      names,
      line: keyword.line,
      col: keyword.col,
    };
  }

  function parseName() {
    const t = expect("IDENTIFIER", "a signal name");
    return { name: t.value, line: t.line, col: t.col };
  }

  // assignment → IDENTIFIER "=" or_expr ";"
  function parseAssignment() {
    const target = parseName();
    expect("ASSIGN", "'='");
    const expr = parseOr();
    expect("SEMICOLON", "';' at end of statement");
    return { kind: "Assignment", target, expr, line: target.line, col: target.col };
  }

  // Builds one binary-operator level:  next ( op next )*   (left-associative)
  function binaryLevel(next, operators) {
    return function () {
      let left = next();
      while (check(...operators)) {
        const op = advance();
        const right = next();
        left = { kind: "BinaryOp", op: op.type, left, right, line: op.line, col: op.col };
      }
      return left;
    };
  }

  // not_expr → NOT not_expr | primary
  function parseNot() {
    if (check("NOT")) {
      const op = advance();
      return { kind: "UnaryOp", op: "NOT", operand: parseNot(), line: op.line, col: op.col };
    }
    return parsePrimary();
  }

  // primary → IDENTIFIER | CONSTANT | "(" or_expr ")"
  function parsePrimary() {
    const t = peek();
    if (check("IDENTIFIER")) {
      advance();
      return { kind: "Identifier", name: t.value, line: t.line, col: t.col };
    }
    if (check("CONSTANT")) {
      advance();
      return { kind: "Constant", value: Number(t.value), line: t.line, col: t.col };
    }
    if (check("LPAREN")) {
      advance();
      const expr = parseOr();
      expect("RPAREN", "')'");
      return expr;
    }
    throw syntaxError(`Expected a signal, 0, 1 or '(' but found ${describe(t)}`);
  }

  const parseAnd = binaryLevel(parseNot, ["AND", "NAND"]);
  const parseXor = binaryLevel(parseAnd, ["XOR"]);
  const parseOr = binaryLevel(parseXor, ["OR", "NOR"]);

  const ast = parseProgram();
  return { ast, errors };
}
