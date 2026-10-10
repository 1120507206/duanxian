function sanitize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : value.stack,
    }
  }

  if (typeof value === 'string') {
    return value.replace(/[\r\n\t]/g, ' ').slice(0, 1000)
  }

  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitize(item)]),
  )
}

function write(level, event, details = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    event,
    ...sanitize(details),
  }

  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function info(event, details) {
  write('info', event, details)
}

export function warn(event, details) {
  write('warn', event, details)
}

export function error(event, details) {
  write('error', event, details)
}
