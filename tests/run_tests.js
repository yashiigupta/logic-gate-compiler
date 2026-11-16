/**
 * Automated tests for every compiler phase.
 * Run with:   node tests/run_tests.js
 *
 * The compiler files are plain browser scripts, so we load them into one
 * shared sandbox (the same way the browser does with <script> tags).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const files = [
  "src/compiler/lexer.js",
  "src/compiler/parser.js",
  "src/compiler/semantic.js",
  "src/compiler/ir.js",
  "src/compiler/optimizer.js",
  "src/compiler/codegen.js",
  "src/compiler/pipeline.js",
  "src/ui/examples.js",
];
const root = path.join(__dirname, "..");
const source = files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
const C = vm.runInNewContext(
  source + "\n;({ compile, tokenize, formatInstruction, EXAMPLES })", {}
);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✔ " + name); }
  catch (e) { failed++; console.log("  ✘ " + name + "\n      " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const ir = (code) => code.map(C.formatInstruction);

console.log("\nLexical analysis");
test("tokenizes keywords, identifiers and symbols", () => {
  const types = C.tokenize("out = a AND b;").tokens.map((t) => t.type);
  assert(JSON.stringify(types) === JSON.stringify(["IDENTIFIER", "ASSIGN", "IDENTIFIER", "AND", "IDENTIFIER", "SEMICOLON", "EOF"]), types.join(" "));
});
test("keywords are case-insensitive", () => {
  assert(C.tokenize("a and b").tokens[1].type === "AND", "lowercase 'and' not recognised");
});
test("reports invalid character '&'", () => {
  const r = C.compile("INPUT a,b; OUTPUT o; o = a & b;");
  assert(r.status.lexer === "error" && /&/.test(r.errors[0].message), JSON.stringify(r.errors));
});
test("reports invalid constant 2", () => {
  const r = C.compile("OUTPUT o; o = 2;");
  assert(r.status.lexer === "error" && /constant '2'/.test(r.errors[0].message), JSON.stringify(r.errors));
});

console.log("\nSyntax analysis");
test("respects precedence NOT > AND > XOR > OR", () => {
  const r = C.compile("INPUT a,b,c; OUTPUT o; o = a OR b AND NOT c;");
  const e = r.ast.body[2].expr;
  assert(e.op === "OR" && e.right.op === "AND" && e.right.right.op === "NOT", JSON.stringify(e));
});
test("reports missing ')' and recovers to find a second error", () => {
  const r = C.compile("INPUT a,b; OUTPUT o,y; o = (a AND b; y = a OR ;");
  assert(r.status.parser === "error" && r.errors.length === 2, JSON.stringify(r.errors));
});

console.log("\nSemantic analysis");
test("undefined signal", () => {
  const r = C.compile("INPUT a; OUTPUT o; o = a AND c;");
  assert(r.errors.some((e) => /Undefined signal 'c'/.test(e.message)), JSON.stringify(r.errors));
});
test("output assigned twice", () => {
  const r = C.compile("INPUT a,b; OUTPUT o; o = a; o = b;");
  assert(r.errors.some((e) => /assigned twice/.test(e.message)), JSON.stringify(r.errors));
});
test("assignment to input", () => {
  const r = C.compile("INPUT a; OUTPUT o; a = 1; o = a;");
  assert(r.errors.some((e) => /because it is an INPUT/.test(e.message)), JSON.stringify(r.errors));
});
test("output never assigned", () => {
  const r = C.compile("INPUT a; OUTPUT o, p; o = a;");
  assert(r.errors.some((e) => /'p' is declared but never assigned/.test(e.message)), JSON.stringify(r.errors));
});
test("use before assignment", () => {
  const r = C.compile("INPUT a; OUTPUT o; o = w; w = a;");
  assert(r.errors.some((e) => /Undefined signal 'w'/.test(e.message)), JSON.stringify(r.errors));
});

console.log("\nIR generation");
test("generates three-address code", () => {
  const r = C.compile("INPUT a,b,c; OUTPUT out; out = (a AND b) OR NOT c;");
  assert(JSON.stringify(ir(r.ir)) === JSON.stringify(["t1 = a AND b", "t2 = NOT c", "out = t1 OR t2"]), ir(r.ir).join(" | "));
});

console.log("\nOptimization");
test("double negation + identity: y = NOT NOT a AND 1  →  y = a", () => {
  const r = C.compile("INPUT a; OUTPUT y; y = NOT NOT a AND 1;");
  assert(JSON.stringify(ir(r.optimized)) === JSON.stringify(["y = a"]), ir(r.optimized).join(" | "));
});
test("common sub-expression + dead code", () => {
  const r = C.compile("INPUT a,b; OUTPUT z; z = (a AND b) OR (a AND b) OR 0; u = a XOR b;");
  assert(r.output.stats.gatesAfter === 1, ir(r.optimized).join(" | "));
});
test("constant folding: o = 1 AND 0  →  o = 0", () => {
  const r = C.compile("OUTPUT o; o = 1 AND 0;");
  assert(JSON.stringify(ir(r.optimized)) === JSON.stringify(["o = 0"]), ir(r.optimized).join(" | "));
});

console.log("\nCode generation");
test("half adder truth table is correct", () => {
  const r = C.compile("INPUT a,b; OUTPUT sum,carry; sum = a XOR b; carry = a AND b;");
  const rows = r.output.truthTable.rows.map((x) => x.inputs.join("") + ":" + x.outputs.join(""));
  assert(JSON.stringify(rows) === JSON.stringify(["00:00", "01:10", "10:10", "11:01"]), rows.join(" "));
});
test("generates a Verilog module", () => {
  const r = C.compile("INPUT a,b; OUTPUT o; o = a NAND b;");
  assert(/module circuit\(input a, input b, output o\);/.test(r.output.verilog) && /assign o = ~\(a & b\);/.test(r.output.verilog), r.output.verilog);
});

console.log("\nAll examples");
for (const ex of C.EXAMPLES) {
  test(ex.name, () => {
    const r = C.compile(ex.code);
    const shouldFail = ex.name.startsWith("❌");
    assert(shouldFail ? r.errors.length > 0 : r.errors.length === 0, JSON.stringify(r.errors));
    if (!shouldFail) assert(r.output.truthTable.equivalent, "optimized circuit is not equivalent!");
  });
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
