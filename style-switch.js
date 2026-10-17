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
  var DIAL = '<svg viewBox="0 0 200 100" aria-hidden="true"><path d="M42 59.8 A78 78 0 0 1 124.1 37.8" fill="none" stroke="#3a2a12" stroke-width="1.2"/><path d="M124.1 37.8 A78 78 0 0 1 158 59.8" fill="none" stroke="#c0281e" stroke-width="1.2"/><path d="M125.2 34.5 A81.5 81.5 0 0 1 160.6 57.5" fill="none" stroke="#c0281e" stroke-width="4.5"/><line x1="42" y1="59.8" x2="36.1" y2="54.5" stroke="#3a2a12" stroke-width="1.2"/><line x1="57.5" y1="46.6" x2="53.2" y2="39.9" stroke="#3a2a12" stroke-width="1.2"/><line x1="68.3" y1="40.7" x2="65" y2="33.4" stroke="#3a2a12" stroke-width="1.2"/><line x1="78.5" y1="37" x2="76.3" y2="29.3" stroke="#3a2a12" stroke-width="1.2"/><line x1="93.2" y1="34.3" x2="92.5" y2="26.3" stroke="#3a2a12" stroke-width="1.2"/><line x1="102.7" y1="34" x2="102.9" y2="29.1" stroke="#3a2a12" stroke-width="1.2"/><line x1="112.2" y1="35" x2="113" y2="30" stroke="#3a2a12" stroke-width="1.2"/><line x1="124.1" y1="37.8" x2="126.6" y2="30.2" stroke="#3a2a12" stroke-width="1.2"/><line x1="136.6" y1="43.1" x2="140.4" y2="36.1" stroke="#c0281e" stroke-width="1.2"/><line x1="148" y1="50.5" x2="152.9" y2="44.2" stroke="#c0281e" stroke-width="1.2"/><line x1="158" y1="59.8" x2="163.9" y2="54.5" stroke="#c0281e" stroke-width="1.2"/><g font-family="Open Sans,Arial,sans-serif" font-size="7.5" fill="#3a2a12" text-anchor="middle"><text x="30.9" y="52.3">-20</text><text x="49.3" y="36.5">-10</text><text x="62.2" y="29.5">-7</text><text x="74.4" y="25.1">-5</text><text x="91.9" y="21.9">-3</text><text x="128.7" y="26.1">0</text><text x="143.7" y="32.4" fill="#c0281e">+1</text><text x="157.3" y="41.2" fill="#c0281e">+2</text><text x="169.1" y="52.3" fill="#c0281e">+3</text><text x="100" y="80" font-size="13" font-weight="700">VU</text></g><line class="needle" x1="100" y1="112" x2="100" y2="26" stroke="#1b1b1b" stroke-width="1.6" stroke-linecap="round"/><circle cx="100" cy="112" r="15" fill="#1b1b1b"/></svg>';

  function buildVU(box) {
    box.innerHTML =
      '<div class="vu-meters"><div class="vu">' + DIAL + '</div><div class="vu">' + DIAL + '</div></div>' +
      '<div class="vu-ctrl">' +
        '<button type="button" class="vu-auto" aria-pressed="true">Auto</button>' +
        '<input type="range" class="vu-range" min="-20" max="3" step="0.5" value="-7" aria-label="VU meter preview level">' +
        '<output class="vu-read">-7 dB</output>' +
      '</div>';
    var needles = box.querySelectorAll('.needle');
    var auto = box.querySelector('.vu-auto'), range = box.querySelector('.vu-range'), read = box.querySelector('.vu-read');
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var isAuto = !reduce, level = -20, target = -7, nextAt = 0, last = 0;

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
        for (var i = 0; i < needles.length; i++) needles[i].setAttribute('transform', 'rotate(' + a + ' 100 112)');
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
    if (finishBtn) finishBtn.addEventListener('click', function () {
      var fin = d.getAttribute('data-finish') === 'silver' ? 'black' : 'silver';
      d.setAttribute('data-finish', fin); save('ra-finish', fin); sync();
    });
    sync();
    document.querySelectorAll('[data-vu]').forEach(buildVU);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
