import { ZipArchiveBuilder } from '../../../infrastructure/services/media/zipArchiveBuilder.service.js';

export const createArchiveBuilder = (): ZipArchiveBuilder => new ZipArchiveBuilder();
