// Shared by every page: Telegram Mini App setup (works as a plain web page too) and device info.
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  var inTelegram = !!(tg && tg.platform && tg.platform !== 'unknown');
  if (inTelegram) {
    try { tg.ready(); tg.expand(); } catch (e) {}
    try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) {}
    try { if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && tg.requestFullscreen && !tg.isFullscreen) tg.requestFullscreen(); } catch (e) {}
    try {
      if (!/\/(index\.html)?$/.test(location.pathname) || /\/(sim|rtc|godot)\//.test(location.pathname)) {
        tg.BackButton.show();
        tg.BackButton.onClick(function () { location.href = '../'; });
      }
    } catch (e) {}
  }

  function deviceInfo() {
    var n = navigator, s = screen;
    var rows = [
      ['In Telegram', inTelegram ? 'YES: ' + tg.platform + ', WebApp ' + tg.version + (tg.isFullscreen ? ', fullscreen' : '') : 'no (plain browser)'],
      ['Browser', n.userAgent],
      ['Screen', s.width + 'x' + s.height + ' @' + (window.devicePixelRatio || 1) + 'x, viewport ' + innerWidth + 'x' + innerHeight],
      ['CPU cores', n.hardwareConcurrency || '?'],
      ['Device memory', n.deviceMemory ? n.deviceMemory + ' GB' : '? (not reported)'],
      ['WebAssembly', typeof WebAssembly === 'object' ? 'yes' : 'NO'],
      ['crossOriginIsolated / SharedArrayBuffer', String(window.crossOriginIsolated) + ' / ' + (typeof SharedArrayBuffer !== 'undefined')],
      ['WebRTC', typeof RTCPeerConnection !== 'undefined' ? 'yes' : 'NO'],
      ['WebGL2', (function () { try { return !!document.createElement('canvas').getContext('webgl2') ? 'yes' : 'NO'; } catch (e) { return 'NO'; } })()],
      ['Connection', n.connection ? (n.connection.effectiveType || '') + ' ' + (n.connection.type || '') + ' ' + (n.connection.downlink ? n.connection.downlink + ' Mb/s' : '') : '?'],
    ];
    return rows;
  }

  function haptic(kind) { try { if (inTelegram) tg.HapticFeedback.notificationOccurred(kind); } catch (e) {} }

  // Local desktop runs only (tools/serve.py): ?report=NAME posts the page's text back to the server.
  function report(text) {
    var name = new URLSearchParams(location.search).get('report');
    if (!name) return;
    try { fetch('/report/' + encodeURIComponent(name), { method: 'POST', body: text }); } catch (e) {}
  }

  window.Poku = { report: report, tg: tg, inTelegram: inTelegram, deviceInfo: deviceInfo, haptic: haptic,
    mb: function (bytes) { return (bytes / 1048576).toFixed(2) + ' MB'; } };
})();
