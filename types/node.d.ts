// tsconfig loads no Node types. test/pack-skill.check.ts runs under plain Node, outside the
// engine's test runner (which cannot read files), and needs just these.
interface ImportMeta { url: string }
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void
}
declare module 'node:assert/strict' {
  function assert(v: unknown, message?: string): asserts v
  namespace assert {
    function ok(v: unknown, message?: string): asserts v
    function equal(a: unknown, b: unknown, message?: string): void
    function deepEqual(a: unknown, b: unknown, message?: string): void
    function match(s: string, re: RegExp, message?: string): void
  }
  export default assert
}
