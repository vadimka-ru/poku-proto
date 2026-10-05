// Loaded by the page (html/head_include) before the engine: starts the .NET WebAssembly runtime that holds the simulation
// and publishes its exports as window.SimWasm for SimBridge.gd (JavaScriptBridge.get_interface("SimWasm")).
// window.__simReady flips to true once the runtime is up; the engine does not wait for it, GDScript polls it.
window.__simReady = false;
window.__simError = "";
(async function () {
  try {
    const t0 = performance.now();
    const { dotnet } = await import("./poku-80dfbb6-bridge/_framework/dotnet.js");
    const runtime = await dotnet.withDiagnosticTracing(false).create();
    const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
    window.SimWasm = exports.SimWasm;
    window.__simLoadMs = performance.now() - t0;
    window.__simReady = true;
  } catch (e) {
    window.__simError = String(e);
    console.error("bridge load failed", e);
  }
})();
