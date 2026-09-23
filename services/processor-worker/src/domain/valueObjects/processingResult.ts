/**
 * How a processing attempt finished from the use case's perspective.
 * Retryable faults are not a result: they are thrown for the consumer to retry.
 */
export type ProcessingResult = 'frames_packaged' | 'media_rejected';
