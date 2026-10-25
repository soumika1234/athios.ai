(function () {
  var r = document.documentElement;
  try { var t = localStorage.getItem('athios-theme'); if (t) r.dataset.theme = t; } catch (e) {}
  document.getElementById('theme').addEventListener('click', function () {
    var c = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = c === 'dark' ? 'light' : 'dark';
    r.dataset.theme = n;
    try { localStorage.setItem('athios-theme', n); } catch (e) {}
  });
  var eye = document.querySelector('.eye'), pw = document.getElementById('password');
  eye.addEventListener('click', function () {
    var hidden = pw.type === 'password';
    pw.type = hidden ? 'text' : 'password';
    eye.textContent = hidden ? 'Hide' : 'Show';
  });
  document.querySelector('form').addEventListener('submit', function () {
    var b = this.querySelector('button[type=submit]'); b.textContent = 'Please wait...';
    setTimeout(function () { b.disabled = true; }, 0);
  });
})();
