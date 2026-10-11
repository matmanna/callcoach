export type DiffPart = { text: string; kind: "same" | "add" | "del" };

/** Word-level diff (longest common subsequence). Small inputs only (fact text is at most 240 characters). */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  const push = (text: string, kind: DiffPart["kind"]) => {
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) (push(a[i]!, "same"), i++, j++);
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push(a[i++]!, "del");
    else push(b[j++]!, "add");
  }
  while (i < a.length) push(a[i++]!, "del");
  while (j < b.length) push(b[j++]!, "add");
  return out;
}
