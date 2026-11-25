/**
 * Safe inline arithmetic evaluator for the transaction amount field.
 *
 * Accepts simple expressions such as `12,50 + 4,80` or `75 / 3` (supporting
 * `+`, `-`, `−`, `*`, `×`, `/`, `÷` and parentheses) without ever calling
 * `eval` or `Function`.
 */

const OPERATOR_RE = /[+\-−*×/÷]/;
const ALLOWED_EXPR_RE = /^[0-9.,+\-−*×/÷()\s]+$/;

export const hasAmountExpression = (raw) => {
  const text = String(raw || "").trim();
  return text.length > 0 && OPERATOR_RE.test(text);
};

/** Sanitizes live user input so only digits, separators, spaces and operators remain. */
export const sanitizeAmountInput = (raw) => String(raw || "").replace(/[^0-9.,+\-−*×/÷()\s]/g, "");

const tokenize = (input) => {
  const normalized = input.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  const tokens = [];
  let index = 0;

  while (index < normalized.length) {
    const ch = normalized[index];
    if (ch === " " || ch === "\t") {
      index += 1;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      index += 1;
      continue;
    }
    if (/[0-9.,]/.test(ch)) {
      let start = index;
      while (index < normalized.length && /[0-9.,]/.test(normalized[index])) index += 1;
      const slice = normalized.slice(start, index);
      // Accept "12,50", "12.50" or "1.234,56"
      let numeric;
      if (/^\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}$/.test(slice)) {
        const dec = slice.match(/[.,](\d{1,2})$/);
        const digits = slice.replace(/[.,]/g, "");
        numeric = Number(`${digits.slice(0, -dec[1].length)}.${dec[1]}`);
      } else if (/^\d+(?:[.,]\d*)?$/.test(slice) || /^[.,]\d+$/.test(slice)) {
        numeric = Number(slice.replace(",", "."));
      } else {
        return null;
      }
      if (!Number.isFinite(numeric)) return null;
      tokens.push({ type: "num", value: numeric });
      continue;
    }
    return null;
  }
  return tokens;
};

/**
 * Evaluates a positive arithmetic expression, rounded to 2 decimal places.
 * Returns `null` if the expression is incomplete, invalid, divides by zero, or
 * evaluates to a non-positive number.
 */
export const evaluateAmountExpression = (raw) => {
  const text = String(raw || "").trim();
  if (!text || !ALLOWED_EXPR_RE.test(text)) return null;
  const tokens = tokenize(text);
  if (!tokens || !tokens.length) return null;

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parsePrimary = () => {
    const token = peek();
    if (!token) return Number.NaN;
    if (token.type === "num") {
      consume();
      return token.value;
    }
    if (token.type === "op" && token.value === "(") {
      consume();
      const inner = parseExpr();
      if (peek()?.value !== ")") return Number.NaN;
      consume();
      return inner;
    }
    if (token.type === "op" && (token.value === "+" || token.value === "-")) {
      consume();
      const val = parsePrimary();
      return token.value === "-" ? -val : val;
    }
    return Number.NaN;
  };

  const parseTerm = () => {
    let left = parsePrimary();
    while (peek()?.type === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = consume().value;
      const right = parsePrimary();
      if (op === "/") {
        if (right === 0) return Number.NaN;
        left /= right;
      } else {
        left *= right;
      }
    }
    return left;
  };

  const parseExpr = () => {
    let left = parseTerm();
    while (peek()?.type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = consume().value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };

  const result = parseExpr();
  if (pos !== tokens.length || !Number.isFinite(result) || result <= 0) return null;
  const rounded = Math.round((result + Number.EPSILON) * 100) / 100;
  return rounded > 0 ? rounded : null;
};

/** Formats a numeric result back into a clean decimal string (e.g. `17.30` -> `"17.30"`, `25` -> `"25"`). */
export const formatEvaluatedAmount = (value) => (
  Number.isInteger(value) ? String(value) : value.toFixed(2)
);
