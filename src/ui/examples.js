/**
 * Sample programs shown in the "Examples" dropdown.
 * Valid programs first, then one example for each kind of error.
 */
const EXAMPLES = [
  {
    name: "Basic: (a AND b) OR NOT c",
    code: `# The example from the project brief
INPUT a, b, c;
OUTPUT out;

out = (a AND b) OR NOT c;`,
  },
  {
    name: "Half adder",
    code: `# Adds two bits
INPUT a, b;
OUTPUT sum, carry;

sum   = a XOR b;
carry = a AND b;`,
  },
  {
    name: "Full adder (uses a wire)",
    code: `# Adds three bits. 'p' is an internal wire.
INPUT a, b, cin;
OUTPUT sum, cout;

p    = a XOR b;
sum  = p XOR cin;
cout = (a AND b) OR (p AND cin);`,
  },
  {
    name: "2-to-1 multiplexer",
    code: `# y = d0 when s = 0, y = d1 when s = 1
INPUT s, d0, d1;
OUTPUT y;

y = (NOT s AND d0) OR (s AND d1);`,
  },
  {
    name: "Optimization demo",
    code: `# Watch the Optimization tab
INPUT a, b;
OUTPUT y, z;

y = NOT NOT a AND 1;   # double negation
z = (a AND b) OR (a AND b) OR 0;
unused = a XOR b;      # dead code`,
  },
  {
    name: "❌ Lexical error",
    code: `INPUT a, b;
OUTPUT out;

out = a & b;   # '&' is not a valid symbol
x = 2;         # only 0 and 1 are constants`,
  },
  {
    name: "❌ Syntax error",
    code: `INPUT a, b;
OUTPUT out, y;

out = (a AND b;   # missing ')'
y = a OR ;        # missing operand`,
  },
  {
    name: "❌ Semantic errors",
    code: `INPUT a, b;
OUTPUT out, never;

out = a AND c;    # 'c' is not defined
out = a OR b;     # 'out' assigned twice
a = 1;            # cannot assign to an INPUT
# 'never' is declared but never assigned`,
  },
];
