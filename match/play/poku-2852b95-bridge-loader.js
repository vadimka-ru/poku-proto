// Loaded by the page (html/head_include) before the engine: starts the .NET WebAssembly runtime that holds the simulation
// and publishes its exports as window.SimWasm for SimBridge.gd (JavaScriptBridge.get_interface("SimWasm")).
// window.__simReady flips to true once the runtime is up; the engine does not wait for it, GDScript polls it.
// On the game page (tools/web-build.sh -> web/play.html) the files of the bridge are already downloading from the first moment, in parallel with the engine and the
// .pck, through window.__pokuEarly (name -> {take()} giving the tracked Response, see play.html): the runtime asks for each of its boot resources through loadBootResource
// and gets that Response instead of starting a new download. A page without the registry (a plain export) loads the files the usual way.
window.__simReady = false;
window.__simError = "";
(async function () {
  try {
    const t0 = performance.now();
    const { dotnet } = await import("./poku-2852b95-bridge/_framework/dotnet.js");
    const early = window.__pokuEarly || {};
    const runtime = await dotnet.withDiagnosticTracing(false)
      .withResourceLoader(function (type, name) {
        // 'dotnetjs' modules must come back as URLs (they are import()ed), those are small and left to the runtime
        const hit = type === "dotnetjs" ? null : early[name];
        return hit ? hit.take() : undefined;
      })
      .create();
    const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
    window.SimWasm = exports.SimWasm;
    window.__simLoadMs = performance.now() - t0;
    window.__simReady = true;
    if (window.__pokuMark) window.__pokuMark("bridgeReady");
  } catch (e) {
    window.__simError = (e && (e.message || e.stack)) ? String(e.message || e.stack) : String(e);
    console.error("bridge load failed", e);
    if (window.__pokuMark) window.__pokuMark("bridgeFailed");
  }
})();
