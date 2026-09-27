/**
 * Deterministic object keys, shared with the processing context through the
 * events: the worker reads `sourceKey` and writes the package at the key
 * below, so reprocessing overwrites the same object.
 */
export const sourceKeyFor = (ownerId: string, videoId: string): string =>
  `uploads/${ownerId}/${videoId}`;

export const framesPackageKeyFor = (ownerId: string, videoId: string): string =>
  `outputs/${ownerId}/${videoId}.zip`;
