const DEFAULT_ORIGINS = ["https://gerchop.github.io"];

function permittedOrigins(env) {
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map(function (origin) { return origin.trim(); }).filter(Boolean);
  return Array.from(new Set(DEFAULT_ORIGINS.concat(configured)));
}

export function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({ "Vary": "Origin" });
  if (origin && permittedOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

export function jsonResponse(request, env, body, status = 200) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=60");
  return new Response(JSON.stringify(body), { status, headers });
}
