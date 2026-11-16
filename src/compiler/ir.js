/**
 * PHASE 4 — INTERMEDIATE CODE GENERATION
 * ---------------------------------------------------------------
 * Input : AST (already checked by the semantic analyser)
 * Output: THREE-ADDRESS CODE (TAC)
 *
 * Every instruction has at most one operator and three "addresses":
 *
 *     out = (a AND b) OR NOT c;
 *
 *  becomes
 *
 *     t1 = a AND b
 *     t2 = NOT c
 *     out = t1 OR t2
 *
 * Each instruction is stored as an object:  { dest, op, args }
 *   op   : AND | OR | XOR | NAND | NOR | NOT | COPY
 *   args : signal names, temporaries (t1, t2...) or constants "0"/"1"
 *
 * This file also contains a tiny IR INTERPRETER (runIR) which executes the
 * TAC. It is used to build the truth table and to prove that the optimizer
 * did not change the meaning of the program.
 */

function generateIR(ast) {
  const code = [];
  let tempCount = 0;
  const newTemp = () => `t${++tempCount}`;

  // Generates code for an expression and returns the name holding its value.
  // If `dest` is given, the final result is written directly into `dest`.
  function gen(expr, dest) {
    switch (expr.kind) {
      case "Identifier":
      case "Constant": {
        const value = expr.kind === "Identifier" ? expr.name : String(expr.value);
        if (!dest) return value;
        code.push({ dest, op: "COPY", args: [value] });
        return dest;
      }
      case "UnaryOp": {
        const a = gen(expr.operand);
        const d = dest || newTemp();
        code.push({ dest: d, op: "NOT", args: [a] });
        return d;
      }
      case "BinaryOp": {
        const left = gen(expr.left);
        const right = gen(expr.right);
        const d = dest || newTemp();
        code.push({ dest: d, op: expr.op, args: [left, right] });
        return d;
      }
    }
  }

  for (const stmt of ast.body) {
    if (stmt.kind === "Assignment") gen(stmt.expr, stmt.target.name);
  }
  return code;
}

// Pretty-print one instruction, e.g. "t1 = a AND b"
function formatInstruction(i) {
  if (i.op === "COPY") return `${i.dest} = ${i.args[0]}`;
  if (i.op === "NOT") return `${i.dest} = NOT ${i.args[0]}`;
  return `${i.dest} = ${i.args[0]} ${i.op} ${i.args[1]}`;
}

// Truth function of every operator.
function evaluateOp(op, [a, b]) {
  switch (op) {
    case "COPY": return a;
    case "NOT":  return a ? 0 : 1;
    case "AND":  return a & b;
    case "OR":   return a | b;
    case "XOR":  return a ^ b;
    case "NAND": return (a & b) ? 0 : 1;
    case "NOR":  return (a | b) ? 0 : 1;
  }
}

// Execute TAC for one set of input values, e.g. { a: 1, b: 0 }.
function runIR(code, inputValues) {
  const env = { ...inputValues };
  const valueOf = (arg) => (arg === "0" ? 0 : arg === "1" ? 1 : env[arg]);
  for (const i of code) env[i.dest] = evaluateOp(i.op, i.args.map(valueOf));
  return env;
}
