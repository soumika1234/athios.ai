(function () {
  var r = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  r.classList.add('js');
  try { var t = localStorage.getItem('athios-theme'); if (t) r.dataset.theme = t; } catch (e) {}
  document.getElementById('theme').addEventListener('click', function () {
    var c = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = c === 'dark' ? 'light' : 'dark';
    r.dataset.theme = n;
    try { localStorage.setItem('athios-theme', n); } catch (e) {}
  });
  if (reduce) document.querySelectorAll('animate,animateMotion').forEach(function (e) { e.remove(); });

  // Reveal on scroll
  var els = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  } else { els.forEach(function (el) { el.classList.add('on'); }); }

  // Scroll progress, parallax background, nav highlight, back-to-top
  var up = document.querySelector('.up'), tick = false;
  function frame() {
    tick = false;
    var y = window.scrollY, m = r.scrollHeight - innerHeight;
    r.style.setProperty('--sy', y);
    r.style.setProperty('--prog', m > 0 ? y / m : 0);
    up.classList.toggle('show', y > 600);
  }
  addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(frame); } }, { passive: true });
  frame();

  // Tilt cards toward the cursor
  document.querySelectorAll('.card').forEach(function (c) {
    c.addEventListener('pointermove', function (e) {
      var b = c.getBoundingClientRect();
      c.style.setProperty('--ry', ((e.clientX - b.left) / b.width - 0.5) * 8 + 'deg');
      c.style.setProperty('--rx', (0.5 - (e.clientY - b.top) / b.height) * 8 + 'deg');
    });
    c.addEventListener('pointerleave', function () { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
  });

  // Typing placeholder in the prompt box
  var inp = document.getElementById('ask'), i = 0, j = 0, del = false;
  var ex = ['Explain how a transformer works', 'Draft an email asking for an extension', 'Make revision notes on photosynthesis', 'Help me brainstorm project ideas'];
  function type() {
    var s = ex[i], d = del ? 25 : 55;
    j += del ? -1 : 1;
    inp.placeholder = s.slice(0, j) || ' ';
    if (!del && j === s.length) { del = true; d = 1600; }
    else if (del && j === 0) { del = false; i = (i + 1) % ex.length; d = 400; }
    setTimeout(type, d);
  }
  if (inp && !reduce) type();

  // Preview-only: do nothing when the form has no real route
  var f = document.querySelector('.ask');
  if (f) f.addEventListener('submit', function (e) { if (f.getAttribute('action') === '#') e.preventDefault(); });
  document.getElementById('yr').textContent = new Date().getFullYear();
})();
