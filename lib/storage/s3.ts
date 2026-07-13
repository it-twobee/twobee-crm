import { randomUUID } from 'crypto'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import type { StorageFolder } from './shared'

// Provider S3/MinIO — SOLO server-side.
// MinIO gira INTERNO alla rete Docker `coolify` (alias `minio`), mai esposto in
// internet: il browser non parla mai con lui, tutto passa dal backend Next.
// Config via env (impostate su Coolify come RUNTIME):
//   S3_ENDPOINT=http://minio:9000  S3_ACCESS_KEY_ID  S3_SECRET_ACCESS_KEY
//   S3_BUCKET=twobee-crm  S3_REGION=us-east-1  S3_FORCE_PATH_STYLE=true

export const S3_BUCKET = process.env.S3_BUCKET || 'twobee-crm'

let _client: S3Client | null = null

export function isStorageConfigured(): boolean {
  return !!(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY)
}

export function s3(): S3Client {
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Storage non configurato: mancano S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY')
  }
  if (!_client) {
    _client = new S3Client({
      endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      // MinIO usa il path-style (bucket nel path, non nel sottodominio).
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  return _client
}

// ── Object key ───────────────────────────────────────────────────────────────

/** Nome file sicuro per l'object key: niente path-traversal, mantiene l'estensione. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file'
  const clean = base.replace(/[^\w.\-]+/g, '_').replace(/_{2,}/g, '_')
  return clean.slice(-120) || 'file'
}

/** Costruisce la chiave S3: `<folder>/[<scope>/]<uuid>-<filename>`. */
export function buildObjectKey(folder: StorageFolder, filename: string, scope?: string | null): string {
  const parts: string[] = [folder]
  if (scope) parts.push(scope.replace(/[^\w.\-]+/g, '_'))
  parts.push(`${randomUUID()}-${sanitizeFilename(filename)}`)
  return parts.join('/')
}

// ── Operazioni ───────────────────────────────────────────────────────────────

export async function putObject(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void> {
  await s3().send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export interface S3Object {
  body: ReadableStream
  contentType?: string
  contentLength?: number
}

export async function getObject(key: string): Promise<S3Object> {
  const res = await s3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }))
  if (!res.Body) throw new Error(`Oggetto vuoto o inesistente: ${key}`)
  return {
    body: res.Body.transformToWebStream(),
    contentType: res.ContentType,
    contentLength: res.ContentLength,
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
}

export async function listObjects(prefix: string): Promise<{ key: string; size: number; lastModified?: Date }[]> {
  const res = await s3().send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix }))
  return (res.Contents ?? []).map(o => ({
    key: o.Key ?? '',
    size: o.Size ?? 0,
    lastModified: o.LastModified,
  }))
}
