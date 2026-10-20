/**
 * Evaluates a small arithmetic expression such as "100+24*2" or "(10+5)/3".
 * Supports + - * / parentheses, unary minus and decimals. Returns null when
 * the text is not a valid expression. Never uses eval.
 */
export function evalExpression(input: string): number | null {
  const src = input.replace(/\s+/g, "");
  if (src === "") return null;
  let pos = 0;

  const peek = () => src[pos];

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseUnary();
    if (left === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = src[pos++];
      const right = parseUnary();
      if (right === null) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseUnary(): number | null {
    if (peek() === "-") {
      pos++;
      const v = parseUnary();
      return v === null ? null : -v;
    }
    if (peek() === "+") {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number | null {
    if (peek() === "(") {
      pos++;
      const v = parseExpr();
      if (v === null || peek() !== ")") return null;
      pos++;
      return v;
    }
    const match = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(pos));
    if (!match) return null;
    pos += match[0].length;
    return parseFloat(match[0]);
  }

  const result = parseExpr();
  if (result === null || pos !== src.length || !Number.isFinite(result)) return null;
  return result;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const round2 = (v: number): number => Math.round(v * 100) / 100;
