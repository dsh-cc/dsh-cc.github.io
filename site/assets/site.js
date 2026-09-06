// Copy button: grabs the $-prefixed commands from the quick-start block.
(function () {
  var btn = document.getElementById('copy');
  if (!btn) return;
  var idleLabel = btn.textContent;
  btn.addEventListener('click', async function () {
    var text = document.getElementById('cmd').innerText
      .split('\n').filter(function (l) { return l.startsWith('$'); })
      .map(function (l) { return l.slice(2); }).join(' && ');
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = btn.dataset.copied || 'Copied!';
    } catch (e) {
      btn.textContent = text;
    }
    setTimeout(function () { btn.textContent = idleLabel; }, 1600);
  });
})();

// Language links: remember the explicit choice so the auto-routing on /
// never overrides it on later visits.
(function () {
  document.querySelectorAll('a.lang[data-lang]').forEach(function (a) {
    a.addEventListener('click', function () {
      try { localStorage.setItem('dshcc-lang', a.dataset.lang); } catch (e) { /* ignore */ }
    });
  });
})();
