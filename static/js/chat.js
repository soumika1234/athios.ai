(function () {
  var r = document.documentElement, $ = function (s) { return document.querySelector(s); };
  var H = { 'Content-Type': 'application/json' };
  var log = $('#log'), box = $('#box'), go = $('#go'), list = $('#chats'), title = $('#title'),
      empty = $('#empty'), side = $('#side'), q = $('#q'), temp = $('#temp'), len = $('#len');
  var chats = [], cur = null, busy = false, ctl = null;
  var PENCIL = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
  var TRASH = '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>';

  /* theme + reply settings */
  try { var th = localStorage.getItem('athios-theme'); if (th) r.dataset.theme = th; } catch (e) {}
  $('#theme').addEventListener('click', function () {
    var c = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = c === 'dark' ? 'light' : 'dark';
    r.dataset.theme = n;
    try { localStorage.setItem('athios-theme', n); } catch (e) {}
  });
  try { var s = JSON.parse(localStorage.getItem('athios-set') || '{}'); if (s.t) temp.value = s.t; if (s.n) len.value = s.n; } catch (e) {}
  function syncSet() {
    $('#tv').textContent = temp.value; $('#lv').textContent = len.value;
    try { localStorage.setItem('athios-set', JSON.stringify({ t: temp.value, n: len.value })); } catch (e) {}
  }
  temp.addEventListener('input', syncSet); len.addEventListener('input', syncSet); syncSet();
  function cfg() { return { temperature: +temp.value, max_tokens: +len.value }; }

  /* helpers */
  function call(url, method, body, signal) {
    return fetch(url, { method: method || 'GET', headers: H, body: body ? JSON.stringify(body) : undefined, signal: signal })
      .then(function (res) {
        if (res.status === 401) { location.href = '/login?next=/chat'; throw new Error('401'); }
        if (!res.ok) throw new Error(res.status);
        return res;
      });
  }
  function toEnd() { log.scrollTop = log.scrollHeight; }
  function show(has) { log.hidden = !has; empty.hidden = has; }
  function remember() { try { localStorage.setItem('athios-last', cur || ''); } catch (e) {} }
  function setBusy(b) {
    busy = b; go.classList.toggle('stop', b); go.setAttribute('aria-label', b ? 'Stop' : 'Send');
    go.disabled = !b && !box.value.trim();
  }

  /* tiny markdown: code blocks, inline code, bold, lists */
  function esc(t) { return t.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function inline(t) {
    t = esc(t).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    var html = '', ul = false;
    t.split('\n').forEach(function (l) {
      var m = /^\s*(?:[-*]|\d+\.)\s+(.*)/.exec(l);
      if (m) { if (!ul) { html += '<ul>'; ul = true; } html += '<li>' + m[1] + '</li>'; }
      else { if (ul) { html += '</ul>'; ul = false; } if (l.trim()) html += '<p>' + l + '</p>'; }
    });
    return html + (ul ? '</ul>' : '');
  }
  function md(src) {
    return src.split('```').map(function (p, i) {
      if (i % 2 === 0) return inline(p);
      var nl = p.indexOf('\n'), lang = nl < 0 ? p : p.slice(0, nl), code = nl < 0 ? '' : p.slice(nl + 1).replace(/\n$/, '');
      return '<div class="code"><div class="ch"><span>' + esc(lang.trim() || 'code') + '</span><button type="button" class="cp">Copy</button></div><pre><code>' + esc(code) + '</code></pre></div>';
    }).join('');
  }
  function copy(btn, text) {
    if (!navigator.clipboard) return;
    var old = btn.textContent;
    navigator.clipboard.writeText(text).then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = old; }, 1400); });
  }

  /* messages */
  function setBot(el, text) { el._raw = text; el.querySelector('.tx').innerHTML = md(text); toEnd(); }
  function addMsg(role, text) {
    var d = document.createElement('div'); d.className = 'msg ' + role; d._raw = text;
    if (role === 'bot') {
      d.innerHTML = '<span class="av"><img src="' + document.body.dataset.mark + '" alt=""></span><div class="body"><div class="tx"></div>' +
        '<div class="acts"><button type="button" class="ab cm">Copy</button><button type="button" class="ab rg">Regenerate</button></div></div>';
      setBot(d, text);
    } else { d.innerHTML = '<div class="tx"></div>'; d.firstChild.textContent = text; }
    log.appendChild(d); toEnd();
    return d;
  }
  log.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('cp')) copy(b, b.closest('.code').querySelector('code').textContent);
    else if (b.classList.contains('cm')) copy(b, b.closest('.msg')._raw || '');
    else if (b.classList.contains('rg')) regen();
  });

  async function stream(url, body) {
    var el = addMsg('bot', ''), out = '';
    el.classList.add('wait'); ctl = new AbortController();
    try {
      var res = await call(url, 'POST', body, ctl.signal);
      el.classList.remove('wait'); el.classList.add('live');
      var rd = res.body.getReader(), dec = new TextDecoder();
      for (;;) {
        var x = await rd.read();
        if (x.done) break;
        out += dec.decode(x.value, { stream: true }); setBot(el, out);
      }
    } catch (e) {
      if (e.name !== 'AbortError' && !out) setBot(el, 'Sorry, something went wrong. Please try again.');
    }
    el.classList.remove('wait', 'live'); ctl = null;
  }
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    setBusy(true); show(true);
    try {
      if (!cur) {
        var c = await (await call('/api/chats', 'POST')).json();
        cur = c.id; remember(); chats.unshift(c); renderList();
      }
      addMsg('user', text);
      await stream('/api/chats/' + cur + '/messages', Object.assign({ content: text }, cfg()));
    } catch (e) {}
    try { await loadChats(); } catch (e) {}
    setBusy(false); box.focus();
  }
  async function regen() {
    if (busy || !cur) return;
    setBusy(true);
    var last = log.lastElementChild; if (last && last.classList.contains('bot')) last.remove();
    await stream('/api/chats/' + cur + '/regenerate', cfg());
    setBusy(false);
  }

  /* sidebar: search, date groups, rename, delete */
  function bucket(s) {
    if (!s) return 'Today';
    var d = new Date(s.replace(' ', 'T') + 'Z'), n = new Date();
    var days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return days < 1 ? 'Today' : days < 2 ? 'Yesterday' : days < 8 ? 'Previous 7 days' : 'Older';
  }
  function iconBtn(label, svg, fn) {
    var b = document.createElement('button');
    b.className = 'ib'; b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = svg;
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    return b;
  }
  function renderList() {
    list.innerHTML = '';
    var f = q.value.trim().toLowerCase(), last = '';
    chats.filter(function (c) { return c.title.toLowerCase().indexOf(f) > -1; }).forEach(function (c) {
      var g = bucket(c.created);
      if (g !== last) { var h = document.createElement('li'); h.className = 'gh'; h.textContent = g; list.appendChild(h); last = g; }
      var li = document.createElement('li'); li.className = 'ci' + (c.id === cur ? ' on' : '');
      var b = document.createElement('button'); b.className = 'ct'; b.type = 'button'; b.textContent = c.title;
      b.addEventListener('click', function () { openChat(c.id); side.classList.remove('open'); });
      li.appendChild(b);
      li.appendChild(iconBtn('Rename chat', PENCIL, function () { rename(c); }));
      li.appendChild(iconBtn('Delete chat', TRASH, function () { remove(c); }));
      list.appendChild(li);
    });
    var now = chats.filter(function (x) { return x.id === cur; })[0];
    title.textContent = now ? now.title : 'New chat';
  }
  function loadChats() { return call('/api/chats').then(function (res) { return res.json(); }).then(function (d) { chats = d; renderList(); }); }
  function openChat(id) {
    return call('/api/chats/' + id).then(function (res) { return res.json(); }).then(function (ms) {
      cur = id; remember(); log.innerHTML = '';
      ms.forEach(function (m) { addMsg(m.role === 'user' ? 'user' : 'bot', m.content); });
      show(ms.length > 0); renderList(); toEnd();
    });
  }
  function newChat() { cur = null; remember(); log.innerHTML = ''; show(false); renderList(); side.classList.remove('open'); box.focus(); }
  function rename(c) {
    var t = prompt('Rename chat', c.title);
    if (t && t.trim()) call('/api/chats/' + c.id, 'PATCH', { title: t.trim() }).then(loadChats);
  }
  function remove(c) {
    if (!confirm('Delete this chat and its memory?')) return;
    call('/api/chats/' + c.id, 'DELETE').then(function () { if (cur === c.id) newChat(); return loadChats(); });
  }

  /* composer + buttons */
  function fit() { box.style.height = 'auto'; box.style.height = Math.min(box.scrollHeight, 144) + 'px'; go.disabled = !busy && !box.value.trim(); }
  box.addEventListener('input', fit);
  box.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) $('#form').requestSubmit(); }
  });
  $('#form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) { if (ctl) ctl.abort(); return; }
    var t = box.value; box.value = ''; fit(); send(t);
  });
  q.addEventListener('input', renderList);
  $('#new').addEventListener('click', newChat);
  $('#menu').addEventListener('click', function () { side.classList.add('open'); });
  $('#close').addEventListener('click', function () { side.classList.remove('open'); });
  empty.addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) send(b.dataset.p); });
  $('#export').addEventListener('click', function () {
    var t = '# ' + title.textContent + '\n\n';
    [].forEach.call(log.children, function (m) { t += '**' + (m.classList.contains('user') ? 'You' : 'Athios') + ':**\n\n' + (m._raw || '') + '\n\n'; });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown' }));
    a.download = (title.textContent.replace(/[^\w]+/g, '-') || 'chat') + '.md';
    a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* start */
  loadChats().then(function () {
    var p = new URLSearchParams(location.search).get('prompt');
    if (p) { history.replaceState(null, '', '/chat'); send(p); return; }
    var last = null;
    try { last = parseInt(localStorage.getItem('athios-last'), 10); } catch (e) {}
    if (last && chats.some(function (c) { return c.id === last; })) return openChat(last);
    show(false);
  }).catch(function () { show(false); });
})();
