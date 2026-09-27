import { FfmpegFrameExtractor } from '../../../infrastructure/gateways/media/ffmpegFrameExtractor.gateway.js';

export const createFrameExtractor = (): FfmpegFrameExtractor => new FfmpegFrameExtractor();
