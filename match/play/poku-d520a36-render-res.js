// Render resolution of the web build (?res=), set in the page head BEFORE the engine starts. Godot sizes the canvas backing store as
// innerWidth * window.devicePixelRatio (GodotDisplayScreen.getPixelRatio) on every resize, so this is the one place that changes how many pixels
// the GPU fills: window.devicePixelRatio is replaced by a getter. The canvas keeps its CSS size, the browser stretches the smaller backing store.
// Godot maps pointer events with canvas.width / getBoundingClientRect().width, so touches stay correct; the project's canvas_items stretch just
// gets a smaller window (the logical 540-high screen is unchanged).
//   res=native     one backing-store pixel per device pixel (the old behaviour; the default on desktop)
//   res=0.5        a scale factor on the device pixel ratio (0.1 .. 1; 0.75, 0.5 ...)
//   res=viewport   about one backing-store pixel per logical pixel of the 960x540 base screen (the cheapest; the default on phones and tablets)
//   filter=nearest|linear   how the browser stretches the smaller canvas (default: linear for viewport and factors; pixelated needs whole-number ratios)
// window.__pokuRes = {req, mode, factor, native, source, phone, filter} tells the game (perf overlay) what was chosen.
(function () {
  var BASE_W = 960, BASE_H = 540;
  var q = new URLSearchParams(location.search);
  var tg = window.Telegram && window.Telegram.WebApp;
  var platform = (tg && tg.platform) || ((/[?&#]tgWebAppPlatform=([^&#]*)/.exec(location.hash + location.search) || [])[1]) || '';
  var coarse = false;
  try { coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) {}
  var phone = /^(ios|android|android_x)$/.test(platform) || coarse;
  var native = window.devicePixelRatio || 1;
  var req = q.get('res');
  var source = 'query';
  if (req === null || req === '') { req = phone ? 'viewport' : 'native'; source = phone ? 'phone default' : 'desktop default'; }
  var factor = parseFloat(req);
  var mode = req === 'viewport' ? 'viewport' : (factor > 0 && factor < 1 ? 'factor' : 'native');
  if (mode === 'native') factor = 1;
  var filter = q.get('filter') === 'nearest' ? 'nearest' : 'linear';
  var info = window.__pokuRes = { req: req, mode: mode, factor: mode === 'factor' ? factor : 0, native: native, source: source, phone: phone, filter: filter };
  if (mode === 'native') return;
  function effective() {
    var dpr = mode === 'viewport'
      ? Math.max(BASE_W / Math.max(window.innerWidth, 1), BASE_H / Math.max(window.innerHeight, 1))
      : native * factor;
    return Math.min(native, Math.max(dpr, 0.25));
  }
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: effective });
  // floor(floor(w * s) / s) can be a pixel short at a fractional ratio: keep the canvas covering the whole window
  var st = document.createElement('style');
  st.textContent = 'html,body{width:100%;height:100%}#canvas{width:100%!important;height:100%!important;' + (filter === 'nearest' ? 'image-rendering:pixelated;' : '') + '}';
  document.head.appendChild(st);
})();
