// Telegram Mini App setup for the match preview (same calls as the prototype's common.js, plus landscape lock).
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!(tg && tg.platform && tg.platform !== 'unknown')) return;
  try { tg.ready(); tg.expand(); } catch (e) {}
  try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) {}
  try { if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && tg.requestFullscreen && !tg.isFullscreen) tg.requestFullscreen(); } catch (e) {}
  try { if (tg.lockOrientation && innerWidth > innerHeight) tg.lockOrientation(); } catch (e) {}
  try { tg.BackButton.show(); tg.BackButton.onClick(function () { location.href = '../'; }); } catch (e) {}
})();
