// app/api/upload-data/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { parseBufferToRows, type DataType } from '@/lib/ingest/parsers';
import { loadRowsToNeon } from '@/lib/ingest/loaders';
import crypto from 'node:crypto';
import { jwtVerify, createRemoteJWKSet } from 'jose';

export const runtime = 'nodejs';

// Trust Outseta JWTs (same as middleware)
const jwks = createRemoteJWKSet(new URL(process.env.OUTSETA_JWKS_URL!));

// ---- config
const ALLOWED_TYPES = ['accounting', 'sales', 'marketing'] as const;
type AllowedType = typeof ALLOWED_TYPES[number];

const ALLOWED_EXTS = ['.csv', '.xlsx', '.json'] as const;
const MAX_BYTES = 20 * 1024 * 1024; // 20MB

// ---- CORS
const ALLOWED_ORIGINS = new Set<string>([
  'https://my.clett.ai',
  'https://ask.clett.ai',
  'https://clett.webflow.io',
]);

function corsHeaders(origin?: string) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  const h: Record<string, string> = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    Vary: 'Origin',
  };
  if (allow) h['Access-Control-Allow-Origin'] = allow;
  return h;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin') ?? undefined;
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin') ?? undefined;

  // Block unknown origins (still send CORS headers)
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json(
      { status: 'error', message: 'Origin not allowed' },
      { status: 403, headers: corsHeaders(origin) }
    );
  }

  // ---------- AUTH: cookie OR Outseta Bearer token ----------
  const authHeader = req.headers.get('authorization') ?? '';
  let tid: string | null = null;

  // 1) Cookie path
  const session = await getSession(); // reads 'clett_session'
  if (session?.tid) tid = session.tid;

  // 2) Bearer path (Outseta JWT)
  if (!tid && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    try {
      const { payload } = await jwtVerify(token, jwks, { algorithms: ['RS256'] });
      tid =
        (payload as any).TenantId ||
        (payload as any)?.custom?.tenant_id ||
        null;
    } catch {
      // ignore → fall through to 401 if tid still null
    }
  }

  if (!tid) {
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized' },
      { status: 401, headers: corsHeaders(origin) }
    );
  }
  const tenantId = tid as string; // TS: assured non-null here

  // ---------- read multipart form ----------
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

  // ---------- validation ----------
  const filename = file.name || 'upload';
  const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (!(ALLOWED_EXTS as readonly string[]).includes(ext)) {
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

  // ---------- store raw to S3 ----------
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

  // ---------- parse + load ----------
  const rows = await parseBufferToRows(buf, ext, dataType);
  const inserted = await loadRowsToNeon(rows, dataType, tenantId);

  return NextResponse.json(
    { status: 'ok', dataType, rows: inserted, s3Key: key },
    { headers: corsHeaders(origin) }
  );
}
