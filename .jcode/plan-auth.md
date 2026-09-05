# Kontrak Fitur: Auth Multi-User (cabe-chatbot)

## Tujuan
User authentication (register/login/logout), setiap dokumen milik satu user (kolom `user_id`), dashboard satu halaman, landing page sederhana.

## Database (Worker A - migrations/0002_add_users.sql)
```sql
-- Migration number: 0002 	 2026-09-05T15:00:00.000Z
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
ALTER TABLE documents ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
```
Update juga `schema.sql` agar sama (tambah tabel users + user_id di documents).
CATATAN: `schema.sql` adalah mirror; urutan kolom documents: id, text_content, source_url, user_id, created_at.

## Auth Backend (Worker B - src/auth.ts + modifikasi src/index.ts)
- Hashing: PBKDF2-SHA256 100.000 iterasi via WebCrypto (`crypto.subtle`), salt random 16 byte hex, simpan `password_hash` (hex) + `salt` (hex). Verifikasi pakai timing-safe compare (bandingkan hex string constant-time sederhana).
- Session: cookie `session`, token = base64url(JSON {uid, exp}) + '.' + base64url(HMAC-SHA256(payload, secret)). Secret dari `c.env.AUTH_SECRET || 'dev-secret-change-me'`. Exp 7 hari. Cookie flags: HttpOnly; Path=/; SameSite=Lax; Max-Age=604800; Secure (Secure hanya jika request https, skip jika host localhost).
- Routes (semua JSON):
  - POST /api/auth/register {email, password, name?} → validasi email format & password min 8 char, cek email unik → 200 {success:true, user:{id,email,name}} + set cookie. Error 400 {error}.
  - POST /api/auth/login {email, password} → 200 {success:true, user:{id,email,name}} + cookie. 401 {error:'Invalid email or password'}.
  - POST /api/auth/logout → hapus cookie (Max-Age=0) → {success:true}.
  - GET /api/auth/me → {user:{id,email,name}} atau 401 {error:'Unauthorized'}.
- Middleware `requireAuth`: baca cookie session, verifikasi HMAC & exp, load user dari D1 (SELECT id,email,name FROM users WHERE id=?), set `c.set('user', user)`. 401 JSON {error:'Unauthorized'} jika gagal. Tambahkan `Variables = { user: { id: string; email: string; name: string | null } }` di tipe Hono app.
- Perubahan src/index.ts (HANYA Worker B yang boleh mengedit file ini):
  - Tipe Bindings tambah `AUTH_SECRET: string;`
  - `/ingest` & `/chat` diproteksi `requireAuth`. INSERT documents menyertakan `user_id`. SELECT context chat: `WHERE id IN (...) AND user_id = ?`.
  - Endpoint baru: GET /api/documents → daftar chunk milik user: SELECT id, source_url, created_at, substr(text_content,1,200) as preview, length(text_content) as size FROM documents WHERE user_id=? ORDER BY created_at DESC → {documents:[...]}. DELETE /api/documents/:id → hanya milik user (WHERE id=? AND user_id=?) → {success:true}. Juga hapus vector dari Vectorize (c.env.VECTORIZE.deleteByIds([id])) best-effort try/catch.
  - HAPUS route `app.get('/', ...)` redirect ke /reference (akan diambil alih UI). Biarkan /reference & /openapi.json tetap.
  - Tambah dokumentasi OpenAPI (baseOpenApiSpec) untuk /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/me, /api/documents (GET+DELETE), dan tandai /ingest & /chat butuh cookie session (security scheme cookieAuth type: apiKey in: cookie).
- JANGAN menyentuh src/ui.ts (Worker C). JANGAN mengubah migrations.

## UI (Worker C - src/ui.ts, file BARU, satu-satunya file yang boleh diedit)
Export fungsi `registerUiRoutes(app: Hono<any>)` yang mendaftarkan:
- GET / → landing page HTML: hero sederhana (judul "Cabe Chatbot", tagline RAG dokumen pribadi), 2 tombol: "Sign Up" → /signup, "Login" → /login. Inline CSS, tema ungu (match Scalar theme purple), responsif, dark-friendly boleh.
- GET /login → form email+password, submit via fetch POST /api/auth/login, sukses → redirect /dashboard, gagal → tampilkan pesan error. Link "Belum punya akun? Sign up".
- GET /signup → form name(optional)+email+password, POST /api/auth/register, sukses → /dashboard. Link ke /login.
- GET /dashboard → SATU HALAMAN (HTML+CSS+vanilla JS inline, tanpa framework):
  1. Saat load: fetch GET /api/auth/me; jika 401 → redirect /login. Tampilkan email user + tombol Logout (POST /api/auth/logout lalu redirect /login).
  2. Form ingest: input URL ATAU textarea HTML (toggle atau dua field, kirim salah satu) → POST /ingest JSON {url} atau {html} → tampilkan hasil (jumlah chunks) dan refresh daftar dokumen.
  3. Daftar dokumen: fetch GET /api/documents, render list dikelompokkan per source_url (atau flat), tiap item ada tombol Delete → DELETE /api/documents/:id → refresh list.
  4. Panel chat: textarea pertanyaan + tombol Kirim → POST /chat {question} → tampilkan answer + context_used. Riwayat Q&A tampil di bawah dalam sesi (in-memory saja).
- Semua HTML di-escape dengan helper escapeHtml untuk nilai dinamis (email, dokumen, dsb).
- Return juga: jangan panggil app.use global; cukup app.get untuk 4 route di atas via fungsi registerUiRoutes.

## Integrasi (koordinator)
- import { registerUiRoutes } from './ui'; registerUiRoutes(app); di src/index.ts (setelah auth routes).
- tsc --noEmit, commit, set secret AUTH_SECRET (wrangler secret put), d1 migrations apply remote, deploy.
