/**
 * Worker C (UI) - src/ui.ts
 *
 * Halaman HTML untuk cabe-chatbot (tanpa framework, HTML+CSS+JS inline):
 *   GET /          -> landing page (hero "Cabe Chatbot")
 *   GET /login     -> form login (fetch POST /api/auth/login)
 *   GET /signup    -> form daftar (fetch POST /api/auth/register)
 *   GET /dashboard -> satu halaman: ingest, daftar dokumen, panel chat
 *
 * Hanya file ini yang boleh diedit oleh Worker C.
 * Semua nilai dinamis di-escape dengan helper escapeHtml (di server dan di client).
 */
import type { Hono } from 'hono';

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ */
/* CSS bersama (tema ungu, responsif, dark-friendly)                   */
/* ------------------------------------------------------------------ */

const BASE_CSS = `
:root {
  --purple: #7c3aed;
  --purple-dark: #5b21b6;
  --purple-soft: #ede9fe;
  --bg: #faf7ff;
  --card: #ffffff;
  --text: #221a33;
  --muted: #6f6588;
  --border: #e4daf6;
  --danger: #dc2626;
  --ok: #15803d;
}
@media (prefers-color-scheme: dark) {
  :root {
    --purple-soft: #2c2242;
    --bg: #161020;
    --card: #211a30;
    --text: #efe9fa;
    --muted: #a89bc8;
    --border: #3a2d55;
    --danger: #f87171;
    --ok: #4ade80;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.55;
}
a { color: var(--purple); }
.container { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 6px 24px rgba(92, 44, 178, 0.08);
}
h1, h2, h3 { line-height: 1.2; }
.muted { color: var(--muted); font-size: 0.92em; }
.error-box { color: var(--danger); min-height: 1.2em; margin: 8px 0; font-size: 0.95em; }
.ok-box { color: var(--ok); margin: 8px 0; font-size: 0.95em; }
label { display: block; font-weight: 600; margin: 12px 0 4px; font-size: 0.95em; }
input[type="text"], input[type="email"], input[type="password"], input[type="url"], textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
textarea { min-height: 96px; resize: vertical; }
input:focus, textarea:focus { outline: 2px solid var(--purple); outline-offset: 1px; border-color: var(--purple); }
.btn {
  display: inline-block;
  border: none;
  border-radius: 10px;
  padding: 11px 20px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  background: var(--purple);
  color: #fff;
  transition: background 0.15s ease;
}
.btn:hover { background: var(--purple-dark); }
.btn[disabled] { opacity: 0.6; cursor: not-allowed; }
.btn-ghost { background: transparent; color: var(--purple); border: 1px solid var(--purple); }
.btn-ghost:hover { background: var(--purple-soft); }
.btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
.btn-danger:hover { background: rgba(220, 38, 38, 0.1); }
.btn-sm { padding: 6px 12px; font-size: 0.88em; }
`;

/* ------------------------------------------------------------------ */
/* Halaman: Landing                                                    */
/* ------------------------------------------------------------------ */

function landingPage(): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cabe Chatbot</title>
<style>
${BASE_CSS}
.hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(135deg, var(--purple) 0%, var(--purple-dark) 60%, #3b0f7a 100%);
  color: #fff;
  padding: 24px 16px;
}
.hero .badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 0.85em;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.hero h1 { font-size: clamp(2.4rem, 7vw, 4rem); margin: 18px 0 8px; }
.hero p.tagline { font-size: clamp(1rem, 2.5vw, 1.25rem); max-width: 34em; margin: 0 auto 28px; color: rgba(255, 255, 255, 0.88); }
.hero .actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.hero .btn-light { background: #fff; color: var(--purple-dark); }
.hero .btn-light:hover { background: var(--purple-soft); }
.hero .btn-outline { background: transparent; color: #fff; border: 1px solid rgba(255, 255, 255, 0.7); }
.hero .btn-outline:hover { background: rgba(255, 255, 255, 0.12); }
.feature { margin: 14px auto 0; color: rgba(255, 255, 255, 0.75); font-size: 0.9em; }
</style>
</head>
<body>
<main class="hero">
  <div>
    <span class="badge">RAG &middot; Dokumen Pribadi</span>
    <h1>🌶️ Cabe Chatbot</h1>
    <p class="tagline">Chatbot RAG untuk dokumen pribadi Anda. Ingest URL atau HTML, lalu ajukan pertanyaan apa pun &mdash; jawaban selalu berbasis konteks dokumen milik Anda sendiri.</p>
    <div class="actions">
      <a class="btn btn-light" href="/signup">Sign Up</a>
      <a class="btn btn-outline" href="/login">Login</a>
    </div>
    <p class="feature">Multi-user &middot; Dokumen terpisah per akun &middot; Tanpa instalasi</p>
  </div>
</main>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Halaman: Login & Signup                                             */
/* ------------------------------------------------------------------ */

function authPage(opts: { mode: 'login' | 'signup' }): string {
  const isLogin = opts.mode === 'login';
  const title = isLogin ? 'Login' : 'Sign Up';
  const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
  const nameField = isLogin
    ? ''
    : `      <label for="name">Nama (opsional)</label>
      <input type="text" id="name" name="name" autocomplete="name" placeholder="Nama Anda">
`;
  const switchLink = isLogin
    ? '<p class="muted">Belum punya akun? <a href="/signup">Sign up</a></p>'
    : '<p class="muted">Sudah punya akun? <a href="/login">Login</a></p>';
  const errorId = isLogin ? 'login-error' : 'signup-error';
  const btnId = isLogin ? 'login-btn' : 'signup-btn';
  const formId = isLogin ? 'login-form' : 'signup-form';

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - Cabe Chatbot</title>
<style>
${BASE_CSS}
.auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px; }
.auth-card { width: 100%; max-width: 400px; }
.auth-card h1 { margin: 0 0 4px; font-size: 1.6rem; }
.auth-card .sub { margin: 0 0 18px; color: var(--muted); }
.auth-card form button[type="submit"] { width: 100%; margin-top: 18px; }
.auth-card .home { text-align: center; margin-top: 14px; font-size: 0.9em; }
</style>
</head>
<body>
<div class="auth-wrap">
  <div class="card auth-card">
    <h1>${title}</h1>
    <p class="sub">Masuk ke Cabe Chatbot untuk mengelola dokumen Anda.</p>
    <form id="${formId}" novalidate>
${nameField}      <label for="email">Email</label>
      <input type="email" id="email" name="email" autocomplete="email" required placeholder="nama@contoh.com">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="${isLogin ? 'current' : 'new'}-password" required placeholder="${isLogin ? 'Password Anda' : 'Minimal 8 karakter'}">
      <div class="error-box" id="${errorId}" role="alert"></div>
      <button type="submit" class="btn" id="${btnId}">${title}</button>
    </form>
    ${switchLink}
    <p class="home muted"><a href="/">&larr; Kembali ke beranda</a></p>
  </div>
</div>
<script>
(function () {
  'use strict';
  var form = document.getElementById('${formId}');
  var errEl = document.getElementById('${errorId}');
  var btn = document.getElementById('${btnId}');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.textContent = '';
    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;
    btn.disabled = true;
    fetch('${endpoint}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody(email, password))
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      if (res.ok && res.data && res.data.success) {
        window.location.href = '/dashboard';
        return;
      }
      btn.disabled = false;
      errEl.textContent = (res.data && res.data.error) || 'Permintaan gagal. Coba lagi.';
    }).catch(function () {
      btn.disabled = false;
      errEl.textContent = 'Terjadi kesalahan jaringan.';
    });
  });
  function buildBody(email, password) {
    return ${isLogin ? '{ email: email, password: password }' : "{ email: email, password: password, name: document.getElementById('name').value.trim() || undefined }"};
  }
})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Halaman: Dashboard (satu halaman)                                   */
/* ------------------------------------------------------------------ */

function dashboardPage(): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard - Cabe Chatbot</title>
<style>
${BASE_CSS}
.topbar {
  background: var(--card);
  border-bottom: 1px solid var(--border);
  padding: 14px 0;
}
.topbar-inner {
  max-width: 1080px; margin: 0 auto; padding: 0 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.brand { font-weight: 800; font-size: 1.15rem; color: var(--purple); text-decoration: none; }
.user-box { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.user-box .email { font-size: 0.95em; color: var(--muted); max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grid { max-width: 1080px; margin: 24px auto 64px; padding: 0 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
.card h2 { margin: 0 0 6px; font-size: 1.15rem; }
.card .desc { margin: 0 0 14px; color: var(--muted); font-size: 0.92em; }
.mode-row { display: flex; gap: 18px; margin: 10px 0 4px; font-size: 0.95em; }
.mode-row label { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-weight: 500; cursor: pointer; }
#ingest-btn, #chat-btn { width: 100%; margin-top: 14px; }
.doc-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--border);
}
.doc-item:last-child { border-bottom: none; }
.doc-main { min-width: 0; }
.doc-preview { font-size: 0.95em; overflow-wrap: anywhere; }
.doc-meta { color: var(--muted); font-size: 0.8em; margin-top: 2px; overflow-wrap: anywhere; }
#chat-log { max-height: 420px; overflow-y: auto; margin-top: 6px; }
.chat-qa { padding: 10px 0; border-bottom: 1px dashed var(--border); }
.chat-qa:last-child { border-bottom: none; }
.chat-label {
  display: inline-block; font-size: 0.72em; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.05em; border-radius: 6px; padding: 1px 8px; margin-right: 6px;
}
.chat-q .chat-label { background: var(--purple-soft); color: var(--purple-dark); }
@media (prefers-color-scheme: dark) { .chat-q .chat-label { color: #c4b5fd; } }
.chat-a .chat-label { background: rgba(21, 128, 61, 0.15); color: var(--ok); }
.chat-q, .chat-a { margin-bottom: 4px; overflow-wrap: anywhere; }
.chat-meta { color: var(--muted); font-size: 0.78em; }
@media (max-width: 860px) {
  .grid { grid-template-columns: 1fr; }
  .user-box .email { max-width: 60vw; }
}
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">🌶️ Cabe Chatbot</a>
    <div class="user-box">
      <span class="email" id="user-email">Memuat...</span>
      <button type="button" class="btn btn-danger btn-sm" id="logout-btn">Logout</button>
    </div>
  </div>
</header>

<div class="grid">
  <section style="display: flex; flex-direction: column; gap: 20px;">
    <div class="card">
      <h2>Ingest Dokumen</h2>
      <p class="desc">Tambahkan dokumen baru dari URL atau tempel HTML mentah. Dokumen dipotong menjadi chunks dan diindeks ke Vectorize.</p>
      <form id="ingest-form" novalidate>
        <div class="mode-row">
          <label><input type="radio" name="ingest-mode" value="url" checked> URL</label>
          <label><input type="radio" name="ingest-mode" value="html"> HTML</label>
        </div>
        <div id="field-url">
          <label for="ingest-url">URL halaman</label>
          <input type="url" id="ingest-url" name="url" placeholder="https://contoh.com/artikel">
        </div>
        <div id="field-html" style="display:none">
          <label for="ingest-html">Konten HTML</label>
          <textarea id="ingest-html" name="html" placeholder="&lt;html&gt;...&lt;/html&gt;"></textarea>
        </div>
        <div class="error-box" id="ingest-error" role="alert"></div>
        <div class="ok-box" id="ingest-result"></div>
        <button type="submit" class="btn" id="ingest-btn">Ingest</button>
      </form>
    </div>

    <div class="card">
      <h2>Dokumen Saya <span class="muted" id="docs-count"></span></h2>
      <p class="desc">Semua chunk milik akun Anda, terbaru lebih dulu.</p>
      <div id="docs-list"><p class="muted">Memuat...</p></div>
    </div>
  </section>

  <section class="card">
    <h2>Chat</h2>
    <p class="desc">Ajukan pertanyaan berdasarkan dokumen yang sudah di-ingest. Riwayat tersimpan selama halaman terbuka.</p>
    <form id="chat-form" novalidate>
      <label for="chat-question">Pertanyaan</label>
      <textarea id="chat-question" placeholder="Contoh: Rangkum poin utama dari dokumen yang saya simpan"></textarea>
      <div class="error-box" id="chat-error" role="alert"></div>
      <button type="submit" class="btn" id="chat-btn">Kirim</button>
    </form>
    <div id="chat-log"><p class="muted">Belum ada percakapan.</p></div>
  </section>
</div>

<script>
(function () {
  'use strict';

  /* Helper escape untuk semua nilai dinamis yang dirender sebagai HTML. */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var userEmailEl = document.getElementById('user-email');
  var docsListEl = document.getElementById('docs-list');
  var docsCountEl = document.getElementById('docs-count');
  var ingestErrorEl = document.getElementById('ingest-error');
  var ingestResultEl = document.getElementById('ingest-result');
  var chatLogEl = document.getElementById('chat-log');
  var chatErrorEl = document.getElementById('chat-error');
  var chatHistory = []; /* riwayat Q&A in-memory selama sesi halaman */

  function gotoLogin() { window.location.href = '/login'; }

  /* ---------- Auth check ---------- */
  fetch('/api/auth/me').then(function (r) {
    if (r.status === 401) { gotoLogin(); return null; }
    return r.json();
  }).then(function (data) {
    if (!data || !data.user) { gotoLogin(); return; }
    userEmailEl.textContent = data.user.email || '(tanpa email)';
    loadDocs();
  }).catch(gotoLogin);

  /* ---------- Logout ---------- */
  document.getElementById('logout-btn').addEventListener('click', function () {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(function () { gotoLogin(); })
      .catch(function () { gotoLogin(); });
  });

  /* ---------- Ingest ---------- */
  var modeRadios = document.querySelectorAll('input[name="ingest-mode"]');
  var fieldUrl = document.getElementById('field-url');
  var fieldHtml = document.getElementById('field-html');
  modeRadios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      var isUrl = document.querySelector('input[name="ingest-mode"]:checked').value === 'url';
      fieldUrl.style.display = isUrl ? '' : 'none';
      fieldHtml.style.display = isUrl ? 'none' : '';
    });
  });

  document.getElementById('ingest-form').addEventListener('submit', function (e) {
    e.preventDefault();
    ingestErrorEl.textContent = '';
    ingestResultEl.textContent = '';
    var mode = document.querySelector('input[name="ingest-mode"]:checked').value;
    var url = document.getElementById('ingest-url').value.trim();
    var htmlVal = document.getElementById('ingest-html').value;
    var body;
    if (mode === 'url') {
      if (!url) { ingestErrorEl.textContent = 'Masukkan URL terlebih dahulu.'; return; }
      body = { url: url };
    } else {
      if (!htmlVal.trim()) { ingestErrorEl.textContent = 'Tempel konten HTML terlebih dahulu.'; return; }
      body = { html: htmlVal };
    }
    var btn = document.getElementById('ingest-btn');
    btn.disabled = true;
    fetch('/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      btn.disabled = false;
      if (res.data && res.data.error) { ingestErrorEl.textContent = res.data.error; return; }
      ingestResultEl.textContent = (res.data && res.data.message) || 'Ingest berhasil.';
      loadDocs();
    }).catch(function () {
      btn.disabled = false;
      ingestErrorEl.textContent = 'Gagal mengirim permintaan ingest.';
    });
  });

  /* ---------- Daftar dokumen ---------- */
  function loadDocs() {
    fetch('/api/documents').then(function (r) {
      if (r.status === 401) { gotoLogin(); return null; }
      return r.json();
    }).then(function (data) {
      if (!data) return;
      var docs = (data && data.documents) || [];
      docsCountEl.textContent = '(' + docs.length + ')';
      if (docs.length === 0) {
        docsListEl.innerHTML = '<p class="muted">Belum ada dokumen. Ingest URL atau HTML terlebih dahulu.</p>';
        return;
      }
      var html = '';
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        html += '<div class="doc-item">'
          + '<div class="doc-main">'
          + '<div class="doc-preview">' + escapeHtml(d.preview || '(tanpa pratinjau)') + '</div>'
          + '<div class="doc-meta">'
          + escapeHtml(d.source_url || '(tanpa sumber)')
          + ' &middot; ' + escapeHtml(d.created_at || '-')
          + ' &middot; ' + escapeHtml(String(d.size != null ? d.size : 0)) + ' karakter'
          + '</div>'
          + '</div>'
          + '<button type="button" class="btn btn-danger btn-sm" data-id="' + escapeHtml(d.id) + '">Hapus</button>'
          + '</div>';
      }
      docsListEl.innerHTML = html;
    }).catch(function () {
      docsListEl.innerHTML = '<p class="error-box">Gagal memuat daftar dokumen.</p>';
    });
  }

  docsListEl.addEventListener('click', function (e) {
    var target = e.target;
    var btn = target && target.closest ? target.closest('button[data-id]') : null;
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    btn.disabled = true;
    fetch('/api/documents/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.error) { alert('Gagal menghapus dokumen: ' + data.error); }
        loadDocs();
      })
      .catch(function () { alert('Gagal menghapus dokumen.'); loadDocs(); });
  });

  /* ---------- Chat ---------- */
  function renderChat() {
    if (chatHistory.length === 0) {
      chatLogEl.innerHTML = '<p class="muted">Belum ada percakapan.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < chatHistory.length; i++) {
      var h = chatHistory[i];
      html += '<div class="chat-qa">'
        + '<div class="chat-q"><span class="chat-label">Tanya</span>' + escapeHtml(h.question) + '</div>'
        + '<div class="chat-a"><span class="chat-label">Jawab</span>' + escapeHtml(h.answer) + '</div>'
        + '<div class="chat-meta">context_used: ' + escapeHtml(String(h.context_used)) + '</div>'
        + '</div>';
    }
    chatLogEl.innerHTML = html;
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
  }

  document.getElementById('chat-form').addEventListener('submit', function (e) {
    e.preventDefault();
    chatErrorEl.textContent = '';
    var qEl = document.getElementById('chat-question');
    var question = qEl.value.trim();
    if (!question) { chatErrorEl.textContent = 'Tulis pertanyaan terlebih dahulu.'; return; }
    var btn = document.getElementById('chat-btn');
    btn.disabled = true;
    fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question })
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      btn.disabled = false;
      if (res.data && res.data.error) { chatErrorEl.textContent = res.data.error; return; }
      chatHistory.push({
        question: question,
        answer: (res.data && res.data.answer) || '',
        context_used: res.data && res.data.context_used != null ? res.data.context_used : 0
      });
      qEl.value = '';
      renderChat();
    }).catch(function () {
      btn.disabled = false;
      chatErrorEl.textContent = 'Gagal mengirim pertanyaan.';
    });
  });
})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Registrasi route                                                    */
/* ------------------------------------------------------------------ */

export function registerUiRoutes(app: Hono<any>): void {
  app.get('/', (c) => c.html(landingPage()));
  app.get('/login', (c) => c.html(authPage({ mode: 'login' })));
  app.get('/signup', (c) => c.html(authPage({ mode: 'signup' })));
  app.get('/dashboard', (c) => c.html(dashboardPage()));
}
