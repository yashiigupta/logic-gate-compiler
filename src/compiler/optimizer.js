/**
 * PHASE 5 — CODE OPTIMIZATION
 * ---------------------------------------------------------------
 * Input : three-address code (TAC)
 * Output: smaller, equivalent TAC  +  a log explaining every change
 *
 * Three classic passes run repeatedly until nothing changes (fixed point):
 *
 *  1. Constant folding, algebraic simplification & copy propagation
 *       t1 = 1 AND 0      →  0              (constant folding)
 *       x AND 1           →  x              (identity law)
 *       x AND 0           →  0              (annihilator law)
 *       x OR x            →  x              (idempotent law)
 *       x XOR x           →  0
 *       NOT (NOT x)       →  x              (double negation)
 *       t1 = a ; y = t1   →  y = a          (copy propagation)
 *
 *  2. Common sub-expression elimination (CSE)
 *       t1 = a AND b ; t2 = a AND b   →  t2 is replaced by t1
 *
 *  3. Dead code elimination (DCE)
 *       instructions whose result never reaches an OUTPUT are removed
 *
 * Fewer instructions = fewer logic gates in the final circuit.
 */

const isConstant = (arg) => arg === "0" || arg === "1";
const COMMUTATIVE = ["AND", "OR", "XOR", "NAND", "NOR"];

function optimize(code, outputNames) {
  const outputs = new Set(outputNames);
  let current = code.map((i) => ({ ...i, args: [...i.args] }));
  const log = [];

  const passes = [
    { name: "Constant folding & simplification", run: foldAndSimplify },
    { name: "Common sub-expression elimination", run: eliminateCommonSubexpressions },
    { name: "Dead code elimination", run: eliminateDeadCode },
  ];

  let changed = true;
  let round = 0;
  while (changed && round < 10) {
    changed = false;
    round++;
    for (const pass of passes) {
      const result = pass.run(current, outputs);
      current = result.code;
      if (result.log.length) {
        changed = true;
        result.log.forEach((message) => log.push({ round, pass: pass.name, message }));
      }
    }
  }
  return { code: current, log };
}

/* ---------- Pass 1: constant folding + algebraic laws + copy propagation ---------- */

// Returns a simplified form of (op, args) and the reason, if any rule applied.
function simplify(op, args, definitions) {
  if (op === "COPY") return { op, args };

  if (args.every(isConstant)) {
    const value = evaluateOp(op, args.map(Number));
    return { op: "COPY", args: [String(value)], reason: "constant folding" };
  }

  if (op === "NOT") {
    const def = definitions[args[0]];
    if (def && def.op === "NOT") return { op: "COPY", args: [def.args[0]], reason: "double negation: NOT NOT x = x" };
    return { op, args };
  }

  const [x, y] = args;

  // Same operand on both sides
  if (x === y) {
    if (op === "AND" || op === "OR") return { op: "COPY", args: [x], reason: `idempotent law: x ${op} x = x` };
    if (op === "XOR") return { op: "COPY", args: ["0"], reason: "x XOR x = 0" };
    return withNot(x, `x ${op} x = NOT x`, definitions);
  }

  // One constant operand
  const c = isConstant(x) ? x : isConstant(y) ? y : null;
  if (c === null) return { op, args };
  const v = c === x ? y : x;

  const rules = {
    AND:  { 0: ["COPY", "0", "annihilator law: x AND 0 = 0"], 1: ["COPY", v, "identity law: x AND 1 = x"] },
    OR:   { 1: ["COPY", "1", "annihilator law: x OR 1 = 1"],  0: ["COPY", v, "identity law: x OR 0 = x"] },
    XOR:  { 0: ["COPY", v, "x XOR 0 = x"],                   1: ["NOT", v, "x XOR 1 = NOT x"] },
    NAND: { 0: ["COPY", "1", "x NAND 0 = 1"],                1: ["NOT", v, "x NAND 1 = NOT x"] },
    NOR:  { 1: ["COPY", "0", "x NOR 1 = 0"],                 0: ["NOT", v, "x NOR 0 = NOT x"] },
  };
  const [newOp, arg, reason] = rules[op][c];
  if (newOp === "NOT") return withNot(arg, reason, definitions);
  return { op: newOp, args: [arg], reason };
}

// Build "NOT x", but collapse it if x is itself "NOT y".
function withNot(x, reason, definitions) {
  const inner = simplify("NOT", [x], definitions);
  if (inner.reason) return { ...inner, reason: `${reason}, then ${inner.reason}` };
  return { op: "NOT", args: [x], reason };
}

function foldAndSimplify(code, outputs) {
  const alias = {};       // removed name → value that replaces it
  const definitions = {}; // name → instruction that defines it
  const result = [];
  const log = [];

  for (const instr of code) {
    const args = instr.args.map((a) => alias[a] ?? a);
    const s = simplify(instr.op, args, definitions);
    const updated = { dest: instr.dest, op: s.op, args: s.args };

    // Copy propagation: a temporary/wire that is just a copy disappears.
    if (updated.op === "COPY" && !outputs.has(instr.dest)) {
      alias[instr.dest] = updated.args[0];
      log.push(`${formatInstruction(instr)}  ⟶  removed, uses of ${instr.dest} replaced by ${updated.args[0]}` +
        (s.reason ? ` (${s.reason})` : " (copy propagation)"));
      continue;
    }

    const before = formatInstruction(instr);
    const after = formatInstruction(updated);
    if (before !== after) {
      log.push(`${before}  ⟶  ${after}` + (s.reason ? ` (${s.reason})` : " (propagated)"));
    }
    definitions[updated.dest] = updated;
    result.push(updated);
  }
  return { code: result, log };
}

/* ---------- Pass 2: common sub-expression elimination ---------- */

function eliminateCommonSubexpressions(code, outputs) {
  const seen = {};  // "AND:a,b" → name that already holds this value
  const alias = {};
  const result = [];
  const log = [];

  for (const instr of code) {
    const args = instr.args.map((a) => alias[a] ?? a);
    const updated = { dest: instr.dest, op: instr.op, args };
    if (instr.op === "COPY") { result.push(updated); continue; }

    const operands = COMMUTATIVE.includes(instr.op) ? [...args].sort() : args;
    const key = `${instr.op}:${operands.join(",")}`;

    if (seen[key]) {
      if (outputs.has(instr.dest)) {
        result.push({ dest: instr.dest, op: "COPY", args: [seen[key]] });
        log.push(`${formatInstruction(updated)}  ⟶  ${instr.dest} = ${seen[key]} (already computed)`);
      } else {
        alias[instr.dest] = seen[key];
        log.push(`${formatInstruction(updated)}  ⟶  removed, reuse ${seen[key]} (already computed)`);
      }
      continue;
    }
    seen[key] = instr.dest;
    result.push(updated);
  }
  return { code: result, log };
}

/* ---------- Pass 3: dead code elimination ---------- */

function eliminateDeadCode(code, outputs) {
  const live = new Set(outputs);
  const kept = [];
  const log = [];

  // Walk backwards: an instruction is needed only if its result is used later.
  for (let k = code.length - 1; k >= 0; k--) {
    const instr = code[k];
    if (outputs.has(instr.dest) || live.has(instr.dest)) {
      kept.unshift(instr);
      instr.args.forEach((a) => { if (!isConstant(a)) live.add(a); });
    } else {
      log.push(`${formatInstruction(instr)}  ⟶  removed (result is never used)`);
    }
  }
  return { code: kept, log };
}
