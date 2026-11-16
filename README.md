# ⚡ Logic Gate Compiler

A compiler for a small **boolean logic language**. You write a circuit as equations
(`out = (a AND b) OR NOT c;`). The compiler runs all six classic compiler phases and
shows the output of each one live in the browser: tokens, parse tree, symbol table,
three-address code, optimized code, **Verilog** target code, a **truth table** and a
**circuit diagram**.

---

## 🚀 Quick start

No installation or build step is needed. The app is plain HTML + JavaScript.

```bash
git clone <this-repo-url>
cd logic-gate-compiler
# Option 1: open index.html in any modern browser (double-click it)
# Option 2: serve it locally
python3 -m http.server 8000      # then open http://localhost:8000
```

**Run the automated tests** (requires Node.js 16+):

```bash
node tests/run_tests.js
```

**Deploy:** on GitHub, open *Settings → Pages* and set the source to the `main` branch, root folder.
The compiler will be live at `https://<username>.github.io/<repo-name>/`.

---

## ✍️ The language

```text
# Full adder
INPUT a, b, cin;            # declare inputs
OUTPUT sum, cout;           # declare outputs

p    = a XOR b;             # internal wire (auto-declared on assignment)
sum  = p XOR cin;
cout = (a AND b) OR (p AND cin);
```

| Feature | Syntax |
|---|---|
| Operators | `NOT`, `AND`, `NAND`, `XOR`, `OR`, `NOR` (case-insensitive) |
| Precedence (high → low) | `NOT` → `AND`/`NAND` → `XOR` → `OR`/`NOR` |
| Constants | `0`, `1` |
| Grouping | `( ... )` |
| Comments | `# ...` or `// ...` |

### Grammar (EBNF)

```
program      → ( declaration | assignment )* EOF
declaration  → ( INPUT | OUTPUT ) IDENTIFIER ( "," IDENTIFIER )* ";"
assignment   → IDENTIFIER "=" or_expr ";"
or_expr      → xor_expr ( ( OR | NOR ) xor_expr )*
xor_expr     → and_expr ( XOR and_expr )*
and_expr     → not_expr ( ( AND | NAND ) not_expr )*
not_expr     → NOT not_expr | primary
primary      → IDENTIFIER | CONSTANT | "(" or_expr ")"
```

---

## 🏗️ Architecture: the compiler pipeline

```
 source code
     │
     ▼
 ┌──────────────────────┐   tokens
 │ 1. Lexical Analysis  │───────────────►  Tokens table
 └──────────────────────┘
     ▼
 ┌──────────────────────┐   AST
 │ 2. Syntax Analysis   │───────────────►  Parse tree diagram
 └──────────────────────┘
     ▼
 ┌──────────────────────┐   symbol table
 │ 3. Semantic Analysis │───────────────►  Symbol table
 └──────────────────────┘
     ▼
 ┌──────────────────────┐   three-address code
 │ 4. IR Generation     │───────────────►  TAC listing
 └──────────────────────┘
     ▼
 ┌──────────────────────┐   optimized TAC
 │ 5. Optimization      │───────────────►  Before/after + change log
 └──────────────────────┘
     ▼
 ┌──────────────────────┐
 │ 6. Code Generation   │───────────────►  Verilog · Truth table · Circuit
 └──────────────────────┘
```

If a phase finds errors, compilation **stops at that phase**. The later phases are
marked *skipped*, just like in a real compiler.

| # | Phase | File | Input → Output | Key idea |
|---|---|---|---|---|
| 1 | Lexical | `src/compiler/lexer.js` | text → tokens | Character-by-character scanner |
| 2 | Syntax | `src/compiler/parser.js` | tokens → AST | Recursive-descent parser, panic-mode error recovery |
| 3 | Semantic | `src/compiler/semantic.js` | AST → symbol table | Scope/definition and assignment checks |
| 4 | IR | `src/compiler/ir.js` | AST → TAC | Post-order tree walk, temporaries `t1, t2…` |
| 5 | Optimization | `src/compiler/optimizer.js` | TAC → smaller TAC | Folding, algebraic laws, CSE, dead-code elimination |
| 6 | Code gen | `src/compiler/codegen.js` | TAC → Verilog + truth table | IR interpreter proves optimized == original |
| – | Driver | `src/compiler/pipeline.js` | runs phases 1–6 | Stops at the first failing phase |

---

## 🛡️ Error handling (edge cases)

| Phase | Error | Example |
|---|---|---|
| Lexical | Unknown character (with a hint) | `a & b` → *Unexpected character '&' (did you mean AND?)* |
| Lexical | Invalid constant | `x = 2;` |
| Syntax | Missing bracket / operand / semicolon | `out = (a AND b;` · `y = a OR ;` |
| Syntax | Reports **all** errors (panic-mode recovery) | two broken lines → two errors |
| Semantic | Undefined signal | `out = a AND c;` (c never declared) |
| Semantic | Used before assignment | `o = w; w = a;` |
| Semantic | Output assigned twice | `out = a; out = b;` |
| Semantic | Assignment to an input | `a = 1;` |
| Semantic | Output never assigned | `OUTPUT y;` with no `y = ...` |
| Semantic | Duplicate declaration, reserved names (`t1`, `module`…) | `INPUT a, a;` |
| Semantic (warning) | Unused input / unused wire | `unused = a XOR b;` |

Every message includes the **line and column** of the error.

---

## ✂️ Optimizations

| Rule | Before | After |
|---|---|---|
| Constant folding | `t1 = 1 AND 0` | `t1 = 0` |
| Identity law | `x AND 1`, `x OR 0`, `x XOR 0` | `x` |
| Annihilator law | `x AND 0` / `x OR 1` | `0` / `1` |
| Idempotent law | `x AND x`, `x OR x` | `x` |
| Self-XOR | `x XOR x` | `0` |
| Double negation | `NOT NOT x` | `x` |
| Copy propagation | `t1 = a; y = t1 AND b` | `y = a AND b` |
| Common sub-expression elimination | `t1 = a AND b; t2 = b AND a` | reuse `t1` |
| Dead code elimination | results that never reach an output | removed |

The passes repeat until nothing changes. **Correctness check:** the truth table is
computed from both the original and the optimized IR, and the UI confirms that they are
identical on every row.

---

## 📁 Project structure

```
logic-gate-compiler/
├── index.html              # Entry point: open this in a browser
├── README.md
├── src/
│   ├── compiler/           # The compiler (no UI code in here)
│   │   ├── lexer.js        # Phase 1: Lexical analysis
│   │   ├── parser.js       # Phase 2: Syntax analysis (AST)
│   │   ├── semantic.js     # Phase 3: Semantic analysis (symbol table)
│   │   ├── ir.js           # Phase 4: Three-address code + IR interpreter
│   │   ├── optimizer.js    # Phase 5: Optimization passes
│   │   ├── codegen.js      # Phase 6: Verilog, truth table, gate count
│   │   └── pipeline.js     # Runs all phases in order
│   └── ui/                 # The interactive visualizer
│       ├── app.js          # Wires the editor to the compiler, renders tabs
│       ├── diagrams.js     # SVG parse tree + circuit diagram
│       ├── examples.js     # Sample programs (valid + error cases)
│       └── style.css
├── tests/
│   └── run_tests.js        # 25 automated tests covering every phase
└── docs/
    └── viva-notes.md       # Quick explanation of each phase for the viva
```

---

## ✨ Features

- Live compilation as you type (or press **Ctrl/Cmd + Enter**)
- Pipeline bar showing ✔ / ✘ / skipped for each of the six phases
- 8 built-in examples: half adder, full adder, multiplexer, optimization demo, and one example for each error type
- Separate tabs for tokens, parse tree, symbol table, IR, optimized IR, Verilog, truth table and circuit
- Automatic proof that the optimized circuit is equivalent to the original

## 🔭 Future scope

- More target languages (VHDL, C, a gate-level netlist)
- Karnaugh-map / Quine–McCluskey minimisation for globally optimal circuits
- Multi-bit buses (`INPUT [3:0] a`) and sequential logic (flip-flops, clocks)
- Interactive circuit simulation (toggle inputs and watch signals propagate)

## 👥 Team & contributions

| Member | Modules implemented |
|---|---|
| _Name 1_ | _e.g. Lexer, Parser_ |
| _Name 2_ | _e.g. Semantic analysis, IR generation_ |
| _Name 3_ | _e.g. Optimizer, Code generation_ |
| _Name 4_ | _e.g. UI, visualizations, report_ |
