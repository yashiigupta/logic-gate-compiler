/**
 * User interface: connects the editor to the compiler pipeline and
 * renders the output of every phase in its own tab.
 */

const $ = (id) => document.getElementById(id);
let lastResult = null;
let activeTab = "tokens";

// Which tab shows each phase, and which phase each tab belongs to.
const PHASE_TAB = { lexer: "tokens", parser: "ast", semantic: "symbols", ir: "ir", optimizer: "optimized", codegen: "target" };
const TAB_PHASE = { tokens: "lexer", ast: "parser", symbols: "semantic", ir: "ir", optimized: "optimizer", target: "codegen", truth: "codegen", circuit: "codegen" };

/* ---------------- setup ---------------- */

function init() {
  EXAMPLES.forEach((ex, i) => $("examples").add(new Option(ex.name, i)));
  $("examples").onchange = () => { $("source").value = EXAMPLES[$("examples").value].code; run(); };
  $("compileBtn").onclick = run;

  let timer;
  $("source").oninput = () => { clearTimeout(timer); timer = setTimeout(run, 400); };
  $("source").onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); };

  document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

  $("source").value = EXAMPLES[0].code;
  run();
}

function run() {
  lastResult = compile($("source").value);
  renderPipeline(lastResult);
  renderMessages(lastResult);
  showTab(activeTab);
}

/* ---------------- pipeline + messages ---------------- */

function renderPipeline(r) {
  $("pipeline").innerHTML = PHASES.map((p, i) => {
    const s = r.status[p.id] || "skipped";
    const icon = s === "ok" ? "✔" : s === "error" ? "✘" : "–";
    return `<button class="chip ${s}" data-tab="${PHASE_TAB[p.id]}">${icon} ${i + 1}. ${p.name}</button>` +
           (i < PHASES.length - 1 ? `<span class="arrow">→</span>` : "");
  }).join("");
  $("pipeline").querySelectorAll(".chip").forEach((c) => (c.onclick = () => showTab(c.dataset.tab)));
}

function renderMessages(r) {
  const item = (m, cls) =>
    `<div class="msg ${cls}"><span class="badge">${m.phase}</span> Line ${m.line}, Col ${m.col}: ${esc(m.message)}</div>`;
  let html = r.errors.map((e) => item(e, "error")).join("") + r.warnings.map((w) => item(w, "warning")).join("");
  if (!r.errors.length) {
    const s = r.output.stats;
    html = `<div class="msg success">✔ Compiled successfully: ${s.gatesBefore} gate(s) → ${s.gatesAfter} gate(s) after optimization</div>` + html;
  }
  $("messages").innerHTML = html;
}

/* ---------------- tabs ---------------- */

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

  const r = lastResult;
  const phase = TAB_PHASE[tab];
  if (r.status[phase] === "skipped" || (r.status[phase] === undefined && tab !== "tokens")) {
    const failed = PHASES.find((p) => r.status[p.id] === "error");
    $("panel").innerHTML = `<p class="empty">This phase was not reached: compilation stopped at <b>${failed.name}</b>. Fix the errors on the left first.</p>`;
    return;
  }
  $("panel").innerHTML = RENDERERS[tab](r);
}

const table = (headers, rows) =>
  `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
  `<tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

const codeBlock = (lines) =>
  `<pre class="code">${lines.map((l, i) => `<span class="ln">${i + 1}</span>${esc(l)}`).join("\n") || "(empty)"}</pre>`;

const RENDERERS = {
  tokens: (r) =>
    `<h3>Phase 1 · Lexical Analysis: ${r.tokens.length} tokens</h3>` +
    table(["#", "Token type", "Lexeme", "Line", "Col"],
      r.tokens.map((t, i) => [i + 1, `<span class="tok ${t.type}">${t.type}</span>`, esc(t.value), t.line, t.col])),

  ast: (r) =>
    `<h3>Phase 2 · Syntax Analysis: Abstract Syntax Tree</h3>` +
    `<p class="note">Operators deeper in the tree are evaluated first (precedence: NOT &gt; AND &gt; XOR &gt; OR).</p>` +
    `<div class="scroll">${renderAST(r.ast)}</div>`,

  symbols: (r) =>
    `<h3>Phase 3 · Semantic Analysis: Symbol Table</h3>` +
    table(["Name", "Kind", "Type", "Declared (line)", "Assigned (line)", "Used at (lines)"],
      r.symbols.map((s) => [`<b>${esc(s.name)}</b>`, `<span class="kind ${s.kind}">${s.kind}</span>`, "1-bit",
        s.declaredAt, s.assignedAt ?? (s.kind === "input" ? "external" : "—"), s.usedAt.join(", ") || "—"])) +
    `<p class="note">✔ All signals defined · ✔ No double assignment · ✔ No assignment to inputs · ✔ Every output assigned</p>`,

  ir: (r) =>
    `<h3>Phase 4 · Intermediate Code: Three-Address Code</h3>` +
    `<p class="note">Each line has at most one operator. t1, t2, … are compiler-generated temporaries.</p>` +
    codeBlock(r.ir.map(formatInstruction)),

  optimized: (r) => {
    const s = r.output.stats;
    const log = r.optimizationLog.length
      ? `<ol class="log">${r.optimizationLog.map((l) => `<li><span class="badge">${l.pass}</span> ${esc(l.message)}</li>`).join("")}</ol>`
      : `<p class="note">Already optimal: no changes.</p>`;
    return `<h3>Phase 5 · Optimization</h3>` +
      `<div class="stats"><div><b>${s.instructionsBefore} → ${s.instructionsAfter}</b><span>instructions</span></div>` +
      `<div><b>${s.gatesBefore} → ${s.gatesAfter}</b><span>logic gates</span></div></div>` +
      `<div class="two-col"><div><h4>Before</h4>${codeBlock(r.ir.map(formatInstruction))}</div>` +
      `<div><h4>After</h4>${codeBlock(r.optimized.map(formatInstruction))}</div></div>` +
      `<h4>What changed</h4>${log}`;
  },

  target: (r) =>
    `<h3>Phase 6 · Code Generation: Verilog (target code)</h3>` +
    `<p class="note">A synthesizable hardware description generated from the optimized IR.</p>` +
    codeBlock(r.output.verilog.split("\n")),

  truth: (r) => {
    const t = r.output.truthTable;
    const badge = t.equivalent
      ? `<span class="ok-badge">✔ Optimized circuit is equivalent to the original on all ${t.rows.length} rows</span>`
      : `<span class="err-badge">✘ Optimized circuit differs from the original</span>`;
    return `<h3>Output · Truth Table</h3>${badge}` +
      (t.truncated ? `<p class="note">Showing first ${t.rows.length} of ${t.totalRows} rows.</p>` : "") +
      table([...t.inputs, ...t.outputs.map((o) => `<span class="outcol">${o}</span>`)],
        t.rows.map((row) => [...row.inputs, ...row.outputs.map((v) => `<b class="v${v}">${v}</b>`)]));
  },

  circuit: (r) =>
    `<h3>Output · Circuit Diagram (from optimized IR)</h3>` +
    `<p class="note"><span class="legend input">input</span> <span class="legend gate">gate</span> <span class="legend output">output</span></p>` +
    `<div class="scroll">${renderCircuit(r.optimized, r.output.inputs, r.output.outputs)}</div>`,
};

init();
