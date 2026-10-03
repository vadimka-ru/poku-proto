// Loaded before the engine (html/head_include): Telegram Mini App setup and a handle on the engine's wasm memory.
window.__pokuT0 = performance.now();
(function () {
  try {
    var tg = window.Telegram && Telegram.WebApp;
    if (tg && tg.platform && tg.platform !== 'unknown') {
      tg.ready(); tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && tg.requestFullscreen) tg.requestFullscreen();
      tg.BackButton.show(); tg.BackButton.onClick(function () { location.href = '../'; });
    }
  } catch (e) {}
  function grab(result) {
    try {
      var ex = (result.instance || result).exports;
      for (var k in ex) if (ex[k] instanceof WebAssembly.Memory) window.__wasmMem = ex[k];
    } catch (e) {}
    return result;
  }
  var inst = WebAssembly.instantiate, stream = WebAssembly.instantiateStreaming;
  WebAssembly.instantiate = function () { return inst.apply(this, arguments).then(grab); };
  if (stream) WebAssembly.instantiateStreaming = function () { return stream.apply(this, arguments).then(grab); };
})();
