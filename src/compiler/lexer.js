/**
 * PHASE 1 — LEXICAL ANALYSIS
 * ---------------------------------------------------------------
 * Input : source code (a string)
 * Output: a list of tokens  +  a list of lexical errors
 *
 * The lexer reads the source one character at a time and groups
 * characters into meaningful units called TOKENS, e.g.
 *
 *    out = a AND b;
 *    IDENTIFIER(out) ASSIGN IDENTIFIER(a) AND IDENTIFIER(b) SEMICOLON
 *
 * Lexical errors detected:
 *   - unknown characters such as  &  |  !  @
 *   - invalid constants such as  2  or  10  (only 0 and 1 exist)
 */

// Reserved words of the language (case-insensitive: "and" == "AND").
const KEYWORDS = ["INPUT", "OUTPUT", "AND", "OR", "NOT", "XOR", "NAND", "NOR"];

// Single-character symbols and their token types.
const SYMBOLS = {
  "=": "ASSIGN",
  ";": "SEMICOLON",
  ",": "COMMA",
  "(": "LPAREN",
  ")": "RPAREN",
};

// Friendly hints for symbols people often type by habit.
const SYMBOL_HINTS = { "&": "AND", "|": "OR", "!": "NOT", "~": "NOT", "^": "XOR" };

function tokenize(source) {
  const tokens = [];
  const errors = [];

  let pos = 0;   // index in the source string
  let line = 1;  // current line   (for error messages)
  let col = 1;   // current column (for error messages)

  const peek = (offset = 0) => source[pos + offset];

  function advance() {
    const ch = source[pos++];
    if (ch === "\n") { line++; col = 1; } else { col++; }
    return ch;
  }

  function addToken(type, value, startLine, startCol) {
    tokens.push({ type, value, line: startLine, col: startCol });
  }

  function addError(message, startLine, startCol) {
    errors.push({ phase: "Lexical", message, line: startLine, col: startCol });
  }

  while (pos < source.length) {
    const ch = peek();
    const startLine = line;
    const startCol = col;

    // 1. Skip whitespace
    if (/\s/.test(ch)) { advance(); continue; }

    // 2. Skip comments:  # comment   or   // comment
    if (ch === "#" || (ch === "/" && peek(1) === "/")) {
      while (pos < source.length && peek() !== "\n") advance();
      continue;
    }

    // 3. Keywords and identifiers: letter followed by letters/digits/_
    if (/[A-Za-z]/.test(ch)) {
      let word = "";
      while (pos < source.length && /[A-Za-z0-9_]/.test(peek())) word += advance();

      const upper = word.toUpperCase();
      if (KEYWORDS.includes(upper)) addToken(upper, upper, startLine, startCol);
      else addToken("IDENTIFIER", word, startLine, startCol);
      continue;
    }

    // 4. Constants: only 0 and 1 are valid
    if (/[0-9]/.test(ch)) {
      let num = "";
      while (pos < source.length && /[A-Za-z0-9_]/.test(peek())) num += advance();

      if (num === "0" || num === "1") addToken("CONSTANT", num, startLine, startCol);
      else addError(`Invalid constant '${num}' (only 0 and 1 are allowed)`, startLine, startCol);
      continue;
    }

    // 5. Symbols:  =  ;  ,  (  )
    if (SYMBOLS[ch]) {
      advance();
      addToken(SYMBOLS[ch], ch, startLine, startCol);
      continue;
    }

    // 6. Anything else is a lexical error
    advance();
    const hint = SYMBOL_HINTS[ch] ? ` (did you mean ${SYMBOL_HINTS[ch]}?)` : "";
    addError(`Unexpected character '${ch}'${hint}`, startLine, startCol);
  }

  addToken("EOF", "", line, col);
  return { tokens, errors };
}
