const UNITS: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** 1234 → "1,234", 12_500_000 → "12.5M". */
export function short(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  if (abs < 10_000) return Math.round(n).toLocaleString('en-US');
  for (const [v, u] of UNITS) if (abs >= v) return `${+(n / v).toFixed(abs / v >= 100 ? 0 : abs / v >= 10 ? 1 : 2)}${u}`;
  return String(n);
}

export const full = (n: number) => Math.round(n).toLocaleString('en-US');

export function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}
