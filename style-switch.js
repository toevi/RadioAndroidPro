/* RadioAndroid page style: Modern / Vintage (black, silver) + VU meters.
   Loaded in <head> so the saved style is applied before the page paints. */
(function () {
  var d = document.documentElement, st = null, fi = null;
  try { st = localStorage.getItem('ra-style'); fi = localStorage.getItem('ra-finish'); } catch (e) {}
  var q = /[?&]style=(vintage|modern)/.exec(location.search); if (q) st = q[1];
  var f = /[?&]finish=(black|silver)/.exec(location.search); if (f) fi = f[1];
  d.setAttribute('data-style', st === 'vintage' ? 'vintage' : 'modern');
  d.setAttribute('data-finish', fi === 'silver' ? 'silver' : 'black');

  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // dB -> needle angle (degrees from vertical), same scale as the dial
  var SCALE = [[-20, -48], [-10, -33], [-7, -24], [-5, -16], [-3, -5], [-2, 2], [-1, 9], [0, 18], [1, 28], [2, 38], [3, 48]];
  function angle(db) {
    if (db <= SCALE[0][0]) return SCALE[0][1];
    for (var i = 1; i < SCALE.length; i++) {
      if (db <= SCALE[i][0]) {
        var a = SCALE[i - 1], b = SCALE[i], t = (db - a[0]) / (b[0] - a[0]);
        return a[1] + t * (b[1] - a[1]);
      }
    }
    return SCALE[SCALE.length - 1][1];
  }
  var PHOTO_DIAL = '<svg viewBox="0 0 309 128" aria-hidden="true"><defs><linearGradient id="__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe8b6"/><stop offset="0.55" stop-color="#f3d08c"/><stop offset="1" stop-color="#e2b65a"/></linearGradient></defs><rect x="0.5" y="0.5" width="308" height="127" rx="8" fill="url(#__ID__)" stroke="#5a4520" stroke-width="1"/><path d="M38.7 78.3 A181 181 0 0 1 271.3 78.3" fill="none" stroke="#2a2010" stroke-width="2"/><path d="M235.2 52.5 A183 183 0 0 1 272.6 76.8" fill="none" stroke="#c0281e" stroke-width="6"/><line x1="39.3" y1="79.1" x2="31.6" y2="69.9" stroke="#2a2010" stroke-width="2"/><line x1="49.2" y1="71.4" x2="44.5" y2="64.9" stroke="#2a2010" stroke-width="1.3"/><line x1="59.6" y1="64.4" x2="55.4" y2="57.6" stroke="#2a2010" stroke-width="1.3"/><line x1="70.5" y1="58.1" x2="66.7" y2="51" stroke="#2a2010" stroke-width="1.3"/><line x1="81.8" y1="52.6" x2="78.5" y2="45.3" stroke="#2a2010" stroke-width="1.3"/><line x1="93.4" y1="47.9" x2="89.3" y2="36.6" stroke="#2a2010" stroke-width="2"/><line x1="105.4" y1="44" x2="103.2" y2="36.3" stroke="#2a2010" stroke-width="1.3"/><line x1="117.6" y1="40.9" x2="115.9" y2="33.1" stroke="#2a2010" stroke-width="1.3"/><line x1="129.9" y1="38.8" x2="128.8" y2="30.8" stroke="#2a2010" stroke-width="1.3"/><line x1="142.4" y1="37.4" x2="141.9" y2="29.5" stroke="#2a2010" stroke-width="1.3"/><line x1="155" y1="37" x2="155" y2="25" stroke="#2a2010" stroke-width="2"/><line x1="167.6" y1="37.4" x2="168.1" y2="29.5" stroke="#2a2010" stroke-width="1.3"/><line x1="180.1" y1="38.8" x2="181.2" y2="30.8" stroke="#2a2010" stroke-width="1.3"/><line x1="192.4" y1="40.9" x2="194.1" y2="33.1" stroke="#2a2010" stroke-width="1.3"/><line x1="204.6" y1="44" x2="206.8" y2="36.3" stroke="#2a2010" stroke-width="1.3"/><line x1="216.6" y1="47.9" x2="220.7" y2="36.6" stroke="#2a2010" stroke-width="2"/><line x1="228.2" y1="52.6" x2="231.5" y2="45.3" stroke="#2a2010" stroke-width="1.3"/><line x1="239.5" y1="58.1" x2="243.3" y2="51" stroke="#c0281e" stroke-width="1.3"/><line x1="250.4" y1="64.4" x2="254.6" y2="57.6" stroke="#c0281e" stroke-width="1.3"/><line x1="260.8" y1="71.4" x2="265.5" y2="64.9" stroke="#c0281e" stroke-width="1.3"/><line x1="270.7" y1="79.1" x2="278.4" y2="69.9" stroke="#c0281e" stroke-width="2"/><g font-family="Open Sans,Arial,sans-serif" font-size="15" fill="#2a2010" text-anchor="middle"><text x="21.9" y="63.4">0</text><text x="84.2" y="27.5">5</text><text x="155" y="15">10</text><text x="225.8" y="27.5">15</text><text x="288.1" y="63.4" fill="#c0281e">20</text><text x="154" y="87" font-size="22">VU</text><text x="14" y="117" font-size="14" text-anchor="start">__CH__</text></g><circle class="peak" cx="292" cy="15" r="5.5" fill="#9a5a4a"/><g class="needle" data-k="0.8333" data-cx="155" data-cy="217"><line x1="158" y1="217" x2="158" y2="32" stroke="rgba(120,80,20,0.45)" stroke-width="3"/><line x1="155" y1="217" x2="155" y2="30" stroke="#1d1d1d" stroke-width="3" stroke-linecap="round"/></g></svg>';
  var DIAL = '<svg viewBox="0 0 200 100" aria-hidden="true"><path d="M42 59.8 A78 78 0 0 1 124.1 37.8" fill="none" stroke="#3a2a12" stroke-width="1.2"/><path d="M124.1 37.8 A78 78 0 0 1 158 59.8" fill="none" stroke="#c0281e" stroke-width="1.2"/><path d="M125.2 34.5 A81.5 81.5 0 0 1 160.6 57.5" fill="none" stroke="#c0281e" stroke-width="4.5"/><line x1="42" y1="59.8" x2="36.1" y2="54.5" stroke="#3a2a12" stroke-width="1.2"/><line x1="57.5" y1="46.6" x2="53.2" y2="39.9" stroke="#3a2a12" stroke-width="1.2"/><line x1="68.3" y1="40.7" x2="65" y2="33.4" stroke="#3a2a12" stroke-width="1.2"/><line x1="78.5" y1="37" x2="76.3" y2="29.3" stroke="#3a2a12" stroke-width="1.2"/><line x1="93.2" y1="34.3" x2="92.5" y2="26.3" stroke="#3a2a12" stroke-width="1.2"/><line x1="102.7" y1="34" x2="102.9" y2="29.1" stroke="#3a2a12" stroke-width="1.2"/><line x1="112.2" y1="35" x2="113" y2="30" stroke="#3a2a12" stroke-width="1.2"/><line x1="124.1" y1="37.8" x2="126.6" y2="30.2" stroke="#3a2a12" stroke-width="1.2"/><line x1="136.6" y1="43.1" x2="140.4" y2="36.1" stroke="#c0281e" stroke-width="1.2"/><line x1="148" y1="50.5" x2="152.9" y2="44.2" stroke="#c0281e" stroke-width="1.2"/><line x1="158" y1="59.8" x2="163.9" y2="54.5" stroke="#c0281e" stroke-width="1.2"/><g font-family="Open Sans,Arial,sans-serif" font-size="7.5" fill="#3a2a12" text-anchor="middle"><text x="30.9" y="52.3">-20</text><text x="49.3" y="36.5">-10</text><text x="62.2" y="29.5">-7</text><text x="74.4" y="25.1">-5</text><text x="91.9" y="21.9">-3</text><text x="128.7" y="26.1">0</text><text x="143.7" y="32.4" fill="#c0281e">+1</text><text x="157.3" y="41.2" fill="#c0281e">+2</text><text x="169.1" y="52.3" fill="#c0281e">+3</text><text x="100" y="80" font-size="13" font-weight="700">VU</text></g><line class="needle" x1="100" y1="112" x2="100" y2="26" stroke="#1b1b1b" stroke-width="1.6" stroke-linecap="round"/><circle cx="100" cy="112" r="15" fill="#1b1b1b"/></svg>';

  function buildVU(box) {
    var photo = box.getAttribute('data-vu') === 'photo';
    var meters = '<div class="vu-meters"><div class="vu">' + DIAL + '</div><div class="vu">' + DIAL + '</div></div>';
    if (photo) {                                   // live dials laid over the app screenshot's VU windows
      var img = Array.prototype.map.call(box.querySelectorAll('img'), function (i) { return i.outerHTML; }).join('');
      meters = '<div class="vu-photo">' + img +
        '<div class="vu-face l">' + PHOTO_DIAL.replace(/__ID__/g, 'vuf-l').replace('__CH__', 'L') + '</div>' +
        '<div class="vu-face r">' + PHOTO_DIAL.replace(/__ID__/g, 'vuf-r').replace('__CH__', 'R') + '</div></div>';
    }
    box.innerHTML = meters +
      '<div class="vu-ctrl">' +
        '<button type="button" class="vu-auto" aria-pressed="true">Auto</button>' +
        '<input type="range" class="vu-range" min="-20" max="3" step="0.5" value="-7" aria-label="VU meter preview level">' +
        '<output class="vu-read">-7 dB</output>' +
      '</div>';
    var needles = box.querySelectorAll('.needle');
    var auto = box.querySelector('.vu-auto'), range = box.querySelector('.vu-range'), read = box.querySelector('.vu-read');
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var isAuto = !reduce, level = -20, target = -7, nextAt = 0, last = 0, peakUntil = 0, peakOn = false;

    function setAuto(on) { isAuto = on; auto.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    function show(db) { read.textContent = (db > 0 ? '+' : '') + (Math.round(db * 2) / 2) + ' dB'; }
    setAuto(isAuto);
    if (!isAuto) target = level = -5;
    auto.addEventListener('click', function () { setAuto(!isAuto); });
    range.addEventListener('input', function () { setAuto(false); target = parseFloat(range.value); show(target); });

    function frame(now) {
      var dt = last ? Math.min(now - last, 100) : 16; last = now;
      if (box.offsetParent !== null) {            // only while the meters are visible
        if (isAuto && now >= nextAt) {            // music-like level: mostly -10..0 dB, occasional peaks
          var r = Math.random();
          target = r < 0.1 ? 0.5 + Math.random() * 2 : r < 0.3 ? -13 + Math.random() * 5 : -8 + Math.random() * 8;
          nextAt = now + 550 + Math.random() * 700;
        }
        // VU ballistics, frame-rate independent; both channels move together
        level += (target - level) * (1 - Math.exp(-dt / (isAuto ? 420 : 180)));
        var a = angle(level).toFixed(2);
        for (var i = 0; i < needles.length; i++) {
          var n = needles[i], k = n.getAttribute('data-k');
          n.setAttribute('transform', k ? 'rotate(' + (a * k).toFixed(2) + ' ' + n.getAttribute('data-cx') + ' ' + n.getAttribute('data-cy') + ')'
                                        : 'rotate(' + a + ' 100 112)');
        }
        if (level >= 0.8) peakUntil = now + 450;           // peak lamps: red zone reached, short hold
        if ((now < peakUntil) !== peakOn) { peakOn = !peakOn; box.classList.toggle('vu-peak', peakOn); }
        if (isAuto) { range.value = level.toFixed(1); show(level); }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function init() {
    var finishBtn = document.querySelector('[data-toggle-finish]');
    function sync() {
      var s = d.getAttribute('data-style'), fin = d.getAttribute('data-finish');
      document.querySelectorAll('[data-set-style]').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-set-style') === s ? 'true' : 'false');
      });
      document.querySelectorAll('[data-set-finish]').forEach(function (b) {
        b.setAttribute('aria-pressed', s === 'vintage' && b.getAttribute('data-set-finish') === fin ? 'true' : 'false');
      });
      if (finishBtn) {
        finishBtn.textContent = fin === 'silver' ? 'Black' : 'Silver';
        finishBtn.setAttribute('aria-label', 'Switch to ' + (fin === 'silver' ? 'black' : 'silver') + ' finish');
      }
    }
    document.querySelectorAll('[data-set-style]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-set-style');
        d.setAttribute('data-style', s); save('ra-style', s); sync();
      });
    });
    document.querySelectorAll('[data-set-finish]').forEach(function (b) {
      b.addEventListener('click', function () {
        var fin = b.getAttribute('data-set-finish');
        d.setAttribute('data-finish', fin); save('ra-finish', fin); sync();
      });
    });
    // buttons inside the gallery box: keep that box in view after the layout changes
    document.querySelectorAll('.style-try button').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = b.closest('.style-try');
        var go = function () { box.scrollIntoView({ block: 'start', behavior: 'instant' }); };
        requestAnimationFrame(go); setTimeout(go, 250);
      });
    });
    if (finishBtn) finishBtn.addEventListener('click', function () {
      var fin = d.getAttribute('data-finish') === 'silver' ? 'black' : 'silver';
      d.setAttribute('data-finish', fin); save('ra-finish', fin); sync();
    });
    sync();
    document.querySelectorAll('[data-vu]').forEach(buildVU);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
