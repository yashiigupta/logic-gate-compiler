/**
 * PHASE 3 — SEMANTIC ANALYSIS
 * ---------------------------------------------------------------
 * Input : AST (from the parser)
 * Output: SYMBOL TABLE  +  semantic errors  +  warnings
 *
 * The parser only checks that the program is *shaped* correctly.
 * The semantic analyser checks that it *makes sense* ("is this allowed?").
 *
 * Symbol table: one entry per signal
 *   kind      : input | output | wire (wire = internal signal, created on assignment)
 *   type      : always 1-bit (boolean)
 *   declared  : line where it was declared / first assigned
 *   assigned  : line where it receives its value
 *   used at   : lines where it is read
 *
 * Semantic errors detected:
 *   1. Undefined signal used in an expression
 *   2. Signal used before it is assigned
 *   3. Output (or wire) assigned twice
 *   4. Assigning a value to an INPUT
 *   5. Duplicate declaration
 *   6. Declared OUTPUT never assigned
 *   7. Program with no OUTPUT
 *   8. Names reserved for compiler temporaries (t1, t2...) or the target language
 *
 * Warnings: unused inputs, unused wires.
 */

const TEMP_NAME = /^t\d+$/;
const TARGET_RESERVED = ["module", "endmodule", "wire", "assign", "reg", "begin", "end", "always"];

function analyze(ast) {
  const symbols = new Map();
  const errors = [];
  const warnings = [];

  const error = (message, node) =>
    errors.push({ phase: "Semantic", message, line: node.line, col: node.col });
  const warn = (message, line) =>
    warnings.push({ phase: "Semantic", message, line, col: 1 });

  function checkName(n) {
    if (TEMP_NAME.test(n.name)) {
      error(`'${n.name}' is reserved for compiler temporaries (t1, t2, ...)`, n);
    } else if (TARGET_RESERVED.includes(n.name.toLowerCase())) {
      error(`'${n.name}' is a reserved word in the target language (Verilog)`, n);
    }
  }

  function addSymbol(n, kind) {
    const symbol = { name: n.name, kind, type: "bit", declaredAt: n.line, assignedAt: null, usedAt: [] };
    symbols.set(n.name, symbol);
    return symbol;
  }

  // Check every signal read inside an expression.
  function checkExpression(expr) {
    switch (expr.kind) {
      case "Identifier": {
        const s = symbols.get(expr.name);
        if (!s) {
          error(`Undefined signal '${expr.name}' (declare it with INPUT or assign it first)`, expr);
        } else if (s.kind !== "input" && s.assignedAt === null) {
          error(`'${expr.name}' is used before it is assigned`, expr);
        } else {
          s.usedAt.push(expr.line);
        }
        break;
      }
      case "UnaryOp":
        checkExpression(expr.operand);
        break;
      case "BinaryOp":
        checkExpression(expr.left);
        checkExpression(expr.right);
        break;
      case "Constant":
        break;
    }
  }

  // Walk the program statement by statement (order matters!).
  for (const stmt of ast.body) {
    if (stmt.kind === "Declaration") {
      for (const n of stmt.names) {
        checkName(n);
        const existing = symbols.get(n.name);
        if (existing) error(`'${n.name}' is already declared (line ${existing.declaredAt})`, n);
        else addSymbol(n, stmt.role);
      }
    }

    if (stmt.kind === "Assignment") {
      checkExpression(stmt.expr); // right side first: "x = x AND a" is an error
      const t = stmt.target;
      let s = symbols.get(t.name);
      if (!s) {
        checkName(t);
        s = addSymbol(t, "wire"); // undeclared target becomes an internal wire
      }

      if (s.kind === "input") {
        error(`Cannot assign to '${t.name}' because it is an INPUT`, t);
      } else if (s.assignedAt !== null) {
        error(`'${t.name}' is assigned twice (first assigned at line ${s.assignedAt})`, t);
      } else {
        s.assignedAt = t.line;
      }
    }
  }

  // Whole-program checks
  const all = [...symbols.values()];
  if (!all.some((s) => s.kind === "output")) {
    error("Program must declare at least one OUTPUT", { line: 1, col: 1 });
  }
  for (const s of all) {
    if (s.kind === "output" && s.assignedAt === null) {
      error(`Output '${s.name}' is declared but never assigned`, { line: s.declaredAt, col: 1 });
    }
    if (s.kind === "input" && s.usedAt.length === 0) {
      warn(`Input '${s.name}' is declared but never used`, s.declaredAt);
    }
    if (s.kind === "wire" && s.usedAt.length === 0) {
      warn(`Wire '${s.name}' is computed but never used (the optimizer will remove it)`, s.declaredAt);
    }
  }

  return { symbols: all, errors, warnings };
}
