// The engine as the other modules see it. The loader refuses $ passed across an
// import, so register.tsx builds this from $ in hostOf.
export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type Host = {
  run(argv: readonly string[]): Promise<RunResult>
  readFile(path: string): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  listDir(path: string): Promise<string[]>
  fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }>
  storeGet(key: string): Promise<unknown>
  storeSet(key: string, value: unknown): Promise<void>
  storeDelete(key: string): Promise<void>
  // true when project or local settings set their own statusLine, which wins over the user's
  projectStatusLine(): Promise<boolean>
  // $CLAUDE_CONFIG_DIR, else $HOME/.claude
  configDir: string
}
