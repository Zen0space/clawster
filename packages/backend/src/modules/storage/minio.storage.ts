import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import type { IStorage } from "./storage.interface";

class MinIOStorage implements IStorage {
  private readonly bucket = process.env.MINIO_BUCKET ?? "clawster";
  private readonly client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT!,
    region: process.env.MINIO_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
  });

  // Single promise tracked so bucket is only created once
  private readonly ready: Promise<void> = this.ensureBucket();

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      console.log(`[minio] bucket "${this.bucket}" created`);
    }
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    await this.ready;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: mimeType,
    }));
  }

  async get(key: string): Promise<Buffer> {
    await this.ready;
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async remove(key: string): Promise<void> {
    await this.ready;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const minioStorage: IStorage = new MinIOStorage();
