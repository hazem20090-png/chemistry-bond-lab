const { app } = require('@azure/functions');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ecgrqmuxfvyfjgulwcpr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_oYrpn_n2AIMU-WVcE9sG9g_qgH0Xfsa';
const ALLOWED_RPC = new Set([
  'student_login',
  'student_portal',
  'record_progress',
  'teacher_login',
  'teacher_dashboard',
  'teacher_set_lesson_access'
]);

app.http('chemistryRpc', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rpc/{name}',
  handler: async (request) => {
    const name = request.params.name;
    if (!ALLOWED_RPC.has(name)) {
      return { status: 404, jsonBody: { ok: false, error: 'not_found' } };
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 32768) {
      return { status: 413, jsonBody: { ok: false, error: 'request_too_large' } };
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return { status: 400, jsonBody: { ok: false, error: 'invalid_json' } };
    }

    try {
      const upstream = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000)
      });

      const body = await upstream.text();
      return {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store'
        },
        body
      };
    } catch {
      return {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { ok: false, error: 'upstream_unavailable' }
      };
    }
  }
});
