// A small dependency-free line diff (longest common subsequence), used to
// compare library revisions.

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

// Past this many table cells the diff degrades to "everything replaced"
// rather than spending seconds of CPU on a huge document.
const MAX_CELLS = 16_000_000;

export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");

  // Trim the common head and tail; most edits are small.
  let head = 0;
  while (head < x.length && head < y.length && x[head] === y[head]) head++;
  let tail = 0;
  while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail++;

  const mid: DiffLine[] = [];
  const xs = x.slice(head, x.length - tail);
  const ys = y.slice(head, y.length - tail);
  const n = xs.length;
  const m = ys.length;

  if (n * m > MAX_CELLS) {
    for (const t of xs) mid.push({ kind: "del", text: t });
    for (const t of ys) mid.push({ kind: "add", text: t });
  } else {
    // lcs[i][j] = LCS length of xs[i..] and ys[j..].
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] = xs[i] === ys[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (xs[i] === ys[j]) {
        mid.push({ kind: "same", text: xs[i] });
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
        mid.push({ kind: "del", text: xs[i++] });
      } else {
        mid.push({ kind: "add", text: ys[j++] });
      }
    }
    while (i < n) mid.push({ kind: "del", text: xs[i++] });
    while (j < m) mid.push({ kind: "add", text: ys[j++] });
  }

  return [
    ...x.slice(0, head).map((text): DiffLine => ({ kind: "same", text })),
    ...mid,
    ...x.slice(x.length - tail).map((text): DiffLine => ({ kind: "same", text })),
  ];
}
