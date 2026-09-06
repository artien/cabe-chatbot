/**
 * Worker C (UI) - src/ui.ts
 *
 * Halaman HTML dan Widget Script untuk cabe-chatbot:
 *   GET /            -> Landing page dengan perbandingan paket Free vs Pro
 *   GET /login       -> Form login
 *   GET /signup      -> Form daftar
 *   GET /dashboard   -> Dashboard utama: Kuota paket, Ingest dokumen, Chat, dan Embeddable Widget (Khusus Pro)
 *   GET /widget.js   -> Standalone Embeddable AI Chatbot Widget script untuk landing page eksternal
 *   GET /widget-demo -> Halaman demo landing page simulasi untuk mencoba widget
 */
import type { Hono } from 'hono';

/* ------------------------------------------------------------------ */
/* Helper Escape HTML                                                 */
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
/* CSS Bersama                                                        */
/* ------------------------------------------------------------------ */

const BASE_CSS = `
:root {
  --purple: #7c3aed;
  --purple-dark: #5b21b6;
  --purple-soft: #ede9fe;
  --purple-glow: rgba(124, 58, 237, 0.15);
  --gold: #f59e0b;
  --gold-soft: #fef3c7;
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
    --purple-glow: rgba(167, 139, 250, 0.15);
    --gold-soft: #451a03;
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
a { color: var(--purple); text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 1080px; margin: 0 auto; padding: 24px 16px 64px; }
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px;
  box-shadow: 0 6px 24px rgba(92, 44, 178, 0.08);
}
h1, h2, h3, h4 { line-height: 1.25; margin-top: 0; }
.muted { color: var(--muted); font-size: 0.92em; }
.error-box { color: var(--danger); min-height: 1.2em; margin: 8px 0; font-size: 0.95em; font-weight: 500; }
.ok-box { color: var(--ok); margin: 8px 0; font-size: 0.95em; font-weight: 500; }
label { display: block; font-weight: 600; margin: 12px 0 4px; font-size: 0.95em; }
input[type="text"], input[type="email"], input[type="password"], input[type="url"], textarea, select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
textarea { min-height: 96px; resize: vertical; }
input:focus, textarea:focus, select:focus { outline: 2px solid var(--purple); outline-offset: 1px; border-color: var(--purple); }
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
  transition: all 0.15s ease;
}
.btn:hover { background: var(--purple-dark); color: #fff; text-decoration: none; }
.btn[disabled] { opacity: 0.6; cursor: not-allowed; }
.btn-gold { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); }
.btn-gold:hover { background: linear-gradient(135deg, #d97706, #b45309); }
.btn-ghost { background: transparent; color: var(--purple); border: 1px solid var(--purple); }
.btn-ghost:hover { background: var(--purple-soft); }
.btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
.btn-danger:hover { background: rgba(220, 38, 38, 0.1); }
.btn-sm { padding: 6px 14px; font-size: 0.88em; }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78em;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  border-radius: 999px;
}
.badge-free { background: var(--purple-soft); color: var(--purple-dark); border: 1px solid var(--border); }
@keyframes spin { 100% { transform: rotate(360deg); } }
.spinner-inline {
  width: 18px;
  height: 18px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
.payment-banner {
  margin-bottom: 20px;
  padding: 16px 20px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(245,158,11,0.12), rgba(124,58,237,0.12));
  border: 1px solid var(--gold);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.code-block {
  background: #1e1b2e;
  color: #e2e8f0;
  padding: 14px;
  border-radius: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.86em;
  overflow-x: auto;
  position: relative;
  border: 1px solid #3b3353;
  margin: 10px 0;
}
`;

/* ------------------------------------------------------------------ */
/* Halaman: Landing Page                                              */
/* ------------------------------------------------------------------ */

function landingPage(): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cabe Chatbot - Embeddable AI Chatbot & RAG Platform</title>
<style>
${BASE_CSS}
.hero {
  background: linear-gradient(135deg, var(--purple) 0%, var(--purple-dark) 55%, #3b0f7a 100%);
  color: #fff;
  padding: 70px 16px 90px;
  text-align: center;
}
.hero .hero-badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.hero h1 { font-size: clamp(2.3rem, 6vw, 3.8rem); margin: 20px 0 14px; }
.hero p.tagline { font-size: clamp(1.05rem, 2.2vw, 1.25rem); max-width: 38em; margin: 0 auto 32px; color: rgba(255, 255, 255, 0.9); }
.hero .actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.hero .btn-light { background: #fff; color: var(--purple-dark); font-size: 1.05rem; padding: 13px 28px; }
.hero .btn-light:hover { background: var(--purple-soft); }
.hero .btn-outline { background: transparent; color: #fff; border: 2px solid rgba(255, 255, 255, 0.8); font-size: 1.05rem; padding: 12px 26px; }
.hero .btn-outline:hover { background: rgba(255, 255, 255, 0.15); }

/* Pricing Cards */
.pricing-section { max-width: 980px; margin: -50px auto 70px; padding: 0 16px; }
.pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 760px) { .pricing-grid { grid-template-columns: 1fr; } }
.plan-card {
  background: var(--card);
  border: 2px solid var(--border);
  border-radius: 18px;
  padding: 32px 26px;
  position: relative;
  box-shadow: 0 10px 30px rgba(92, 44, 178, 0.12);
  display: flex;
  flex-direction: column;
}
.plan-card.pro {
  border-color: var(--gold);
  box-shadow: 0 12px 36px rgba(245, 158, 11, 0.2);
}
.plan-ribbon {
  position: absolute;
  top: -14px;
  right: 24px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  padding: 4px 14px;
  border-radius: 999px;
  box-shadow: 0 3px 8px rgba(245, 158, 11, 0.4);
}
.plan-title { font-size: 1.6rem; font-weight: 800; margin-bottom: 6px; }
.plan-price { font-size: 2.2rem; font-weight: 900; color: var(--purple); margin-bottom: 18px; }
.plan-card.pro .plan-price { color: #d97706; }
.plan-features { list-style: none; padding: 0; margin: 0 0 28px; flex: 1; }
.plan-features li { padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; font-size: 0.96rem; }
.plan-features li:last-child { border-bottom: none; }
.check-icon { color: var(--ok); font-weight: 900; }
.cross-icon { color: var(--danger); font-weight: 900; }

/* Features Section */
.features-section { max-width: 980px; margin: 0 auto 80px; padding: 0 16px; }
.section-header { text-align: center; margin-bottom: 40px; }
.section-header h2 { font-size: 2rem; color: var(--purple-dark); }
.features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
.feature-box { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 24px; }
.feature-box h3 { font-size: 1.2rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
</style>
</head>
<body>

<header class="hero">
  <div>
    <span class="hero-badge">🌶️ AI RAG & Embeddable Widget</span>
    <h1>Cabe Chatbot</h1>
    <p class="tagline">Platform AI RAG untuk dokumen pribadi Anda & <strong>Embeddable AI Chatbot Widget</strong> yang siap dipasang di landing page website Anda!</p>
    <div class="actions">
      <a class="btn btn-light" href="/signup">Daftar Sekarang</a>
      <a class="btn btn-outline" href="/login">Masuk (Login)</a>
    </div>
  </div>
</header>

<main class="pricing-section">
  <div class="pricing-grid">
    <!-- Free Plan -->
    <div class="plan-card">
      <div class="plan-title">Free Plan</div>
      <div class="plan-price">Gratis <span style="font-size:0.9rem;font-weight:400;color:var(--muted)">/ selamanya</span></div>
      <p class="muted">Cocok untuk mencoba dan penggunaan personal skala kecil.</p>
      <ul class="plan-features">
        <li><span class="check-icon">✓</span> <strong>1 Ingest Dokumen</strong> (URL / HTML)</li>
        <li><span class="check-icon">✓</span> <strong>10 Chat Request</strong> per hari</li>
        <li><span class="check-icon">✓</span> Web Chat Dashboard interaktif</li>
        <li><span class="check-icon">✓</span> Cloudflare Workers AI & Vectorize RAG</li>
        <li style="color:var(--muted);"><span class="cross-icon">✗</span> <span style="text-decoration:line-through">Embeddable AI Chatbot Widget</span></li>
      </ul>
      <a href="/signup" class="btn btn-ghost" style="width:100%;">Mulai Free</a>
    </div>

    <!-- Pro Plan -->
    <div class="plan-card pro">
      <div class="plan-ribbon">⭐ Rekomendasi</div>
      <div class="plan-title">Pro Plan</div>
      <div class="plan-price">Pro Tier <span style="font-size:0.9rem;font-weight:400;color:var(--muted)">/ akses penuh</span></div>
      <p class="muted">Untuk pemilik website, landing page, dan bisnis yang ingin melayani pengunjung 24/7.</p>
      <ul class="plan-features">
        <li><span class="check-icon">✓</span> <strong>10 Ingest Dokumen</strong> (URL / HTML)</li>
        <li><span class="check-icon">✓</span> <strong>100 Chat Request</strong> per hari</li>
        <li><span class="check-icon">✓</span> <strong>Embeddable AI Chatbot Widget</strong> untuk Landing Page</li>
        <li><span class="check-icon">✓</span> 1-Baris Script Embed Instan (<span style="font-family:monospace;font-size:0.88em">&lt;script&gt;</span>)</li>
        <li><span class="check-icon">✓</span> Kunci Widget Unik & Manajemen API Key</li>
        <li><span class="check-icon">✓</span> Prioritas Vector Search & RAG Generation</li>
      </ul>
      <a href="/signup" class="btn btn-gold" style="width:100%;">Daftar Pro Plan 🚀</a>
    </div>
  </div>
</main>

<section class="features-section">
  <div class="section-header">
    <h2>Kenapa Memilih Cabe Chatbot?</h2>
    <p class="muted">Solusi cerdas menghubungkan dokumen bisnis Anda langsung ke pengunjung landing page.</p>
  </div>
  <div class="features-grid">
    <div class="feature-box">
      <h3>🌐 Embed Widget Instan</h3>
      <p class="muted">Pasang AI Chatbot pintar di WordPress, Shopify, Webflow, atau HTML custom hanya dengan menyalin satu baris tag script.</p>
    </div>
    <div class="feature-box">
      <h3>📚 RAG Berbasis Dokumen</h3>
      <p class="muted">AI menjawab secara akurat dan objektif hanya berdasarkan dokumen dan informasi yang Anda ingest (URL atau teks HTML).</p>
    </div>
    <div class="feature-box">
      <h3>⚡ Kilat & Serverless</h3>
      <p class="muted">Didukung Cloudflare Workers, D1 Database, Vectorize, dan Llama 3.2 untuk respon super cepat dan handal.</p>
    </div>
  </div>
</section>

<footer style="text-align:center;padding:30px 16px;border-top:1px solid var(--border);color:var(--muted);font-size:0.9em;">
  Cabe Chatbot &middot; Open Source AI RAG & Embeddable Widget Platform
</footer>

</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Halaman: Login & Signup                                            */
/* ------------------------------------------------------------------ */

function authPage(opts: { mode: 'login' | 'signup' }): string {
  const isLogin = opts.mode === 'login';
  const title = isLogin ? 'Login' : 'Daftar Akun';
  const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
  const nameField = isLogin
    ? ''
    : `<div>
        <label for="name">Nama Lengkap (opsional)</label>
        <input type="text" id="name" name="name" autocomplete="name" placeholder="Budi Santoso">
      </div>`;
  const switchText = isLogin
    ? 'Belum punya akun? <a href="/signup">Daftar sekarang</a>'
    : 'Sudah punya akun? <a href="/login">Login di sini</a>';

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - Cabe Chatbot</title>
<style>
${BASE_CSS}
body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px 16px; }
.auth-box { width: 100%; max-width: 420px; }
.auth-header { text-align: center; margin-bottom: 24px; }
.auth-header a { font-weight: 800; font-size: 1.4rem; color: var(--purple); }
.auth-header h1 { font-size: 1.6rem; margin: 12px 0 4px; }
.switch-box { text-align: center; margin-top: 18px; font-size: 0.94em; color: var(--muted); }
</style>
</head>
<body>
<div class="auth-box">
  <div class="auth-header">
    <a href="/">🌶️ Cabe Chatbot</a>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${isLogin ? 'Masuk ke akun Anda' : 'Buat akun baru untuk mulai menggunakan AI Chatbot'}</p>
  </div>
  <div class="card">
    <form id="auth-form" novalidate>
      ${nameField}
      <div>
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email" placeholder="nama@contoh.com">
      </div>
      <div>
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="Minimal 8 karakter">
      </div>
      <div class="error-box" id="error-msg" role="alert"></div>
      <button type="submit" class="btn" style="width: 100%; margin-top: 14px;" id="submit-btn">${escapeHtml(title)}</button>
    </form>
  </div>
  <div class="switch-box">${switchText}</div>
</div>
<script>
(function() {
  var form = document.getElementById('auth-form');
  var errEl = document.getElementById('error-msg');
  var btn = document.getElementById('submit-btn');
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    errEl.textContent = '';
    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;
    if (!email || !password) {
      errEl.textContent = 'Email dan password wajib diisi.';
      return;
    }
    if (password.length < 8) {
      errEl.textContent = 'Password minimal 8 karakter.';
      return;
    }
    btn.disabled = true;
    var body = ${isLogin ? '{ email: email, password: password }' : "{ email: email, password: password, name: (document.getElementById('name') ? document.getElementById('name').value.trim() : '') || undefined }"};
    fetch('${endpoint}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r) {
      return r.json().then(function(data) { return { ok: r.ok, status: r.status, data: data }; });
    }).then(function(res) {
      if (res.ok && res.data && res.data.success) {
        window.location.href = '/dashboard';
        return;
      }
      btn.disabled = false;
      errEl.textContent = (res.data && res.data.error) || 'Permintaan gagal. Silakan coba lagi.';
    }).catch(function() {
      btn.disabled = false;
      errEl.textContent = 'Terjadi kesalahan jaringan.';
    });
  });
})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Halaman: Dashboard                                                 */
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
  position: sticky;
  top: 0;
  z-index: 100;
}
.topbar-inner {
  max-width: 1120px; margin: 0 auto; padding: 0 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.brand { font-weight: 800; font-size: 1.2rem; color: var(--purple); text-decoration: none; }
.user-box { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.user-box .email { font-size: 0.92em; color: var(--muted); max-width: 30vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Plan & Usage Summary Bar */
.usage-banner {
  max-width: 1120px;
  margin: 20px auto 0;
  padding: 0 16px;
}
.usage-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  box-shadow: 0 4px 16px rgba(92, 44, 178, 0.05);
}
.usage-stat { flex: 1; min-width: 160px; }
.usage-label { font-size: 0.82em; text-transform: uppercase; font-weight: 700; color: var(--muted); letter-spacing: 0.04em; }
.usage-val { font-size: 1.25rem; font-weight: 800; margin: 4px 0 6px; }
.progress-bg { width: 100%; height: 8px; background: var(--purple-soft); border-radius: 999px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--purple); border-radius: 999px; transition: width 0.3s ease; }
.progress-fill.warning { background: #f59e0b; }
.progress-fill.full { background: var(--danger); }

/* Main Grid */
.grid { max-width: 1120px; margin: 20px auto 64px; padding: 0 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
@media (max-width: 880px) { .grid { grid-template-columns: 1fr; } }
.full-col { grid-column: 1 / -1; }

.card h2 { margin: 0 0 6px; font-size: 1.2rem; display: flex; align-items: center; justify-content: space-between; }
.card .desc { margin: 0 0 14px; color: var(--muted); font-size: 0.92em; }
.mode-row { display: flex; gap: 18px; margin: 10px 0 4px; font-size: 0.95em; }
.mode-row label { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-weight: 500; cursor: pointer; }

/* Document List */
.doc-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--border);
}
.doc-item:last-child { border-bottom: none; }
.doc-main { min-width: 0; flex: 1; }
.doc-preview { font-size: 0.92em; overflow-wrap: anywhere; }
.doc-meta { color: var(--muted); font-size: 0.8em; margin-top: 3px; overflow-wrap: anywhere; }

/* Chat Box */
#chat-log { max-height: 380px; overflow-y: auto; margin-top: 6px; display: flex; flex-direction: column; gap: 12px; }
.chat-qa { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
.chat-label {
  display: inline-block; font-size: 0.72em; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.05em; border-radius: 6px; padding: 1px 8px; margin-right: 6px;
}
.chat-q .chat-label { background: var(--purple-soft); color: var(--purple-dark); }
.chat-a .chat-label { background: rgba(21, 128, 61, 0.15); color: var(--ok); }
.chat-q, .chat-a { margin-bottom: 6px; overflow-wrap: anywhere; font-size: 0.94em; }
.chat-meta { color: var(--muted); font-size: 0.76em; }

/* Embed Widget Pro Gate Card */
.widget-card {
  position: relative;
  overflow: hidden;
}
.widget-card.pro-active {
  border-color: var(--gold);
  background: radial-gradient(circle at top right, rgba(245, 158, 11, 0.06), transparent 60%), var(--card);
}
.locked-overlay {
  background: rgba(22, 16, 32, 0.04);
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  margin-top: 14px;
}
@media (prefers-color-scheme: dark) {
  .locked-overlay { background: rgba(255, 255, 255, 0.03); }
}
.locked-icon { font-size: 2.2rem; margin-bottom: 8px; }
.copy-row { display: flex; gap: 8px; margin: 8px 0; }
.copy-row input { flex: 1; font-family: monospace; font-size: 0.9em; }
</style>
</head>
<body>

<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">🌶️ Cabe Chatbot</a>
    <div class="user-box">
      <span class="email" id="user-email">Memuat akun...</span>
      <span id="user-plan-badge" class="badge badge-free">FREE</span>
      <button type="button" class="btn btn-danger btn-sm" id="logout-btn">Logout</button>
    </div>
  </div>
</header>

<!-- Payment Auto-Polling Status Banner -->
<div id="payment-status-banner" class="payment-banner" style="display:none;">
  <div style="display:flex; align-items:center; gap:14px;">
    <span id="payment-spinner" class="spinner-inline" style="width:22px; height:22px; border-width:3px; border-color:var(--gold); border-top-color:transparent;"></span>
    <div>
      <div style="font-weight:700; font-size:15px; color:var(--text);" id="payment-banner-title">Memverifikasi Pembayaran DOKU Checkout...</div>
      <div style="font-size:13px; color:var(--muted);" id="payment-banner-desc">Invoice: <code id="payment-banner-invoice" style="color:var(--purple);font-weight:600;">-</code> • Auto-polling status pembayaran...</div>
    </div>
  </div>
  <div style="display:flex; gap:10px; align-items:center;">
    <button type="button" class="btn btn-gold btn-sm" id="check-payment-btn">🔄 Cek Status</button>
    <button type="button" class="btn btn-ghost btn-sm" id="dismiss-payment-btn" style="opacity:0.75;">Tutup</button>
  </div>
</div>

<!-- Plan & Quota Summary Banner -->
<div class="usage-banner">
  <div class="usage-card">
    <div class="usage-stat">
      <div class="usage-label">Paket Anda</div>
      <div class="usage-val" id="plan-name-display">Free Plan</div>
      <div id="plan-action-container">
        <button type="button" class="btn btn-gold btn-sm" id="upgrade-plan-btn">🚀 Upgrade ke Pro</button>
      </div>
    </div>
    <div class="usage-stat">
      <div class="usage-label">Dokumen Tersimpan</div>
      <div class="usage-val" id="docs-quota-text">0 / 1</div>
      <div class="progress-bg">
        <div class="progress-fill" id="docs-progress" style="width: 0%;"></div>
      </div>
    </div>
    <div class="usage-stat">
      <div class="usage-label">Chat Hari Ini</div>
      <div class="usage-val" id="chats-quota-text">0 / 10</div>
      <div class="progress-bg">
        <div class="progress-fill" id="chats-progress" style="width: 0%;"></div>
      </div>
    </div>
  </div>
</div>

<div class="grid">
  <!-- Embeddable AI Chatbot Widget Card (Full Width) -->
  <div class="card full-col widget-card" id="widget-section">
    <h2>
      <span>🌐 Embeddable AI Chatbot Widget</span>
      <span id="widget-plan-tag" class="badge badge-free">🔒 Khusus Pro</span>
    </h2>
    <p class="desc">Pasang asisten chatbot AI pintar ini langsung di landing page atau website Anda hanya dengan 1 baris kode script.</p>

    <!-- Content for Free Users (Locked Gate) -->
    <div id="widget-free-view" style="display:none;">
      <div class="locked-overlay">
        <div class="locked-icon">🔒</div>
        <h3 style="margin-bottom:6px;">Fitur Eksklusif Pro Plan</h3>
        <p class="muted" style="max-width:560px;margin:0 auto 16px;">
          Fitur <strong>Embeddable AI Chatbot Widget</strong> hanya dapat diakses oleh pengguna <strong>Pro Plan</strong>.
          Dengan Pro Plan, Anda mendapatkan script widget yang bisa ditempel di WordPress, Webflow, Landing Page HTML, Shopify, atau platform apa pun agar pengunjung dapat langsung bertanya 24/7.
        </p>
        <div class="code-block" style="opacity:0.6;filter:blur(1px);user-select:none;max-width:600px;margin:0 auto 16px;">
          &lt;script src="https://cabe-chatbot.dev/widget.js" data-widget-key="wgt_pro_unlocked_sample" defer&gt;&lt;/script&gt;
        </div>
        <button type="button" class="btn btn-gold" id="unlock-pro-btn" style="font-size:1rem;padding:12px 24px;">
          ⭐ Upgrade ke Pro Plan Sekarang (Buka Kunci Widget)
        </button>
      </div>
    </div>

    <!-- Content for Pro Users (Unlocked) -->
    <div id="widget-pro-view" style="display:none;">
      <div style="background:var(--purple-soft);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:0.92em;color:var(--text);">
        ✨ <strong>Pro Plan Aktif!</strong> Gunakan Kunci Widget atau salin script HTML di bawah ini untuk memasang chatbot di landing page Anda.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
        <div>
          <label>Kunci Widget Anda (Widget Key):</label>
          <div class="copy-row">
            <input type="text" id="widget-key-input" readonly>
            <button type="button" class="btn btn-ghost btn-sm" id="copy-key-btn">Salin</button>
            <button type="button" class="btn btn-ghost btn-sm" id="regen-key-btn" title="Buat Kunci Baru">🔄</button>
          </div>
          <span class="muted" style="font-size:0.82em;">Kunci ini mengidentifikasi dokumen Anda secara aman pada widget.</span>
        </div>

        <div>
          <label>Uji Coba & Demo:</label>
          <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
            <a href="/widget-demo" target="_blank" class="btn btn-ghost btn-sm">🔗 Buka Demo Landing Page</a>
            <button type="button" class="btn btn-ghost btn-sm" id="launch-test-widget-btn">💬 Muat Widget di Sini</button>
          </div>
          <span class="muted" style="font-size:0.82em;display:block;margin-top:4px;">Klik "Muat Widget di Sini" untuk menampilkan balon chat mengambang di halaman ini.</span>
        </div>
      </div>

      <label style="margin-top:16px;">Kode Embed HTML (Salin & tempel sebelum tag <code>&lt;/body&gt;</code> di landing page Anda):</label>
      <div class="code-block" id="embed-code-snippet">&lt;script src="..." data-widget-key="..." defer&gt;&lt;/script&gt;</div>
      <button type="button" class="btn btn-gold btn-sm" id="copy-snippet-btn">📋 Salin Kode Embed</button>
      <span id="copy-status" style="margin-left:10px;font-size:0.88em;color:var(--ok);font-weight:700;"></span>
    </div>
  </div>

  <!-- Left Column: Ingest & Document List -->
  <section style="display: flex; flex-direction: column; gap: 20px;">
    <div class="card">
      <h2>
        <span>📥 Ingest Dokumen</span>
      </h2>
      <p class="desc">Tambahkan konten dokumen baru dari URL atau tempelkan HTML mentah.</p>
      <form id="ingest-form" novalidate>
        <div class="mode-row">
          <label><input type="radio" name="ingest-mode" value="url" checked> URL</label>
          <label><input type="radio" name="ingest-mode" value="html"> HTML</label>
        </div>
        <div id="field-url">
          <label for="ingest-url">URL Halaman Web</label>
          <input type="url" id="ingest-url" name="url" placeholder="https://contoh.com/artikel-atau-panduan">
        </div>
        <div id="field-html" style="display:none">
          <label for="ingest-html">Konten Teks / HTML</label>
          <textarea id="ingest-html" name="html" placeholder="&lt;html&gt;...&lt;/html&gt; atau teks panjang"></textarea>
        </div>
        <div class="error-box" id="ingest-error" role="alert"></div>
        <div class="ok-box" id="ingest-result"></div>
        <button type="submit" class="btn" id="ingest-btn" style="width:100%;margin-top:12px;">Ingest Dokumen</button>
      </form>
    </div>

    <div class="card">
      <h2>
        <span>📚 Dokumen Tersimpan</span>
        <span class="muted" id="docs-count">(0)</span>
      </h2>
      <div id="docs-list" style="margin-top: 10px;">
        <p class="muted">Memuat dokumen...</p>
      </div>
    </div>
  </section>

  <!-- Right Column: Web Chat Playground -->
  <section>
    <div class="card">
      <h2>
        <span>💬 Chatbot Playground (RAG)</span>
      </h2>
      <p class="desc">Uji coba AI menjawab pertanyaan langsung dari dokumen yang telah Anda ingest.</p>

      <form id="chat-form" novalidate>
        <label for="chat-question">Pertanyaan Anda</label>
        <textarea id="chat-question" name="question" rows="2" placeholder="Apa inti dari dokumen yang di-ingest?"></textarea>
        <div class="error-box" id="chat-error" role="alert"></div>
        <button type="submit" class="btn" id="chat-btn" style="width:100%;margin-top:8px;">Kirim Pertanyaan</button>
      </form>

      <div style="margin-top: 20px;">
        <label>Riwayat Percakapan</label>
        <div id="chat-log">
          <p class="muted">Belum ada percakapan. Tulis pertanyaan di atas untuk memulai.</p>
        </div>
      </div>
    </div>
  </section>
</div>

<script>
(function() {
  var currentUser = null;
  var currentUsage = null;
  var chatHistory = [];

  var userEmailEl = document.getElementById('user-email');
  var userPlanBadgeEl = document.getElementById('user-plan-badge');
  var planNameDisplayEl = document.getElementById('plan-name-display');
  var upgradePlanBtn = document.getElementById('upgrade-plan-btn');
  var docsQuotaText = document.getElementById('docs-quota-text');
  var docsProgress = document.getElementById('docs-progress');
  var chatsQuotaText = document.getElementById('chats-quota-text');
  var chatsProgress = document.getElementById('chats-progress');

  var paymentBanner = document.getElementById('payment-status-banner');
  var paymentBannerTitle = document.getElementById('payment-banner-title');
  var paymentBannerDesc = document.getElementById('payment-banner-desc');
  var paymentBannerInvoice = document.getElementById('payment-banner-invoice');
  var paymentSpinner = document.getElementById('payment-spinner');
  var checkPaymentBtn = document.getElementById('check-payment-btn');
  var dismissPaymentBtn = document.getElementById('dismiss-payment-btn');

  var widgetSection = document.getElementById('widget-section');
  var widgetPlanTag = document.getElementById('widget-plan-tag');
  var widgetFreeView = document.getElementById('widget-free-view');
  var widgetProView = document.getElementById('widget-pro-view');
  var widgetKeyInput = document.getElementById('widget-key-input');
  var embedCodeSnippet = document.getElementById('embed-code-snippet');
  var copySnippetBtn = document.getElementById('copy-snippet-btn');
  var copyKeyBtn = document.getElementById('copy-key-btn');
  var regenKeyBtn = document.getElementById('regen-key-btn');
  var copyStatus = document.getElementById('copy-status');
  var unlockProBtn = document.getElementById('unlock-pro-btn');
  var launchTestWidgetBtn = document.getElementById('launch-test-widget-btn');

  var docsCountEl = document.getElementById('docs-count');
  var docsListEl = document.getElementById('docs-list');
  var ingestErrorEl = document.getElementById('ingest-error');
  var ingestResultEl = document.getElementById('ingest-result');
  var chatErrorEl = document.getElementById('chat-error');
  var chatLogEl = document.getElementById('chat-log');

  function gotoLogin() { window.location.href = '/login'; }

  /* ---------- Refresh Usage & User ---------- */
  function loadUserData() {
    fetch('/api/user/usage').then(function(r) {
      if (r.status === 401) { gotoLogin(); return null; }
      return r.json();
    }).then(function(data) {
      if (!data || !data.user) return;
      currentUser = data.user;
      currentUsage = data;
      renderUsage();
      loadDocs();
    }).catch(gotoLogin);
  }

  function renderUsage() {
    if (!currentUsage) return;
    var isPro = currentUsage.plan === 'pro';
    var user = currentUsage.user;

    userEmailEl.textContent = user.email || '(tanpa email)';

    if (isPro) {
      userPlanBadgeEl.className = 'badge badge-pro';
      userPlanBadgeEl.textContent = '⭐ PRO';
      planNameDisplayEl.innerHTML = '<span style="color:var(--gold);font-weight:800;">⭐ Pro Plan</span>';
      if (upgradePlanBtn) upgradePlanBtn.style.display = 'none';

      widgetSection.className = 'card full-col widget-card pro-active';
      widgetPlanTag.className = 'badge badge-pro';
      widgetPlanTag.textContent = '⭐ Pro Aktif';
      widgetFreeView.style.display = 'none';
      widgetProView.style.display = 'block';

      var key = currentUsage.widgetKey || '';
      widgetKeyInput.value = key;
      var origin = window.location.origin;
      var snippet = '<script src="' + origin + '/widget.js" data-widget-key="' + key + '" defer><\\/script>';
      embedCodeSnippet.textContent = snippet;
    } else {
      userPlanBadgeEl.className = 'badge badge-free';
      userPlanBadgeEl.textContent = 'FREE';
      planNameDisplayEl.textContent = 'Free Plan';
      if (upgradePlanBtn) {
        upgradePlanBtn.style.display = 'inline-flex';
        upgradePlanBtn.disabled = false;
        upgradePlanBtn.textContent = '🚀 Upgrade ke Pro';
      }

      widgetSection.className = 'card full-col widget-card';
      widgetPlanTag.className = 'badge badge-free';
      widgetPlanTag.textContent = '🔒 Khusus Pro';
      widgetFreeView.style.display = 'block';
      widgetProView.style.display = 'none';
    }

    // Docs Progress
    var docsCount = currentUsage.docsCount || 0;
    var maxDocs = currentUsage.maxDocs || (isPro ? 10 : 1);
    docsQuotaText.textContent = docsCount + ' / ' + maxDocs + (isPro ? ' (Pro)' : ' (Free)');
    var docsPct = Math.min(100, Math.round((docsCount / maxDocs) * 100));
    docsProgress.style.width = docsPct + '%';
    docsProgress.className = 'progress-fill' + (docsPct >= 100 ? ' full' : (docsPct >= 70 ? ' warning' : ''));

    // Chats Progress
    var chatsToday = currentUsage.chatsToday || 0;
    var maxChats = currentUsage.maxDailyChats || (isPro ? 100 : 10);
    chatsQuotaText.textContent = chatsToday + ' / ' + maxChats + (isPro ? ' (Pro)' : ' (Free)');
    var chatsPct = Math.min(100, Math.round((chatsToday / maxChats) * 100));
    chatsProgress.style.width = chatsPct + '%';
    chatsProgress.className = 'progress-fill' + (chatsPct >= 100 ? ' full' : (chatsPct >= 70 ? ' warning' : ''));
  }

  /* ---------- DOKU Checkout & Auto-Polling ---------- */
  var pollingTimer = null;
  var pollAttempts = 0;
  var MAX_POLL_ATTEMPTS = 60; // 60 x 2.5s = 2.5 minutes

  function showPaymentBanner(title, desc, isPending, invoiceNum) {
    if (!paymentBanner) return;
    paymentBanner.style.display = 'flex';
    if (paymentBannerTitle) paymentBannerTitle.textContent = title;
    if (paymentBannerDesc) paymentBannerDesc.innerHTML = desc;
    if (paymentBannerInvoice) paymentBannerInvoice.textContent = invoiceNum || '-';
    if (paymentSpinner) paymentSpinner.style.display = isPending ? 'inline-block' : 'none';
  }

  function hidePaymentBanner() {
    if (paymentBanner) paymentBanner.style.display = 'none';
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function startDokuCheckout() {
    if (upgradePlanBtn) {
      upgradePlanBtn.disabled = true;
      upgradePlanBtn.textContent = '⏳ Membuka DOKU...';
    }
    if (unlockProBtn) {
      unlockProBtn.disabled = true;
      unlockProBtn.textContent = '⏳ Menyiapkan Pembayaran...';
    }

    fetch('/api/payment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          alert('Gagal membuat pembayaran DOKU: ' + data.error);
          if (upgradePlanBtn) { upgradePlanBtn.disabled = false; upgradePlanBtn.textContent = '🚀 Upgrade ke Pro'; }
          if (unlockProBtn) { unlockProBtn.disabled = false; unlockProBtn.textContent = '⭐ Upgrade ke Pro Plan Sekarang (Buka Kunci Widget)'; }
          return;
        }
        if (data.invoiceNumber && data.paymentUrl) {
          localStorage.setItem('cabe_pending_invoice', data.invoiceNumber);
          window.location.href = data.paymentUrl;
        }
      })
      .catch(function(err) {
        alert('Gagal menghubungi server: ' + err);
        if (upgradePlanBtn) { upgradePlanBtn.disabled = false; upgradePlanBtn.textContent = '🚀 Upgrade ke Pro'; }
        if (unlockProBtn) { unlockProBtn.disabled = false; unlockProBtn.textContent = '⭐ Upgrade ke Pro Plan Sekarang (Buka Kunci Widget)'; }
      });
  }

  function checkInvoiceStatus(invoiceNumber, isManual) {
    return fetch('/api/payment/status/' + encodeURIComponent(invoiceNumber))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.isPro || data.status === 'SUCCESS') {
          if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
          localStorage.removeItem('cabe_pending_invoice');
          showPaymentBanner(
            '🎉 Pembayaran Berhasil!',
            'Akun Anda kini aktif sebagai <strong>Pro Plan</strong>. Kuota 10 dokumen, 100 chat/hari, dan widget embed telah siap digunakan!',
            false,
            invoiceNumber
          );
          if (paymentBanner) {
            paymentBanner.style.background = 'rgba(16, 185, 129, 0.15)';
            paymentBanner.style.borderColor = 'var(--ok)';
          }
          loadUserData();
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          setTimeout(function() { hidePaymentBanner(); }, 8000);
          return true;
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
          localStorage.removeItem('cabe_pending_invoice');
          showPaymentBanner(
            '⚠️ Pembayaran Tidak Selesai',
            'Status invoice: <strong>' + data.status + '</strong>. Silakan coba kembali upgrade ke Pro.',
            false,
            invoiceNumber
          );
          if (paymentBanner) {
            paymentBanner.style.background = 'rgba(239, 68, 68, 0.15)';
            paymentBanner.style.borderColor = 'var(--danger)';
          }
          return true;
        } else {
          if (isManual) {
            showPaymentBanner(
              '⏳ Status: ' + (data.status || 'PENDING'),
              'Invoice: <code style="color:var(--purple);font-weight:600;">' + invoiceNumber + '</code> • Pembayaran belum terkonfirmasi di DOKU. Silakan selesaikan pembayaran.',
              true,
              invoiceNumber
            );
          }
          return false;
        }
      })
      .catch(function(err) {
        console.error('Check status error:', err);
        return false;
      });
  }

  function startInvoicePolling(invoiceNumber) {
    if (!invoiceNumber) return;
    if (pollingTimer) clearInterval(pollingTimer);
    pollAttempts = 0;

    showPaymentBanner(
      '⏳ Memverifikasi Pembayaran DOKU...',
      'Invoice: <code style="color:var(--purple);font-weight:600;">' + invoiceNumber + '</code> • Menunggu konfirmasi pembayaran otomatis...',
      true,
      invoiceNumber
    );

    // Initial check
    checkInvoiceStatus(invoiceNumber, false);

    // Polling interval
    pollingTimer = setInterval(function() {
      pollAttempts++;
      if (pollAttempts >= MAX_POLL_ATTEMPTS) {
        clearInterval(pollingTimer);
        pollingTimer = null;
        showPaymentBanner(
          '⌛ Waktu Verifikasi Berakhir',
          'Invoice: <code style="color:var(--purple);font-weight:600;">' + invoiceNumber + '</code> • Klik "Cek Status" jika Anda telah menyelesaikan pembayaran.',
          false,
          invoiceNumber
        );
        return;
      }
      checkInvoiceStatus(invoiceNumber, false);
    }, 2500);
  }

  if (upgradePlanBtn) upgradePlanBtn.addEventListener('click', startDokuCheckout);
  if (unlockProBtn) unlockProBtn.addEventListener('click', startDokuCheckout);

  if (checkPaymentBtn) {
    checkPaymentBtn.addEventListener('click', function() {
      var inv = paymentBannerInvoice ? paymentBannerInvoice.textContent : '';
      if (inv && inv !== '-') {
        checkInvoiceStatus(inv, true);
      } else {
        fetch('/api/payment/latest')
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d.invoice && d.invoice.id) {
              startInvoicePolling(d.invoice.id);
            } else {
              alert('Belum ada data invoice pembayaran.');
            }
          });
      }
    });
  }

  if (dismissPaymentBtn) {
    dismissPaymentBtn.addEventListener('click', function() {
      hidePaymentBanner();
    });
  }

  // Check URL query param or localStorage for pending payment
  var urlParams = new URLSearchParams(window.location.search);
  var invoiceFromUrl = urlParams.get('invoice');
  var savedInvoice = localStorage.getItem('cabe_pending_invoice');
  var activeInvoice = invoiceFromUrl || savedInvoice;
  if (activeInvoice) {
    startInvoicePolling(activeInvoice);
  }

  /* ---------- Copy Helpers ---------- */
  copySnippetBtn.addEventListener('click', function() {
    var text = embedCodeSnippet.textContent;
    navigator.clipboard.writeText(text).then(function() {
      copyStatus.textContent = 'Kode embed tersalin ke clipboard! ✅';
      setTimeout(function() { copyStatus.textContent = ''; }, 3000);
    });
  });

  copyKeyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(widgetKeyInput.value).then(function() {
      alert('Kunci widget tersalin!');
    });
  });

  regenKeyBtn.addEventListener('click', function() {
    if (!confirm('Apakah Anda yakin ingin membuat kunci widget baru? Kunci lama tidak akan berlaku lagi.')) return;
    fetch('/api/widget/regenerate-key', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.widgetKey) {
          loadUserData();
        }
      });
  });

  /* ---------- Launch Test Widget in Dashboard ---------- */
  var testWidgetLoaded = false;
  launchTestWidgetBtn.addEventListener('click', function() {
    if (!currentUsage || currentUsage.plan !== 'pro') {
      alert('Fitur ini hanya untuk Pro Plan.');
      return;
    }
    if (testWidgetLoaded) {
      var existingLauncher = document.getElementById('cabe-widget-launcher');
      if (existingLauncher) existingLauncher.click();
      return;
    }
    var script = document.createElement('script');
    script.src = '/widget.js';
    script.setAttribute('data-widget-key', currentUsage.widgetKey);
    document.body.appendChild(script);
    testWidgetLoaded = true;
    alert('Widget mengambang berhasil dimuat di pojok kanan bawah!');
  });

  /* ---------- Logout ---------- */
  document.getElementById('logout-btn').addEventListener('click', function() {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(function() { gotoLogin(); })
      .catch(function() { gotoLogin(); });
  });

  /* ---------- Ingest ---------- */
  var modeRadios = document.querySelectorAll('input[name="ingest-mode"]');
  var fieldUrl = document.getElementById('field-url');
  var fieldHtml = document.getElementById('field-html');
  modeRadios.forEach(function(radio) {
    radio.addEventListener('change', function() {
      var isUrl = document.querySelector('input[name="ingest-mode"]:checked').value === 'url';
      fieldUrl.style.display = isUrl ? '' : 'none';
      fieldHtml.style.display = isUrl ? 'none' : '';
    });
  });

  document.getElementById('ingest-form').addEventListener('submit', function(e) {
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
    }).then(function(r) {
      return r.json().then(function(data) { return { ok: r.ok, status: r.status, data: data }; });
    }).then(function(res) {
      btn.disabled = false;
      if (!res.ok || (res.data && res.data.error)) {
        var err = (res.data && res.data.error) || 'Gagal melakukan ingest.';
        ingestErrorEl.innerHTML = escapeHtml(err);
        return;
      }
      ingestResultEl.textContent = (res.data && res.data.message) || 'Ingest berhasil.';
      document.getElementById('ingest-url').value = '';
      document.getElementById('ingest-html').value = '';
      loadUserData();
    }).catch(function() {
      btn.disabled = false;
      ingestErrorEl.textContent = 'Gagal mengirim permintaan ingest.';
    });
  });

  /* ---------- Documents List ---------- */
  function loadDocs() {
    fetch('/api/documents').then(function(r) {
      if (r.status === 401) { gotoLogin(); return null; }
      return r.json().then(function(data) { return { ok: r.ok, status: r.status, data: data }; });
    }).then(function(res) {
      if (!res) return;
      if (!res.ok) {
        var errMsg = (res.data && res.data.error) || 'Gagal memuat daftar dokumen.';
        docsListEl.innerHTML = '<p class="error-box">' + escapeHtml(errMsg) + '</p>';
        return;
      }
      var docs = (res.data && res.data.documents) || [];
      docsCountEl.textContent = '(' + docs.length + ')';
      if (docs.length === 0) {
        docsListEl.innerHTML = '<p class="muted">Belum ada dokumen yang di-ingest. Silakan ingest URL atau HTML di sebelah kiri.</p>';
        return;
      }
      var html = '';
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        var preview = d.preview || '(tanpa pratinjau)';
        var chunks = d.chunk_count ? ' (' + d.chunk_count + ' chunks)' : '';
        html += '<div class="doc-item">'
          + '<div class="doc-main">'
          + '<div class="doc-preview">' + escapeHtml(preview) + '</div>'
          + '<div class="doc-meta">'
          + escapeHtml(d.source_url || '(HTML langsung)')
          + ' &middot; ' + escapeHtml(d.created_at || '-')
          + ' &middot; ' + escapeHtml(String(d.size != null ? d.size : 0)) + ' bytes'
          + chunks
          + '</div>'
          + '</div>'
          + '<button type="button" class="btn btn-danger btn-sm" data-id="' + escapeHtml(d.id) + '">Hapus</button>'
          + '</div>';
      }
      docsListEl.innerHTML = html;
    }).catch(function() {
      docsListEl.innerHTML = '<p class="error-box">Gagal terhubung ke server untuk memuat daftar dokumen.</p>';
    });
  }

  docsListEl.addEventListener('click', function(e) {
    var target = e.target;
    var btn = target && target.closest ? target.closest('button[data-id]') : null;
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    if (!confirm('Hapus dokumen ini?')) return;
    btn.disabled = true;
    fetch('/api/documents/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.error) { alert('Gagal menghapus: ' + data.error); }
        loadUserData();
      })
      .catch(function() { alert('Gagal menghapus dokumen.'); loadUserData(); });
  });

  /* ---------- Chat Playground ---------- */
  function renderChat() {
    if (chatHistory.length === 0) {
      chatLogEl.innerHTML = '<p class="muted">Belum ada percakapan. Tulis pertanyaan di atas.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < chatHistory.length; i++) {
      var h = chatHistory[i];
      html += '<div class="chat-qa">'
        + '<div class="chat-q"><span class="chat-label">Tanya</span>' + escapeHtml(h.question) + '</div>'
        + '<div class="chat-a"><span class="chat-label">Jawab</span>' + escapeHtml(h.answer) + '</div>'
        + '<div class="chat-meta">Konteks terpakai: ' + escapeHtml(String(h.context_used)) + ' chunk</div>'
        + '</div>';
    }
    chatLogEl.innerHTML = html;
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
  }

  document.getElementById('chat-form').addEventListener('submit', function(e) {
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
    }).then(function(r) {
      return r.json().then(function(data) { return { ok: r.ok, status: r.status, data: data }; });
    }).then(function(res) {
      btn.disabled = false;
      if (!res.ok || (res.data && res.data.error)) {
        chatErrorEl.textContent = (res.data && res.data.error) || 'Gagal memproses pertanyaan.';
        return;
      }
      chatHistory.push({
        question: question,
        answer: (res.data && res.data.answer) || '',
        context_used: res.data && res.data.context_used != null ? res.data.context_used : 0
      });
      qEl.value = '';
      renderChat();
      loadUserData(); // refresh daily chats quota counter
    }).catch(function() {
      btn.disabled = false;
      chatErrorEl.textContent = 'Gagal mengirim pertanyaan ke server.';
    });
  });

  // Init
  loadUserData();
})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Demo Landing Page: Simulasi website eksternal yang memasang widget */
/* ------------------------------------------------------------------ */

function widgetDemoPage(): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Demo Landing Page - Cabe Chatbot Widget Integration</title>
<style>
${BASE_CSS}
body { background: #f8fafc; color: #1e293b; }
.demo-bar {
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  color: #fff;
  padding: 12px 16px;
  font-size: 0.9em;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.demo-hero {
  max-width: 900px;
  margin: 60px auto 40px;
  padding: 0 16px;
  text-align: center;
}
.demo-hero h1 { font-size: clamp(2rem, 5vw, 3.2rem); margin-bottom: 16px; color: #0f172a; }
.demo-hero p { font-size: 1.15rem; color: #64748b; max-width: 600px; margin: 0 auto 30px; }
.demo-card-grid {
  max-width: 900px;
  margin: 40px auto 80px;
  padding: 0 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}
.demo-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}
.demo-card h3 { font-size: 1.15rem; margin-bottom: 8px; color: #1e293b; }
.demo-card p { font-size: 0.92rem; color: #64748b; margin: 0; }
</style>
</head>
<body>

<div class="demo-bar">
  <div>
    <strong>🧪 Halaman Demo Landing Page:</strong> Perhatikan widget AI Chatbot di pojok kanan bawah!
  </div>
  <div>
    <a href="/dashboard" style="color:#fff;font-weight:700;text-decoration:underline;">← Kembali ke Dashboard</a>
  </div>
</div>

<main class="demo-hero">
  <span class="badge" style="background:#ede9fe;color:#7c3aed;margin-bottom:12px;">Simulasi Landing Page Bisnis</span>
  <h1>Acme Cloud Solutions</h1>
  <p>Kami menyediakan solusi infrastruktur cloud modern untuk perusahaan rintisan dan enterprise di seluruh dunia.</p>
  <div style="display:flex;gap:12px;justify-content:center;">
    <button class="btn" style="background:#7c3aed;padding:12px 24px;">Jelajahi Solusi</button>
    <button class="btn btn-ghost" style="padding:12px 24px;">Hubungi Sales</button>
  </div>
</main>

<div class="demo-card-grid">
  <div class="demo-card">
    <h3>⚡ Performa Tinggi</h3>
    <p>Infrastruktur edge global yang memberikan latensi terendah untuk pengguna aplikasi Anda.</p>
  </div>
  <div class="demo-card">
    <h3>🔒 Keamanan Enterprise</h3>
    <p>Perlindungan data end-to-end dengan enkripsi standar industri dan kepatuhan global.</p>
  </div>
  <div class="demo-card">
    <h3>🤖 AI Assistant 24/7</h3>
    <p>Pengunjung website dapat bertanya langsung kepada AI Assistant yang terpasang di pojok kanan bawah.</p>
  </div>
</div>

<!-- Otomatis ambil widget_key dari query param atau fetch dari session user -->
<script>
(function() {
  var urlParams = new URLSearchParams(window.location.search);
  var key = urlParams.get('key');
  if (key) {
    loadWidget(key);
  } else {
    fetch('/api/user/usage').then(function(r) { return r.json(); }).then(function(d) {
      if (d && d.widgetKey) {
        loadWidget(d.widgetKey);
      } else {
        alert('Tidak ada widget key yang ditemukan. Pastikan Anda sudah login dan memiliki akun Pro.');
      }
    });
  }

  function loadWidget(widgetKey) {
    var s = document.createElement('script');
    s.src = '/widget.js';
    s.setAttribute('data-widget-key', widgetKey);
    s.defer = true;
    document.body.appendChild(s);
  }
})();
</script>

</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Embeddable Widget Script (/widget.js)                              */
/* ------------------------------------------------------------------ */

function widgetScript(): string {
  return `(function() {
  'use strict';

  // 1. Detect Script & Widget Key
  var currentScript = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('widget.js') !== -1) {
        return scripts[i];
      }
    }
    return null;
  })();

  var widgetKey = currentScript ? currentScript.getAttribute('data-widget-key') : null;
  if (!widgetKey && window.__CABE_WIDGET_KEY__) {
    widgetKey = window.__CABE_WIDGET_KEY__;
  }

  // Determine API base URL from script src
  var baseUrl = '';
  if (currentScript && currentScript.src) {
    try {
      var parsed = new URL(currentScript.src);
      baseUrl = parsed.origin;
    } catch(e) {
      baseUrl = '';
    }
  }

  // 2. Inject Scoped CSS
  var style = document.createElement('style');
  style.id = 'cabe-widget-styles';
  style.textContent = [
    '#cabe-widget-launcher {',
    '  position: fixed; bottom: 24px; right: 24px; z-index: 999999;',
    '  width: 58px; height: 58px; border-radius: 50%;',
    '  background: linear-gradient(135deg, #7c3aed, #5b21b6);',
    '  color: #ffffff; border: none; cursor: pointer;',
    '  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.35);',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-size: 26px; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;',
    '  outline: none;',
    '}',
    '#cabe-widget-launcher:hover {',
    '  transform: scale(1.08); box-shadow: 0 10px 28px rgba(124, 58, 237, 0.45);',
    '}',
    '#cabe-widget-launcher:active { transform: scale(0.95); }',
    '#cabe-widget-container {',
    '  position: fixed; bottom: 94px; right: 24px; z-index: 999999;',
    '  width: 380px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 120px);',
    '  background: #ffffff; border-radius: 16px; border: 1px solid #e4daf6;',
    '  box-shadow: 0 12px 40px rgba(92, 44, 178, 0.18);',
    '  display: flex; flex-direction: column; overflow: hidden;',
    '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  color: #1e1a2e; transition: opacity 0.25s ease, transform 0.25s ease;',
    '  transform-origin: bottom right;',
    '}',
    '#cabe-widget-container.cabe-hidden {',
    '  opacity: 0; pointer-events: none; transform: scale(0.85) translateY(20px); display: none;',
    '}',
    '#cabe-widget-header {',
    '  background: linear-gradient(135deg, #7c3aed, #5b21b6);',
    '  color: #ffffff; padding: 14px 16px; display: flex;',
    '  align-items: center; justify-content: space-between;',
    '}',
    '#cabe-widget-header .title-box { display: flex; align-items: center; gap: 8px; }',
    '#cabe-widget-header .title { font-weight: 700; font-size: 15px; }',
    '#cabe-widget-header .status { font-size: 11px; opacity: 0.85; display: flex; align-items: center; gap: 4px; }',
    '#cabe-widget-header .status::before { content: ""; width: 7px; height: 7px; background: #4ade80; border-radius: 50%; display: inline-block; }',
    '#cabe-widget-header .close-btn { background: transparent; border: none; color: #fff; font-size: 20px; cursor: pointer; padding: 2px 6px; border-radius: 6px; opacity: 0.8; }',
    '#cabe-widget-header .close-btn:hover { opacity: 1; background: rgba(255,255,255,0.15); }',
    '#cabe-widget-body {',
    '  flex: 1; padding: 14px; overflow-y: auto; background: #faf7ff;',
    '  display: flex; flex-direction: column; gap: 10px;',
    '}',
    '.cabe-bubble {',
    '  max-width: 82%; padding: 10px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.45; word-break: break-word;',
    '}',
    '.cabe-bot {',
    '  background: #ffffff; color: #1e1a2e; border: 1px solid #e4daf6;',
    '  align-self: flex-start; border-bottom-left-radius: 3px;',
    '  box-shadow: 0 2px 8px rgba(92, 44, 178, 0.04);',
    '}',
    '.cabe-user {',
    '  background: #7c3aed; color: #ffffff;',
    '  align-self: flex-end; border-bottom-right-radius: 3px;',
    '}',
    '.cabe-error-bubble {',
    '  background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;',
    '  align-self: center; font-size: 12px; text-align: center; width: 90%;',
    '}',
    '.cabe-typing { display: flex; align-items: center; gap: 4px; padding: 10px 14px; }',
    '.cabe-typing span { width: 6px; height: 6px; background: #7c3aed; border-radius: 50%; animation: cabeBounce 1.2s infinite ease-in-out; }',
    '.cabe-typing span:nth-child(2) { animation-delay: 0.2s; }',
    '.cabe-typing span:nth-child(3) { animation-delay: 0.4s; }',
    '@keyframes cabeBounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }',
    '#cabe-widget-footer {',
    '  padding: 10px 12px; background: #ffffff; border-top: 1px solid #e4daf6;',
    '  display: flex; flex-direction: column; gap: 6px;',
    '}',
    '#cabe-widget-form { display: flex; gap: 8px; }',
    '#cabe-widget-input {',
    '  flex: 1; padding: 9px 12px; border: 1px solid #e4daf6; border-radius: 8px;',
    '  font-size: 13.5px; outline: none; background: #faf7ff;',
    '}',
    '#cabe-widget-input:focus { border-color: #7c3aed; background: #ffffff; }',
    '#cabe-widget-send {',
    '  background: #7c3aed; color: #ffffff; border: none; border-radius: 8px;',
    '  padding: 0 14px; font-weight: 700; cursor: pointer; transition: background 0.15s;',
    '}',
    '#cabe-widget-send:hover { background: #5b21b6; }',
    '#cabe-widget-send:disabled { opacity: 0.5; cursor: not-allowed; }',
    '#cabe-widget-branding {',
    '  text-align: center; font-size: 10.5px; color: #8b7fa8;',
    '}',
    '#cabe-widget-branding a { color: #7c3aed; text-decoration: none; font-weight: 600; }'
  ].join('\\n');
  document.head.appendChild(style);

  // 3. Create DOM Elements
  var launcher = document.createElement('button');
  launcher.id = 'cabe-widget-launcher';
  launcher.setAttribute('aria-label', 'Buka Chatbot AI');
  launcher.innerHTML = '🌶️';
  document.body.appendChild(launcher);

  var container = document.createElement('div');
  container.id = 'cabe-widget-container';
  container.className = 'cabe-hidden';
  container.innerHTML = [
    '<div id="cabe-widget-header">',
    '  <div class="title-box">',
    '    <span style="font-size:18px;">🌶️</span>',
    '    <div>',
    '      <div class="title">Cabe AI Assistant</div>',
    '      <div class="status">Online &middot; RAG AI</div>',
    '    </div>',
    '  </div>',
    '  <button type="button" class="close-btn" id="cabe-close-btn" aria-label="Tutup Chat">&times;</button>',
    '</div>',
    '<div id="cabe-widget-body">',
    '  <div class="cabe-bubble cabe-bot">',
    '    Halo! 👋 Saya asisten AI pintar. Silakan tanyakan apa saja seputar informasi dan dokumen di website ini.',
    '  </div>',
    '</div>',
    '<div id="cabe-widget-footer">',
    '  <form id="cabe-widget-form">',
    '    <input type="text" id="cabe-widget-input" placeholder="Tulis pertanyaan..." autocomplete="off">',
    '    <button type="submit" id="cabe-widget-send">Kirim</button>',
    '  </form>',
    '  <div id="cabe-widget-branding">',
    '    Powered by <a href="' + (baseUrl || '/') + '" target="_blank">Cabe Chatbot (Pro)</a>',
    '  </div>',
    '</div>'
  ].join('');
  document.body.appendChild(container);

  var isOpen = false;
  var bodyEl = container.querySelector('#cabe-widget-body');
  var formEl = container.querySelector('#cabe-widget-form');
  var inputEl = container.querySelector('#cabe-widget-input');
  var sendBtn = container.querySelector('#cabe-widget-send');
  var closeBtn = container.querySelector('#cabe-close-btn');

  function toggleWidget() {
    isOpen = !isOpen;
    if (isOpen) {
      container.style.display = 'flex';
      setTimeout(function() {
        container.classList.remove('cabe-hidden');
        inputEl.focus();
      }, 10);
      launcher.innerHTML = '&times;';
    } else {
      container.classList.add('cabe-hidden');
      setTimeout(function() {
        if (!isOpen) container.style.display = 'none';
      }, 250);
      launcher.innerHTML = '🌶️';
    }
  }

  launcher.addEventListener('click', toggleWidget);
  closeBtn.addEventListener('click', toggleWidget);

  function appendMessage(text, type) {
    var bubble = document.createElement('div');
    bubble.className = 'cabe-bubble cabe-' + type;
    bubble.textContent = text;
    bodyEl.appendChild(bubble);
    bodyEl.scrollTop = bodyEl.scrollHeight;
    return bubble;
  }

  function showTyping() {
    var typing = document.createElement('div');
    typing.className = 'cabe-bubble cabe-bot cabe-typing';
    typing.id = 'cabe-typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    bodyEl.appendChild(typing);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function removeTyping() {
    var typing = document.getElementById('cabe-typing-indicator');
    if (typing) typing.remove();
  }

  // 4. Handle Chat Submit
  formEl.addEventListener('submit', function(e) {
    e.preventDefault();
    var question = inputEl.value.trim();
    if (!question) return;

    if (!widgetKey) {
      appendMessage('Kunci widget (data-widget-key) belum diatur pada script.', 'error-bubble');
      return;
    }

    appendMessage(question, 'user');
    inputEl.value = '';
    sendBtn.disabled = true;
    showTyping();

    var apiUrl = (baseUrl ? baseUrl : '') + '/api/widget/chat';

    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetKey: widgetKey, question: question })
    })
    .then(function(res) {
      return res.json().then(function(data) { return { status: res.status, ok: res.ok, data: data }; });
    })
    .then(function(res) {
      removeTyping();
      sendBtn.disabled = false;

      if (!res.ok) {
        var errorMsg = (res.data && res.data.error) || 'Terjadi kesalahan pada server.';
        if (res.status === 403) {
          appendMessage('🔒 ' + errorMsg, 'error-bubble');
        } else if (res.status === 429) {
          appendMessage('⚠️ ' + errorMsg, 'error-bubble');
        } else {
          appendMessage('❌ ' + errorMsg, 'error-bubble');
        }
        return;
      }

      var answer = (res.data && res.data.answer) || 'Maaf, tidak ada respon yang diterima.';
      appendMessage(answer, 'bot');
    })
    .catch(function(err) {
      removeTyping();
      sendBtn.disabled = false;
      appendMessage('❌ Gagal terhubung ke server chatbot.', 'error-bubble');
    });
  });

})();
`;
}

/* ------------------------------------------------------------------ */
/* Registrasi Route UI                                                */
/* ------------------------------------------------------------------ */

export function registerUiRoutes(app: Hono<any>): void {
  app.get('/', (c) => c.html(landingPage()));
  app.get('/login', (c) => c.html(authPage({ mode: 'login' })));
  app.get('/signup', (c) => c.html(authPage({ mode: 'signup' })));
  app.get('/dashboard', (c) => c.html(dashboardPage()));
  app.get('/widget-demo', (c) => c.html(widgetDemoPage()));
  app.get('/widget.js', (c) => {
    return c.text(widgetScript(), 200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
  });
}
