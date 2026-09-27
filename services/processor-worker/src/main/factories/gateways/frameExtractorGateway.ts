import { FfmpegFrameExtractorGateway } from '../../../infrastructure/gateways/media/ffmpegFrameExtractor.gateway.js';

export const createFrameExtractorGateway = (): FfmpegFrameExtractorGateway =>
  new FfmpegFrameExtractorGateway();
