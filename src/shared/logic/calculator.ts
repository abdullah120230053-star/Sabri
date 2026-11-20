const functions: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
  exp: Math.exp,
};
export function calculate(expression: string) {
  const input = expression
    .replace(/\s+/g, "")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("π", "pi")
    .toLowerCase();
  if (!input || input.length > 200) throw new Error("Invalid expression");
  const tokens =
    input.match(
      /\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[a-z]+|[+*/^()-]/g,
    ) ?? [];
  if (tokens.join("") !== input || tokens.length > 100)
    throw new Error("Invalid expression");
  let index = 0;
  const precedence: Record<string, number> = {
    "+": 1,
    "-": 1,
    "*": 2,
    "/": 2,
    "^": 3,
  };
  const parse = (minimum: number): number => {
    const term = tokens[index++];
    if (!term) throw new Error("Expected a number");
    let result: number;
    if (term === "-" || term === "+")
      result = parse(3) * (term === "-" ? -1 : 1);
    else if (term === "(") {
      result = parse(1);
      if (tokens[index++] !== ")") throw new Error("Missing parenthesis");
    } else if (term === "pi" || term === "e")
      result = term === "pi" ? Math.PI : Math.E;
    else if (Object.hasOwn(functions, term)) {
      if (tokens[index++] !== "(") throw new Error("Missing parenthesis");
      result = functions[term]!(parse(1));
      if (tokens[index++] !== ")") throw new Error("Missing parenthesis");
    } else if (Number.isFinite(Number(term))) result = Number(term);
    else throw new Error("Invalid expression");
    for (;;) {
      const op = tokens[index],
        level = op ? precedence[op] : undefined;
      if (!level || level < minimum) break;
      index++;
      const right = parse(level + (op === "^" ? 0 : 1));
      result =
        op === "+"
          ? result + right
          : op === "-"
            ? result - right
            : op === "*"
              ? result * right
              : op === "/"
                ? result / right
                : result ** right;
    }
    return result;
  };
  const value = parse(1);
  if (index !== tokens.length || !Number.isFinite(value))
    throw new Error("Invalid expression");
  return value;
}
