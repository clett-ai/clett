// app/api/upload-data/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { parseBufferToRows, type DataType } from '@/lib/ingest/parsers';
import { loadRowsToNeon } from '@/lib/ingest/loaders';
import crypto from 'node:crypto';

export const runtime = 'nodejs'; // AWS SDK + file uploads need Node runtime

// ---- config
const ALLOWED_TYPES = ['accounting', 'sales', 'marketing'] as const;
type AllowedType = typeof ALLOWED_TYPES[number];

const ALLOWED_EXTS = ['.csv', '.xlsx', '.json'] as const;
const MAX_BYTES = 20 * 1024 * 1024; // 20MB

// ---- CORS (explicit origins only)
const ALLOWED_ORIGINS = new Set<string>([
  'https://my.clett.ai',      // your Webflow site
  'https://ask.clett.ai',     // your API domain (safe)
  'https://clett.webflow.io', // your webflow.io subdomain (if used)
  // 'https://www.clett.ai',   // add if you publish on www
  // 'https://preview.webflow.com', // add temporarily if testing in Designer/Editor
]);

function corsHeaders(origin?: string) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  const h: Record<string, string> = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Vary': 'Origin', // make caches vary by Origin
  };
  if (allow) h['Access-Control-Allow-Origin'] = allow;
  return h;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin') || undefined;
  // 204 with CORS headers satisfies the preflight
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin') || undefined;

  // If the Origin isn't allowed, bail early (still send CORS headers)
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json(
      { status: 'error', message: 'Origin not allowed' },
      { status: 403, headers: corsHeaders(origin) }
    );
  }

  // 0) auth (and ensure tid is present)
  const session = await getSession();
  if (!session || !session.tid) {
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized' },
      { status: 401, headers: corsHeaders(origin) }
    );
  }
  const tid: string = session.tid;

  // 1) read multipart form
  const form = await req.formData();

  const rawType = String(form.get('dataType') ?? '').toLowerCase();
  if (!ALLOWED_TYPES.includes(rawType as AllowedType)) {
    return NextResponse.json(
      { status: 'error', message: 'Missing/invalid dataType' },
      { status: 400, headers: corsHeaders(origin) }
    );
  }
  const dataType = rawType as DataType;

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { status: 'error', message: 'file is required' },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  // 2) basic validation
  const filename = file.name || 'upload';
  const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (!ALLOWED_EXTS.includes(ext as any)) {
    return NextResponse.json(
      { status: 'error', message: 'Invalid file format' },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  const ab = await file.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { status: 'error', message: 'File too large' },
      { status: 413, headers: corsHeaders(origin) }
    );
  }
  const buf = Buffer.from(ab);

  // 3) optional: store raw file in S3
  const bucket = process.env.S3_BUCKET!;
  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  const key = `${dataType}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: file.type || 'application/octet-stream',
    })
  );

  // 4) parse/normalize + load to Neon/Postgres (scoped by tenant id)
  const rows = await parseBufferToRows(buf, ext, dataType);
  const inserted = await loadRowsToNeon(rows, dataType, tid);

  return NextResponse.json(
    { status: 'ok', dataType, rows: inserted, s3Key: key },
    { headers: corsHeaders(origin) }
  );
}
