// Analytics transport of the game page (spec docs/superpowers/specs/2026-10-08-telegram-launch-analytics-load-font-design.md, A.6). The game
// (client/platform/Analytics.gd) pushes events into window.__pokuAQ (a plain array, made by whoever comes first); window.__pokuA.start(url, build)
// switches sending on (the game leaves window.__pokuAStart = [url, build] when this file has not loaded yet). Batches of at most 10 events and
// 1024 bytes go out with navigator.sendBeacon as text/plain (a "simple" cross-origin request: no preflight), else fetch keepalive no-cors. Sent every
// 15 s, as soon as 8 events wait, and when the page is hidden (visibilitychange, pagehide: Telegram closing the mini app). A batch that could not be
// handed over is tried once more with the next send, then dropped. The queue keeps the newest 60 events. The raw Telegram user id is added to app_open
// only, and only when the events address is https (ws:// game servers map to http://) or this machine (127.0.0.1, localhost: the e2e);
// the server hashes it with its secret salt and never stores it. Never throws into the page, never blocks the game.
(function () {
  'use strict';
  var MAX_BYTES = 1024, MAX_EVENTS = 10, MAX_QUEUE = 60, EVERY_MS = 15000, SOON = 8;
  var q = window.__pokuAQ = window.__pokuAQ || [];
  var url = '', build = '', aid = '', sid = rid(9), plat = '', retry = null, on = false, tgOk = false;

  function rid(n) {
    var a = new Uint8Array(n), s = '';
    try { window.crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); }
    for (var j = 0; j < n; j++) s += String.fromCharCode(a[j]);
    return window.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function deviceId() {
    try {
      var v = window.localStorage.getItem('poku.aid');
      if (v && /^[A-Za-z0-9_-]{16,32}$/.test(v)) return v;
      v = rid(16); window.localStorage.setItem('poku.aid', v); return v;
    } catch (e) { return rid(16); }
  }
  function platform() {
    try {
      var p = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.platform;
      if (p && p !== 'unknown') return p === 'ios' ? 'ios' : /^android/.test(p) ? 'android' : (p === 'tdesktop' || p === 'macos') ? 'desktop' : 'web';
    } catch (e) {}
    var ua = (window.navigator && window.navigator.userAgent) || '';
    return /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'web';
  }
  function tgId() {
    try { var u = window.Telegram.WebApp.initDataUnsafe.user; return u && u.id ? String(u.id) : ''; } catch (e) { return ''; }
  }
  function bytes(s) { try { return new window.Blob([s]).size; } catch (e) { return s.length * 3; } }

  // The next batch from the head of the queue: as many events as fit; an event too big for any batch is dropped.
  function take() {
    var ev = [], body = '';
    while (q.length && ev.length < MAX_EVENTS) {
      var e = q[0];
      if (e && e.n === 'app_open' && tgOk && !('tg' in e)) { var id = tgId(); if (id) e.tg = id; }
      var next = JSON.stringify({ v: 1, aid: aid, sid: sid, b: build, p: plat, ev: ev.concat([e]) });
      if (bytes(next) > MAX_BYTES) { if (!ev.length) { q.shift(); continue; } break; }
      ev.push(q.shift()); body = next;
    }
    return body;
  }
  function send(body) {
    try { if (window.navigator.sendBeacon && window.navigator.sendBeacon(url, new window.Blob([body], { type: 'text/plain' }))) return true; } catch (e) {}
    try {
      if (window.fetch) { window.fetch(url, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }).catch(function () {}); return true; }
    } catch (e) {}
    return false;
  }
  function flush() {
    if (!on) return;
    if (retry) { var r = retry; retry = null; send(r); }            // the one retry: dropped whatever happens
    for (var i = 0; i < 6 && q.length; i++) { var b = take(); if (!b) break; if (!send(b)) { retry = b; break; } }
  }
  q.push = function () {
    for (var i = 0; i < arguments.length; i++) Array.prototype.push.call(q, arguments[i]);
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
    if (on && q.length >= SOON) flush();
    return q.length;
  };
  if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);

  function start(u, b) {
    if (on || typeof u !== 'string' || !/^https?:\/\/[^\s]+$/.test(u)) return false;
    url = u; tgOk = /^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/)/.test(u); build = String(b || '').replace(/[^A-Za-z0-9 .:+_-]/g, '').slice(0, 40) || 'unknown';
    aid = deviceId(); plat = platform(); on = true;
    window.setInterval(flush, EVERY_MS);
    try { window.document.addEventListener('visibilitychange', function () { if (window.document.visibilityState === 'hidden') flush(); }); } catch (e) {}
    try { window.addEventListener('pagehide', flush); } catch (e) {}
    flush();
    return true;
  }
  window.__pokuA = { start: start, flush: flush, state: function () { return { on: on, queued: q.length, retry: !!retry, aid: aid, sid: sid, p: plat }; } };
  if (window.__pokuAStart) { try { start(window.__pokuAStart[0], window.__pokuAStart[1]); } catch (e) {} }
})();
