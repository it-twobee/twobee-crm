import { randomUUID } from 'crypto'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
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

/* §397 — un video non entra in memoria, né in salita né in discesa.
   In salita si carica a pezzi mentre arriva; in discesa si serve il pezzo che
   il player chiede, altrimenti non si può far scorrere. */
/** 8 MiB: sopra il minimo di 5 MiB che S3 impone a ogni parte tranne l'ultima. */
const PART_BYTES = 8 * 1024 * 1024

export class StorageTooLarge extends Error {}

/**
 * Carica uno stream senza tenerlo in memoria: sotto una parte va in un colpo
 * solo, sopra diventa un multipart. Se supera `limitBytes` l'upload viene
 * annullato — il byte di troppo non arriva mai sul disco.
 */
export async function putObjectStream(
  key: string,
  stream: ReadableStream<Uint8Array>,
  options: { contentType?: string; limitBytes: number },
): Promise<{ size: number }> {
  const client = s3()
  const reader = stream.getReader()
  const buffered: Uint8Array[] = []
  let bufferedBytes = 0, total = 0, partNumber = 0
  let uploadId: string | undefined
  const parts: { ETag: string; PartNumber: number }[] = []

  const takeBuffer = () => {
    const chunk = new Uint8Array(bufferedBytes)
    let offset = 0
    for (const piece of buffered) { chunk.set(piece, offset); offset += piece.length }
    buffered.length = 0; bufferedBytes = 0
    return chunk
  }
  const sendPart = async (body: Uint8Array) => {
    partNumber += 1
    const result = await client.send(new UploadPartCommand({
      Bucket: S3_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body,
    }))
    parts.push({ ETag: result.ETag ?? '', PartNumber: partNumber })
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value?.length) {
        total += value.length
        if (total > options.limitBytes) throw new StorageTooLarge('File troppo grande')
        buffered.push(value); bufferedBytes += value.length
      }
      if (done) break
      if (bufferedBytes >= PART_BYTES) {
        if (!uploadId) {
          const started = await client.send(new CreateMultipartUploadCommand({
            Bucket: S3_BUCKET, Key: key, ContentType: options.contentType,
          }))
          uploadId = started.UploadId
        }
        await sendPart(takeBuffer())
      }
    }
    if (!uploadId) {
      await client.send(new PutObjectCommand({
        Bucket: S3_BUCKET, Key: key, Body: takeBuffer(), ContentType: options.contentType,
      }))
      return { size: total }
    }
    // L'ultima parte può essere più piccola del minimo: le altre no, e il
    // buffer è già oltre PART_BYTES quando si spezza.
    if (bufferedBytes > 0 || parts.length === 0) await sendPart(takeBuffer())
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: S3_BUCKET, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }))
    return { size: total }
  } catch (error) {
    if (uploadId) {
      // Un multipart lasciato aperto occupa spazio senza comparire in elenco.
      try { await client.send(new AbortMultipartUploadCommand({ Bucket: S3_BUCKET, Key: key, UploadId: uploadId })) } catch { /* già annullato */ }
    }
    throw error
  } finally {
    reader.releaseLock()
  }
}

export interface S3Object {
  body: ReadableStream
  contentType?: string
  contentLength?: number
  contentRange?: string
  totalLength?: number
}

export async function getObject(key: string, range?: string): Promise<S3Object> {
  const res = await s3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, Range: range }))
  if (!res.Body) throw new Error(`Oggetto vuoto o inesistente: ${key}`)
  const total = res.ContentRange ? Number(res.ContentRange.split('/').pop()) : res.ContentLength
  return {
    body: res.Body.transformToWebStream(),
    contentType: res.ContentType,
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    totalLength: Number.isFinite(total) ? total : undefined,
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
