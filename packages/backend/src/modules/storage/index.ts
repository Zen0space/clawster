import { storage as localFsStorage } from "./localfs.storage";
import { minioStorage } from "./minio.storage";
import type { IStorage } from "./storage.interface";

export type { IStorage };

export const storage: IStorage = process.env.MINIO_ENDPOINT
  ? minioStorage
  : localFsStorage;
