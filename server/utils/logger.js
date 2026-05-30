const levels = ['debug', 'info', 'warn', 'error']

/**
 * Structured JSON logs compatible with AWS CloudWatch Logs Insights.
 * Metric fields use `_aws` namespace for optional metric filter extraction.
 */
export function log(level, message, meta = {}) {
  if (!levels.includes(level)) level = 'info'
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    service: 'intervuex-api',
    ...meta,
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** CloudWatch-style custom metric (stdout → metric filter / embedded metric format). */
export function logMetric(metricName, value, unit = 'Count', meta = {}) {
  log('info', `[METRIC] ${metricName}`, {
    metricName,
    metricValue: value,
    metricUnit: unit,
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: 'IntervueX',
          Dimensions: [['service', 'operation']],
          Metrics: [{ Name: metricName, Unit: unit }],
        },
      ],
    },
    operation: meta.operation ?? 'general',
    ...meta,
  })
}

/** Log SQS / queue job processing duration (merge, transcription, chunk pipeline). */
export function logProcessingTime(operation, durationMs, meta = {}) {
  logMetric(`${operation}.ProcessingTime`, durationMs, 'Milliseconds', {
    operation,
    durationMs,
    ...meta,
  })
  log('info', `${operation} completed`, { durationMs, ...meta })
}
