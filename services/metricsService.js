const metrics = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  previewTotal: 0,
  executeTotal: 0,
  succeededTotal: 0,
  failedTotal: 0,
  autoRepairAttempts: 0,
  totalLatencyMs: 0
};

function recordRequest({ mode, success, latencyMs, autoRepairUsed }) {
  metrics.requestsTotal += 1;
  if (mode === 'preview') {
    metrics.previewTotal += 1;
  }
  if (mode === 'execute') {
    metrics.executeTotal += 1;
  }

  if (success) {
    metrics.succeededTotal += 1;
  } else {
    metrics.failedTotal += 1;
  }

  if (autoRepairUsed) {
    metrics.autoRepairAttempts += 1;
  }

  metrics.totalLatencyMs += Number(latencyMs || 0);
}

function getMetricsSnapshot() {
  const avgLatencyMs = metrics.requestsTotal > 0
    ? Number((metrics.totalLatencyMs / metrics.requestsTotal).toFixed(2))
    : 0;

  return {
    ...metrics,
    avgLatencyMs
  };
}

module.exports = {
  recordRequest,
  getMetricsSnapshot
};