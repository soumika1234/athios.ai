(function () {
  var el = document.getElementById('intro');
  if (!el) return;
  if (document.documentElement.classList.contains('no-intro')) { el.remove(); return; }
  try { sessionStorage.setItem('athios-intro', '1'); } catch (e) {}
  var timer = setTimeout(done, 5900);
  function done() {
    clearTimeout(timer);
    el.classList.add('skip');
    setTimeout(function () { el.remove(); }, 600);
  }
  el.addEventListener('click', done);
  addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Enter') done(); });
})();
