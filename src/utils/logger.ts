/**
 * @file logger.ts
 * @description Colored console logger for Kdoub. Uses ANSI escape codes
 * supported by Metro's terminal output. 6 dedicated channels, each with its
 * own color for instant visual scanning:
 *
 *   screen    (cyan)        - component lifecycle + state changes per screen
 *   bin       (green)       - INPUT to the local backend (requests we send)
 *   bout      (bright blue) - OUTPUT from the local backend (responses)
 *   apiIn     (yellow)      - INPUT to a third-party API (requests we send)
 *   apiOut    (magenta)     - OUTPUT from a third-party API (responses)
 *   explain   (orange/bold) - human-readable explanation of what just happened
 *
 * Each screen also gets its own dedicated hue via `scoped(screenName)`.
 */

// ANSI escape sequences (Metro supports them in its terminal logger)
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const C = {
  cyan:        '\x1b[36m',
  green:       '\x1b[32m',
  blue:        '\x1b[94m',
  yellow:      '\x1b[33m',
  magenta:     '\x1b[35m',
  orange:      '\x1b[38;5;208m',
  red:         '\x1b[31m',
  grey:        '\x1b[90m',
  white:       '\x1b[97m',
  purple:      '\x1b[38;5;141m',
  pink:        '\x1b[38;5;213m',
  lime:        '\x1b[38;5;118m',
  teal:        '\x1b[38;5;44m',
  amber:       '\x1b[38;5;214m',
};

// Per-screen dedicated colors (rotation — 12 screens fit easily)
const SCREEN_COLORS = [
  C.cyan, C.purple, C.pink, C.lime, C.teal, C.amber,
  C.green, C.blue, C.yellow, C.magenta, C.orange, C.red,
];

function colorOfScreen(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return SCREEN_COLORS[Math.abs(h) % SCREEN_COLORS.length];
}

function stringify(arg: unknown): string {
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  // Errors serialize to "{}" by default (message/stack are non-enumerable),
  // so we extract them explicitly. Same for objects that nest an Error.
  if (arg instanceof Error) {
    const out: Record<string, unknown> = { name: arg.name, message: arg.message };
    const anyErr = arg as any;
    if (anyErr.status) out.status = anyErr.status;
    if (anyErr.code) out.code = anyErr.code;
    if (anyErr.cause) out.cause = String(anyErr.cause);
    return JSON.stringify(out);
  }
  try {
    return JSON.stringify(arg, (_key, value) => {
      if (value instanceof Error) {
        return { name: value.name, message: value.message };
      }
      return value;
    });
  } catch {
    return String(arg);
  }
}

function fmt(args: unknown[]): string {
  return args.map(stringify).join(' ');
}

/**
 * Log a screen-lifecycle / state-change message, colored per-screen.
 *  logger.screen('Welcome', 'mounted')
 *  logger.screen('Welcome', 'language selected', code)
 */
function screen(screenName: string, ...args: unknown[]) {
  const tint = colorOfScreen(screenName);
  console.log(`${tint}${BOLD}[SCREEN:${screenName}]${RESET}${tint} ${fmt(args)}${RESET}`);
}

/**
 * Log a REQUEST we are sending to OUR backend (local API).
 *  logger.bin('POST /auth/login', { email })
 */
function bin(label: string, ...args: unknown[]) {
  console.log(`${C.green}${BOLD}[BACKEND-IN  →]${RESET}${C.green} ${label}${RESET}${C.grey} ${fmt(args)}${RESET}`);
}

/**
 * Log a RESPONSE from OUR backend.
 *  logger.bout('200 /auth/login', data)
 */
function bout(label: string, ...args: unknown[]) {
  console.log(`${C.blue}${BOLD}[BACKEND-OUT ←]${RESET}${C.blue} ${label}${RESET}${C.grey} ${fmt(args)}${RESET}`);
}

/**
 * Log a REQUEST we are sending to a THIRD-PARTY API.
 *  logger.apiIn('GET unsplash.com/photos/random')
 */
function apiIn(label: string, ...args: unknown[]) {
  console.log(`${C.yellow}${BOLD}[3RD-PARTY-IN  →]${RESET}${C.yellow} ${label}${RESET}${C.grey} ${fmt(args)}${RESET}`);
}

/**
 * Log a RESPONSE from a THIRD-PARTY API.
 *  logger.apiOut('200 unsplash', payload)
 */
function apiOut(label: string, ...args: unknown[]) {
  console.log(`${C.magenta}${BOLD}[3RD-PARTY-OUT ←]${RESET}${C.magenta} ${label}${RESET}${C.grey} ${fmt(args)}${RESET}`);
}

/**
 * Human-readable, bolded explanation of what is happening — the WHY.
 *  logger.explain('User chose Arabic → switch i18n + persist to storage')
 */
function explain(...args: unknown[]) {
  console.log(`${C.orange}${BOLD}[EXPLAIN 💡]${RESET}${C.orange}${BOLD} ${fmt(args)}${RESET}`);
}

/** Error log (red bold). */
function error(label: string, ...args: unknown[]) {
  console.log(`${C.red}${BOLD}[ERROR ✖]${RESET}${C.red} ${label}${RESET}${C.grey} ${fmt(args)}${RESET}`);
}

/** Warning log (amber bold). */
function warn(label: string, ...args: unknown[]) {
  console.log(`${C.amber}${BOLD}[WARN ⚠]${RESET}${C.amber} ${label}${RESET}${C.grey} ${fmt(args)}${RESET}`);
}

/**
 * Returns a pre-bound logger scoped to a single screen/component —
 * saves you from passing the screen name every call.
 *
 *   const log = logger.scoped('Settings');
 *   log.screen('mounted');
 *   log.explain('user toggled theme → persisting preference');
 */
function scoped(screenName: string) {
  return {
    screen: (...args: unknown[]) => screen(screenName, ...args),
    bin: (label: string, ...args: unknown[]) => bin(`[${screenName}] ${label}`, ...args),
    bout: (label: string, ...args: unknown[]) => bout(`[${screenName}] ${label}`, ...args),
    apiIn: (label: string, ...args: unknown[]) => apiIn(`[${screenName}] ${label}`, ...args),
    apiOut: (label: string, ...args: unknown[]) => apiOut(`[${screenName}] ${label}`, ...args),
    explain: (...args: unknown[]) => explain(`[${screenName}]`, ...args),
    error: (label: string, ...args: unknown[]) => error(`[${screenName}] ${label}`, ...args),
    warn: (label: string, ...args: unknown[]) => warn(`[${screenName}] ${label}`, ...args),
  };
}

export const logger = {
  screen,
  bin,
  bout,
  apiIn,
  apiOut,
  explain,
  error,
  warn,
  scoped,
};

export default logger;
