// lib/logger.ts
// Structured JSON logger for GCM.
//
// Every log line is a single JSON object — machine-parseable by Vercel Log
// Drains, Datadog, Loki, or any log aggregator that accepts NDJSON.
//
// Shape:
//   {
//     "ts":      "2025-03-06T12:34:56.789Z",   // ISO timestamp
//     "level":   "info" | "warn" | "error",
//     "service": "ingest",                       // caller label
//     "msg":     "human-readable message",
//     "data":    { ...arbitrary key-value pairs } // optional
//   }
//
// Usage:
//   import { log } from '@/lib/logger';
//   log.info('ingest', 'Run complete', { created: 12, merged: 3 });
//   log.warn('alerts', 'SMTP not configured');
//   log.error('pool', 'Query failed', { error: String(err), query: sql });
//
// In development (LOG_FORMAT=pretty or NODE_ENV=development) the output is
// human-readable instead of JSON so local terminals are easy to read.

type Level = 'info' | 'warn' | 'error';

interface LogEntry {
  ts:      string;
  level:   Level;
  service: string;
  msg:     string;
  data?:   Record<string, unknown>;
}

const isPretty =
  process.env.LOG_FORMAT === 'pretty' ||
  (process.env.NODE_ENV === 'development' && process.env.LOG_FORMAT !== 'json');

function emit(level: Level, service: string, msg: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts:      new Date().toISOString(),
    level,
    service,
    msg,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  };

  if (isPretty) {
    const prefix = {
      info:  '\x1b[36m[info]\x1b[0m ',   // cyan
      warn:  '\x1b[33m[warn]\x1b[0m ',   // yellow
      error: '\x1b[31m[error]\x1b[0m ',  // red
    }[level];
    const suffix = data ? `  ${JSON.stringify(data)}` : '';
    const line   = `${prefix}[${service}] ${msg}${suffix}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn')  console.warn(line);
    else                        console.log(line);
  } else {
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn')  console.warn(line);
    else                        console.log(line);
  }
}

export const log = {
  info:  (service: string, msg: string, data?: Record<string, unknown>) => emit('info',  service, msg, data),
  warn:  (service: string, msg: string, data?: Record<string, unknown>) => emit('warn',  service, msg, data),
  error: (service: string, msg: string, data?: Record<string, unknown>) => emit('error', service, msg, data),
};
