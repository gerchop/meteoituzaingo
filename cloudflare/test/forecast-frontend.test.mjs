import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../js/dashboard.js", import.meta.url), "utf8");
assert.match(source, /item\.timestamp > ahora/, "el renderizado excluye slots pasados");
assert.match(source, /\.sort\(function \(a, b\) \{ return a\.timestamp - b\.timestamp; \}\)\.slice\(0, 12\)/, "el horario conserva hasta doce slots futuros ordenados");
assert.match(source, /cache\?\.cache\?\.state === "STALE_USABLE"/, "la UI distingue stale utilizable");
assert.match(source, /Pronóstico sin actualización reciente\. Última actualización:/, "stale utilizable comunica su antigüedad");
assert.match(source, /error\.forecastCacheState = cuerpo\?\.cache\?\.state/, "la respuesta 503 conserva el estado semántico");
assert.match(source, /forecastCacheState === "EXHAUSTED"/, "la UI distingue forecast agotado");
assert.match(source, /El pronóstico horario está temporalmente sin actualización reciente\./, "exhausted no se comunica como fallo técnico");
console.log("forecast frontend tests: OK (future-only, stale usable, exhausted and unavailable paths)");
