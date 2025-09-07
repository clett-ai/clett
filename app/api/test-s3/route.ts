// app/api/test-s3/route.ts
import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

// --- CORS (same as upload-data)
const ALLOWED_ORIGINS = [
  'https://ask.clett.ai',
  'https://my.clett.ai',
  'https://clett.webflow.io',
];
function corsHeaders(origin?: string) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin') || undefined;
  return new NextResponse(null, { headers: corsHeaders(origin) });
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(req: Request) {
  const origin = req.headers.get('origin') || undefined;

  try {
    const bucket = process.env.S3_BUCKET!;
    const key = 'test/hello.txt';

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: 'Hello from ask.clett.ai!',
        ContentType: 'text/plain',
      })
    );

    return NextResponse.json(
      { status: 'ok', message: `Uploaded ${bucket}/${key}` },
      { headers: corsHeaders(origin) }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { status: 'error', message: err?.message || 'Unknown error' },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
