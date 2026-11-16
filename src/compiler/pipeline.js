/**
 * COMPILER PIPELINE (the "driver")
 * ---------------------------------------------------------------
 * Runs the six phases in order and collects the output of each one:
 *
 *   source ─► [1 Lexer] ─► tokens ─► [2 Parser] ─► AST ─► [3 Semantic] ─► symbol table
 *          ─► [4 IR Gen] ─► TAC ─► [5 Optimizer] ─► optimized TAC ─► [6 Code Gen] ─► Verilog,
 *                                                                     truth table, circuit
 *
 * If a phase reports errors, compilation stops there and later phases
 * are marked as "skipped" — exactly like a real compiler.
 */

const PHASES = [
  { id: "lexer",     name: "Lexical Analysis" },
  { id: "parser",    name: "Syntax Analysis" },
  { id: "semantic",  name: "Semantic Analysis" },
  { id: "ir",        name: "IR Generation" },
  { id: "optimizer", name: "Optimization" },
  { id: "codegen",   name: "Code Generation" },
];

function compile(source) {
  const result = {
    status: {},          // phase id → "ok" | "error" | "skipped"
    errors: [],
    warnings: [],
    tokens: [],
    ast: null,
    symbols: [],
    ir: [],
    optimized: [],
    optimizationLog: [],
    output: null,        // code generation result
  };

  const stopAt = (phaseId, errors) => {
    result.errors = errors;
    let reached = false;
    for (const p of PHASES) {
      if (p.id === phaseId) { result.status[p.id] = "error"; reached = true; }
      else if (reached) result.status[p.id] = "skipped";
    }
    return result;
  };

  // Phase 1 — Lexical analysis
  const lex = tokenize(source);
  result.tokens = lex.tokens;
  if (lex.errors.length) return stopAt("lexer", lex.errors);
  result.status.lexer = "ok";

  // Phase 2 — Syntax analysis
  const parsed = parse(lex.tokens);
  result.ast = parsed.ast;
  if (parsed.errors.length) return stopAt("parser", parsed.errors);
  result.status.parser = "ok";

  // Phase 3 — Semantic analysis
  const sem = analyze(parsed.ast);
  result.symbols = sem.symbols;
  result.warnings = sem.warnings;
  if (sem.errors.length) return stopAt("semantic", sem.errors);
  result.status.semantic = "ok";

  // Phase 4 — Intermediate code generation
  result.ir = generateIR(parsed.ast);
  result.status.ir = "ok";

  // Phase 5 — Optimization
  const outputNames = sem.symbols.filter((s) => s.kind === "output").map((s) => s.name);
  const opt = optimize(result.ir, outputNames);
  result.optimized = opt.code;
  result.optimizationLog = opt.log;
  result.status.optimizer = "ok";

  // Phase 6 — Code generation
  result.output = generateCode(result.ir, result.optimized, sem.symbols);
  result.status.codegen = "ok";

  return result;
}
