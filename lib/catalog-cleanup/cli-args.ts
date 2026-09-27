export const DEFAULT_OUT_DIR = ".catalog-cleanup-out";

/** Pulls `--out <dir>` out of argv. A `--out` with no directory after it is an error. */
export function parseOut(args: readonly string[]): { outDir: string; rest: string[] } {
  const i = args.indexOf("--out");
  if (i < 0) return { outDir: DEFAULT_OUT_DIR, rest: [...args] };
  const dir = args[i + 1];
  if (dir === undefined || dir === "" || dir.startsWith("--")) throw new Error("--out needs a directory");
  return { outDir: dir, rest: [...args.slice(0, i), ...args.slice(i + 2)] };
}
