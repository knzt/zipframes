/** One frame per second, PNG, zero-padded names. */
export const FRAME_FPS = 1;
export const FRAME_EXTENSION = 'png';

export const frameFileName = (index: number): string =>
  `frame_${String(index).padStart(4, '0')}.${FRAME_EXTENSION}`;
