const counters = {
  authenticationFailures: 0,
  connectionsAccepted: 0,
  connectionsRejected: 0,
  connectionsClosed: 0,
  inboundEvents: 0,
  relayedEvents: 0,
  deliveryFailures: 0,
  validationFailures: 0,
  rateLimitRejections: 0,
  protocolErrors: 0,
};

export type ServiceCounter = keyof typeof counters;

export function incrementCounter(counter: ServiceCounter): void {
  counters[counter] += 1;
}

export function getServiceMetrics() {
  return {
    ...counters,
    averageInboundEventsPerSecond: Number(
      (counters.inboundEvents / Math.max(process.uptime(), 1)).toFixed(2),
    ),
  };
}

