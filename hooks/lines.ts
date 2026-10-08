// JSX-free: the studio imports it.
import { daypart, type LocalTime } from './eggs.ts'

export const MOMENTS = ['done', 'fail', 'needs-you', 'green', 'hello', 'long-done', 'compact'] as const
export type Moment = (typeof MOMENTS)[number]
export const FLAVOURS = ['morning', 'afternoon', 'evening', 'night', 'friday', 'christmas', 'halloween', 'birthday'] as const
export type Flavour = (typeof FLAVOURS)[number]
// Keys are a moment ("done") or a moment and a flavour ("done@night").
export type PetLines = Partial<Record<string, string[]>>

// The vars moodOf fills for each moment; any other slot would draw as "…".
export const MOMENT_SLOTS: Record<Moment, readonly ('file' | 'n' | 'command')[]> = {
  done: ['file'], 'long-done': ['file'], fail: ['n'], 'needs-you': ['command'], green: [], hello: [], compact: [],
}

export const DEFAULT_LINES: Record<Moment, string[]> = {
  done: ['all done', 'finished', 'done!', 'that worked', 'wrapped up', 'done for now'],
  fail: ['{n} failed', 'tests failed', 'not quite', 'red this time', 'try again?', 'hmm'],
  'needs-you': ['need you', 'your turn', 'approve {command}?', 'waiting on you', 'a yes, please?', 'over to you'],
  green: ['green again', 'tests pass', 'fixed!', 'all passing', 'back to green', 'nice'],
  hello: ['hi!', 'hello', 'welcome back', 'ready', 'hey', 'here again'],
  'long-done': ['long one, done', 'finally!', 'all done at last', 'that took a while', 'done, phew', 'finished at last'],
  compact: ['context compacted', 'tidied up', 'lighter now', 'memory trimmed', 'squeezed it down', 'fresh start-ish'],
}

export const BUILTIN_LINES: Record<'clawd' | 'robot' | 'egg', PetLines> = {
  clawd: {
    done: ['all done', "that's a wrap", 'done and dusted', 'shipped it. sort of.', 'done. {file} looks better', 'that one went smoothly'],
    'done@morning': ['done before coffee'],
    'done@night': ['done. go to bed', 'finished. the moon approves'],
    'done@friday': ['done. weekend unlocked?'],
    'done@christmas': ['done. cocoa time'],
    fail: ['ouch, {n} failed', 'hmm, red', 'back at it', '{n} down. we regroup', 'that stung', 'red again. tea?'],
    'fail@night': ['red at this hour?'],
    'fail@halloween': ['spooky red'],
    'needs-you': ['hey, need you', 'your call', 'need a yes on {command}', 'psst, {command}?', 'waiting on you', 'a quick yes?'],
    green: ['back to green', 'green again!', 'fixed it. probably us', 'all passing now', 'red no more', 'look at that green'],
    hello: ['oh, hi', 'hey there', 'back again?', 'ready when you are', 'hello hello', 'what are we making?'],
    'hello@morning': ['morning!', 'early start, huh'],
    'hello@night': ['late one tonight?', 'night shift again'],
    'hello@christmas': ['happy holidays!'],
    'hello@halloween': ['boo.'],
    'hello@birthday': ['hey, our anniversary!'],
    'long-done': ['finally done', 'that was a long one', 'done. I aged a bit', 'marathon over', 'phew. done', 'done. {file} got a lot'],
    compact: ['tidied up my notes', 'memory squeezed', 'lighter now', 'compacted. where were we?', 'fresh-ish context', 'packed it down'],
  },
  robot: {
    done: ['TASK COMPLETE.', 'JOB DONE. AWAITING INPUT.', 'PROCESS EXITED 0.', 'OUTPUT DELIVERED.', 'COMPLETE. {file} UPDATED.', 'END OF LINE.'],
    'done@friday': ['WEEKEND.EXE LOADING.'],
    fail: ['FAULT: {n} TESTS', 'ERROR DETECTED.', 'TESTS: RED.', 'RECALIBRATING.', 'ANOMALY LOGGED.', 'RETRYING SOON.'],
    'needs-you': ['INPUT REQUIRED: {command}', 'AWAITING OPERATOR.', 'CONFIRM: Y/N?', 'PERMISSION REQUEST.', 'HUMAN NEEDED.', 'AUTHORIZE {command}?'],
    green: ['ALL SYSTEMS NOMINAL.', 'TESTS: GREEN.', 'FAULT CLEARED.', 'STATUS: PASSING.', 'REPAIR SUCCESSFUL.', 'GREEN ACROSS THE BOARD.'],
    hello: ['BOOT COMPLETE.', 'HELLO, OPERATOR.', 'SYSTEMS ONLINE.', 'RESUMING.', 'READY.', 'WAKE SIGNAL RECEIVED.'],
    'hello@morning': ['GOOD MORNING, OPERATOR.'],
    'hello@night': ['NIGHT MODE ENGAGED.'],
    'hello@christmas': ['SEASON GREETINGS.EXE'],
    'hello@halloween': ['BOO.WAV'],
    'long-done': ['LONG JOB COMPLETE.', 'UPTIME EXCEEDED. DONE.', 'BATCH FINISHED.', 'COMPLETE AT LAST.', 'DONE. FANS COOLING.', 'MARATHON PROCESS ENDED.'],
    compact: ['MEMORY DEFRAGMENTED.', 'BUFFER COMPACTED.', 'CACHE CLEARED.', 'CONTEXT COMPRESSED.', 'FREE MEMORY: MORE.', 'GARBAGE COLLECTED.'],
  },
  egg: {
    done: ['*tap tap*', '*wiggle*', '…!', '*happy wobble*', '*warm*', 'done?'],
    fail: ['*wobble*', '…', '*shiver*', 'uh oh', '*rattle*', '*sad tilt*'],
    'needs-you': ['*tap tap tap*', '?', '*nudge*', 'psst', '*rock rock*', 'you?'],
    green: ['!!', '*spin*', 'yay', '*bounce*', '*glow*', '*happy wobble*'],
    hello: ['*peep*', '…hi?', '*tap*', '*stir*', 'hello?', '*yawn*'],
    'hello@night': ['*zzz*'],
    'long-done': ['*sleepy wobble*', 'long…', '*stretch*', '*tired tap*', 'phew', '*sigh*'],
    compact: ['*shrink*', '*hum*', '*settle*', '*snug*', '*tidy tap*', '*smaller*'],
  },
}

export function linesFor(pet: string, user?: PetLines): PetLines {
  if (pet === 'clawd' || pet === 'clawd-shiny') return BUILTIN_LINES.clawd
  if (pet === 'robot' || pet === 'egg') return BUILTIN_LINES[pet]
  return user ?? {}
}

export function pool(lines: PetLines, moment: Moment, flavours: readonly Flavour[]): string[] {
  const base = lines[moment]?.length ? lines[moment]! : DEFAULT_LINES[moment]
  return [...base, ...flavours.flatMap(f => lines[`${moment}@${f}`] ?? [])]
}

// Holidays follow the outfits, so the hat and the line change on the same day. The "friday"
// overlay means a Friday-afternoon deploy; this flavour is any Friday.
const HOLIDAY: Record<string, Flavour> = { santa: 'christmas', pumpkin: 'halloween', party: 'birthday' }
export function flavoursOf(t: LocalTime, overlays: readonly string[]): Flavour[] {
  const out: Flavour[] = [daypart(t.hour) as Flavour]
  if (t.day === 5) out.push('friday')
  for (const o of overlays) if (HOLIDAY[o]) out.push(HOLIDAY[o]!)
  return out
}
