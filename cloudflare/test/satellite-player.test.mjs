import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../js/dashboard.js", import.meta.url), "utf8");
const start = source.indexOf("let satelite =");
const end = source.indexOf("/** Obtiene la secuencia oficial de CONAE");
assert.ok(start >= 0 && end > start, "Satellite player boundaries must exist in dashboard.js.");

function createPlayer({ reducedMotion = false } = {}) {
  let nextTimer = 1;
  const timers = new Map();
  const elements = {
    satelliteImage: { alt: "", src: "" },
    satelliteMeta: { textContent: "" },
    satellitePlay: { innerHTML: "" },
    satelliteProduct: { value: "ArgIrol" }
  };
  const context = {
    CONFIG: { cuadroSateliteMs: 500 },
    CONAE_PRODUCTS: { ArgIrol: "Infrarrojo" },
    document: { visibilityState: "visible", getElementById: (id) => elements[id] },
    window: {
      setInterval(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
      clearInterval(id) { timers.delete(id); }
    },
    globalThis: {}
  };
  const exposed = `${source.slice(start, end)}\nglobalThis.__player = { satelite, cambiarCuadroSatelital, iniciarAnimacionSatelital, detenerAnimacionSatelital, sincronizarAnimacionSatelital, alternarReproduccionSatelital };`;
  vm.runInNewContext(exposed, context);
  const player = context.globalThis.__player;
  player.satelite.visible = true;
  player.satelite.reducedMotion = reducedMotion;
  return {
    ...player,
    addFrames(count) {
      player.satelite.imagenes = Array.from({ length: count }, (_, index) => ({ url: `https://example.test/frame-${index}.png` }));
      player.satelite.framesReady = count >= 2;
    },
    tick() { assert.equal(timers.size, 1); [...timers.values()][0](); },
    timerCount() { return timers.size; },
    image() { return elements.satelliteImage.src; }
  };
}

const player = createPlayer();
player.addFrames(6);
player.sincronizarAnimacionSatelital();
assert.equal(player.timerCount(), 1, "Autoplay starts with six visible frames.");
assert.equal(player.satelite.indice, 0);
player.tick();
assert.equal(player.satelite.indice, 1, "A timer tick advances the current frame.");
for (let index = 0; index < 5; index += 1) player.tick();
assert.equal(player.satelite.indice, 0, "Frame progression wraps with modulo frame length.");
assert.match(player.image(), /frame-0\.png$/, "The displayed source changes to the selected frame URL.");
player.iniciarAnimacionSatelital();
assert.equal(player.timerCount(), 1, "Starting twice never creates a second timer.");
player.detenerAnimacionSatelital();
assert.equal(player.timerCount(), 0, "Stop clears the timer.");

const pending = createPlayer();
pending.addFrames(1);
pending.alternarReproduccionSatelital();
assert.equal(pending.satelite.userRequestedPlayback, true, "Manual Play preserves intent before frames are ready.");
assert.equal(pending.timerCount(), 0, "A single frame does not start a timer.");
pending.addFrames(6);
pending.sincronizarAnimacionSatelital();
assert.equal(pending.timerCount(), 1, "Saved manual intent starts when a second frame becomes available.");
pending.satelite.visible = false;
pending.sincronizarAnimacionSatelital();
assert.equal(pending.timerCount(), 0, "Leaving the viewport pauses playback.");
pending.satelite.visible = true;
pending.sincronizarAnimacionSatelital();
assert.equal(pending.timerCount(), 1, "Returning to the viewport resumes requested playback.");
pending.satelite.paginaVisible = false;
pending.sincronizarAnimacionSatelital();
assert.equal(pending.timerCount(), 0, "A hidden document pauses playback.");
pending.satelite.paginaVisible = true;
pending.sincronizarAnimacionSatelital();
assert.equal(pending.timerCount(), 1, "A visible document resumes requested playback.");
pending.alternarReproduccionSatelital();
assert.equal(pending.timerCount(), 0, "Manual Pause stops playback.");

const reduced = createPlayer({ reducedMotion: true });
reduced.addFrames(6);
reduced.sincronizarAnimacionSatelital();
assert.equal(reduced.timerCount(), 0, "Reduced motion suppresses autoplay.");
reduced.alternarReproduccionSatelital();
assert.equal(reduced.timerCount(), 1, "An explicit Play request overrides reduced-motion autoplay suppression.");
reduced.alternarReproduccionSatelital();
assert.equal(reduced.timerCount(), 0, "Explicit Pause still stops playback with reduced motion.");

console.log("satellite player tests: OK (intent, timer, frames, visibility and reduced-motion manual play)");
