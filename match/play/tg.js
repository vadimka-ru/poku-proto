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
