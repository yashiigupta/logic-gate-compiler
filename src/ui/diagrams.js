/**
 * SVG drawings used by the UI:
 *   renderAST(ast)        → parse tree / abstract syntax tree
 *   renderCircuit(...)    → logic circuit built from the optimized IR
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ===================== AST / Parse tree ===================== */

// Convert compiler AST into a simple { label, type, children } tree.
function astToTree(node) {
  switch (node.kind) {
    case "Program":     return { label: "Program", type: "root", children: node.body.map(astToTree) };
    case "Declaration": return { label: node.role.toUpperCase(), type: "decl", children: node.names.map((n) => ({ label: n.name, type: "id", children: [] })) };
    case "Assignment":  return { label: "=", type: "assign", children: [{ label: node.target.name, type: "id", children: [] }, astToTree(node.expr)] };
    case "BinaryOp":    return { label: node.op, type: "op", children: [astToTree(node.left), astToTree(node.right)] };
    case "UnaryOp":     return { label: "NOT", type: "op", children: [astToTree(node.operand)] };
    case "Identifier":  return { label: node.name, type: "id", children: [] };
    case "Constant":    return { label: String(node.value), type: "const", children: [] };
  }
}

function renderAST(ast) {
  const tree = astToTree(ast);
  const X_GAP = 78, Y_GAP = 72, PAD = 40;
  let nextLeaf = 0, maxDepth = 0;

  // Leaves get consecutive x positions; parents sit centred above children.
  (function layout(n, depth) {
    n.depth = depth;
    maxDepth = Math.max(maxDepth, depth);
    if (n.children.length === 0) n.x = nextLeaf++;
    else {
      n.children.forEach((c) => layout(c, depth + 1));
      n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
    }
  })(tree, 0);

  const px = (n) => PAD + n.x * X_GAP;
  const py = (n) => PAD + n.depth * Y_GAP;
  const width = PAD * 2 + Math.max(0, nextLeaf - 1) * X_GAP;
  const height = PAD * 2 + maxDepth * Y_GAP;

  let edges = "", nodes = "";
  (function draw(n) {
    for (const c of n.children) {
      edges += `<line x1="${px(n)}" y1="${py(n)}" x2="${px(c)}" y2="${py(c)}" class="edge"/>`;
      draw(c);
    }
    const w = Math.max(44, n.label.length * 9 + 18);
    nodes += `<g class="node ${n.type}"><rect x="${px(n) - w / 2}" y="${py(n) - 15}" width="${w}" height="30" rx="8"/>` +
             `<text x="${px(n)}" y="${py(n) + 5}">${esc(n.label)}</text></g>`;
  })(tree);

  return `<svg xmlns="${SVG_NS}" class="diagram" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${edges}${nodes}</svg>`;
}

/* ===================== Circuit diagram ===================== */

function renderCircuit(code, inputs, outputs) {
  const isConst = (a) => a === "0" || a === "1";
  const nodes = {};   // id → { id, label, sub, type, level }
  const edges = [];   // { from, to }
  const alias = {};   // COPY instructions don't need a gate

  inputs.forEach((n) => (nodes[n] = { id: n, label: n, type: "input", level: 0 }));
  code.forEach((i) => i.args.forEach((a) => {
    if (isConst(a)) nodes["const_" + a] = { id: "const_" + a, label: a, type: "const", level: 0 };
  }));

  const source = (a) => alias[a] ?? (isConst(a) ? "const_" + a : a);

  for (const i of code) {
    if (i.op === "COPY") { alias[i.dest] = source(i.args[0]); continue; }
    const from = i.args.map(source);
    const level = 1 + Math.max(...from.map((f) => nodes[f].level));
    nodes[i.dest] = { id: i.dest, label: i.op, sub: i.dest, type: "gate", level };
    from.forEach((f) => edges.push({ from: f, to: i.dest }));
  }

  const maxLevel = Math.max(0, ...Object.values(nodes).map((n) => n.level));
  outputs.forEach((o) => {
    nodes["out_" + o] = { id: "out_" + o, label: o, type: "output", level: maxLevel + 1 };
    edges.push({ from: source(o), to: "out_" + o });
  });

  // Layout: one column per level.
  const COL = 160, ROW = 80, PAD = 30, W = 84, H = 44;
  const columns = {};
  Object.values(nodes).forEach((n) => (columns[n.level] = columns[n.level] || []).push(n));
  const tallest = Math.max(...Object.values(columns).map((c) => c.length));
  Object.values(columns).forEach((col) => col.forEach((n, idx) => {
    n.x = PAD + n.level * COL;
    n.y = PAD + (tallest - col.length) * (ROW / 2) + idx * ROW;
  }));

  const width = PAD * 2 + (maxLevel + 1) * COL + W;
  const height = PAD * 2 + tallest * ROW;

  let svgEdges = "", svgNodes = "";
  for (const e of edges) {
    const a = nodes[e.from], b = nodes[e.to];
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
    svgEdges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" class="wire"/>`;
  }
  for (const n of Object.values(nodes)) {
    const sub = n.sub ? `<text x="${n.x + W / 2}" y="${n.y + H + 14}" class="sub">${esc(n.sub)}</text>` : "";
    svgNodes += `<g class="cnode ${n.type}"><rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="${n.type === "gate" ? 6 : 22}"/>` +
                `<text x="${n.x + W / 2}" y="${n.y + H / 2 + 5}">${esc(n.label)}</text>${sub}</g>`;
  }
  return `<svg xmlns="${SVG_NS}" class="diagram" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svgEdges}${svgNodes}</svg>`;
}
