let _traceId = ''

export function setTraceId(id: string) {
  _traceId = id
}

export function getTraceId(): string {
  return _traceId
}

function serialize(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return JSON.stringify({ name: a.name, message: a.message, stack: a.stack?.split('\n').slice(0, 3).join('|') })
      if (typeof a === 'object') return JSON.stringify(a)
      return String(a)
    })
    .join(' ')
}

function emit(level: string, args: unknown[]) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    traceId: _traceId || undefined,
    message: serialize(args),
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
}
