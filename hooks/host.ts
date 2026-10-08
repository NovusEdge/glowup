// The engine as the other modules see it. The loader refuses $ passed across an
// import, so register.tsx builds this from $ in hostOf.
export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type Host = {
  // env is set over the engine's own environment; timeoutMs defaults to the engine's 30 s
  run(argv: readonly string[], env?: Record<string, string>, timeoutMs?: number): Promise<RunResult>
  readFile(path: string): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  // undefined when nothing is at path
  stat(path: string): Promise<{ mtimeMs: number } | undefined>
  listDir(path: string): Promise<string[]>
  // size is in bytes, for a file
  listFiles(path: string): Promise<{ name: string; size: number }[]>
  fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }>
  storeGet(key: string): Promise<unknown>
  storeSet(key: string, value: unknown): Promise<void>
  storeDelete(key: string): Promise<void>
  // true when project or local settings set their own statusLine, which wins over the user's
  projectStatusLine(): Promise<boolean>
  // $CLAUDE_CONFIG_DIR, else $HOME/.claude
  configDir: string
  // $XDG_DATA_HOME, else $HOME/.local/share
  dataHome: string
  // $HOME
  home: string
}
