// ice.json (STUN/TURN list) is fetched here with the browser's fetch(); client/net/IceConfig.gd reads window.__pokuIce. Godot's HTTPRequest cannot
// read gzip-compressed responses (GitHub Pages gzips), which left phones without TURN. A 404 on pages without an ice.json is harmless.
(function () {
  window.__pokuIce = { state: 'loading' };
  try {
    fetch(new URL('ice.json', location.href).href + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
      .then(function (text) { window.__pokuIce = { state: 'ok', text: text }; })
      .catch(function (e) { window.__pokuIce = { state: 'error', error: String(e && e.message || e) }; });
  } catch (e) { window.__pokuIce = { state: 'error', error: String(e) }; }
})();
// Runs in the page head, before the engine downloads (the game's own client/platform/Telegram.gd repeats these calls: all idempotent):
// the Mini App setup the prototype's common.js does, so Telegram drops its splash and goes full screen while the 12 MB load.
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!(tg && tg.platform && tg.platform !== 'unknown')) return;
  try { tg.ready(); tg.expand(); } catch (e) {}
  try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) {}
  try { if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && tg.requestFullscreen && !tg.isFullscreen) tg.requestFullscreen(); } catch (e) {}
  try { if (tg.lockOrientation && innerWidth > innerHeight) tg.lockOrientation(); } catch (e) {}
  try { tg.BackButton.show(); tg.BackButton.onClick(function () { location.href = '../'; }); } catch (e) {}
})();
