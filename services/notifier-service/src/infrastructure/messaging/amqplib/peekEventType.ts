export const peekEventType = (envelope: unknown): string | undefined => {
  if (typeof envelope !== 'object' || envelope === null || !('eventType' in envelope)) {
    return undefined;
  }
  const eventType: unknown = envelope.eventType;
  return typeof eventType === 'string' ? eventType : undefined;
};
