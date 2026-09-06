import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiReference } from '@scalar/hono-api-reference';
import {
  requireAuth,
  getAuthUser,
  hashPassword,
  verifyPassword,
  signSession,
  buildSessionCookie,
  buildLogoutCookie,
  isSecureRequest,
  generateWidgetKey,
  AuthUser,
} from './auth';
import { registerUiRoutes } from './ui';

type Bindings = {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: any;
  AUTH_SECRET: string;
};

export const PLAN_LIMITS = {
  free: {
    maxDocs: 1,
    maxDailyChats: 10,
  },
  pro: {
    maxDocs: 10,
    maxDailyChats: 100,
  },
} as const;

const app = new Hono<{
  Bindings: Bindings;
  Variables: { user: AuthUser };
}>();

const authGuard = requireAuth() as any;

// Enable CORS for testing from browser / Scalar UI / widget
app.use('*', cors());

// Fungsi pembantu untuk membuat OpenAPI Specification dengan server URL dinamis
function getOpenApiSpec(origin?: string) {
  const currentOrigin = origin || 'http://localhost:8787';
  const isLocal = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');

  const servers = [
    {
      url: currentOrigin,
      description: isLocal ? 'Current environment (Development)' : 'Current environment (Production)',
    },
  ];

  if (!isLocal) {
    servers.push({
      url: 'http://localhost:8787',
      description: 'Local development server',
    });
  }

  return {
    ...baseOpenApiSpec,
    servers,
  };
}

// OpenAPI 3.1.0 Specification Definition (Base)
const baseOpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Cabe Chatbot RAG API',
    version: '1.0.0',
    description:
      'API RAG (Retrieval-Augmented Generation) berbasis Cloudflare Workers (Free Tier), D1 Database, Vectorize, dan Workers AI menggunakan Hono.js.',
  },
  paths: {
    '/ingest': {
      post: {
        summary: 'Ingest Document (HTML atau URL)',
        description:
          'Menerima dokumen HTML atau URL halaman web, mengekstrak konten teks bernilai, memecahnya menjadi potongan teks (*chunks*), membuat vektor embedding dengan Workers AI (`@cf/baai/bge-m3`), serta menyimpannya ke D1 Database dan Vectorize milik user yang sedang login. Kuota: Free maks 1 dokumen, Pro maks 10 dokumen. **Butuh login (cookie session).**',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    format: 'uri',
                    description: 'URL halaman web yang ingin diambil dan di-ingest secara otomatis.',
                    example: 'https://example.com',
                  },
                  html: {
                    type: 'string',
                    description: 'Konten mentah HTML (opsional jika `url` sudah disediakan).',
                    example: '<html><body><h1>Judul Dokumen</h1><p>Penjelasan konten dokumen...</p></body></html>',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Dokumen berhasil di-ingest dan disimpan ke D1 Database & Vectorize.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                      type: 'string',
                      example: 'Ingested 5 chunks successfully',
                    },
                    doc_id: {
                      type: 'string',
                      example: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a',
                    },
                    ids: {
                      type: 'array',
                      items: { type: 'string' },
                      example: [
                        'c9bf9e57-1685-4c89-bafb-ff5af830be8a_0',
                        'c9bf9e57-1685-4c89-bafb-ff5af830be8a_1',
                      ],
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Input tidak valid (tidak menyertakan `url` atau `html`, atau gagal mengambil halaman).',
          },
          '401': {
            description: 'Unauthorized (belum login).',
          },
          '403': {
            description: 'Batas kuota upload dokumen untuk paket user telah tercapai.',
          },
          '500': {
            description: 'Internal server error saat proses ekstraksi teks, embedding, atau database storage.',
          },
        },
      },
    },
    '/chat': {
      post: {
        summary: 'Tanya Dokumen (Chat RAG)',
        description:
          'Menerima pertanyaan user, membuat embedding dari pertanyaan, melakukan similarity search di Vectorize Index, mengambil potongan dokumen teks asli dari D1 Database, dan menghasilkan jawaban cerdas menggunakan LLM `@cf/meta/llama-3.2-3b-instruct`. Kuota: Free maks 10 chat/hari, Pro maks 100 chat/hari. **Butuh login (cookie session).**',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question'],
                properties: {
                  question: {
                    type: 'string',
                    description: 'Pertanyaan pengguna yang ingin dijawab berdasarkan dokumen yang telah di-ingest.',
                    example: 'Apa isi dari dokumen yang di-ingest tadi?',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Jawaban berhasil di-generate berdasarkan konteks dokumen.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    answer: {
                      type: 'string',
                      example: 'Berdasarkan dokumen yang disediakan, Cloudflare Workers adalah...',
                    },
                    context_used: {
                      type: 'integer',
                      description: 'Jumlah potongan dokumen yang relevan yang digunakan sebagai konteks.',
                      example: 3,
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Field `question` tidak disertakan di dalam request body.',
          },
          '401': {
            description: 'Unauthorized (belum login).',
          },
          '429': {
            description: 'Batas chat harian telah tercapai.',
          },
          '500': {
            description: 'Internal server error saat query Vectorize atau inferensi LLM.',
          },
        },
      },
    },
    '/api/widget/chat': {
      post: {
        summary: 'Chat RAG via Embeddable Widget (Publik)',
        description:
          'Endpoint publik untuk widget chat pihak ketiga menggunakan widgetKey milik user Pro. Menjalankan RAG terhadap dokumen pemilik widget.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['widgetKey', 'question'],
                properties: {
                  widgetKey: {
                    type: 'string',
                    description: 'Kunci unik widget pemilik chatbot (Pro Plan).',
                    example: 'wgt_1234567890abcdef',
                  },
                  question: {
                    type: 'string',
                    description: 'Pertanyaan pengunjung website.',
                    example: 'Berapa harga layanan Anda?',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Jawaban dari AI berhasil didapatkan.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    answer: { type: 'string' },
                    context_used: { type: 'integer' },
                  },
                },
              },
            },
          },
          '400': { description: 'Parameter widgetKey atau question tidak lengkap.' },
          '403': { description: 'Widget key bukan milik akun Pro Plan.' },
          '404': { description: 'Widget key tidak ditemukan.' },
          '429': { description: 'Batas chat harian pemilik widget telah tercapai.' },
          '500': { description: 'Internal server error.' },
        },
      },
    },
    '/api/auth/register': {
      post: {
        summary: 'Registrasi akun baru',
        description: 'Membuat akun baru dengan email & password. Otomatis login (set cookie session).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'budi@contoh.com' },
                  password: { type: 'string', minLength: 8, example: 'rahasia123' },
                  name: { type: 'string', example: 'Budi', description: 'Opsional.' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Registrasi berhasil.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string', nullable: true },
                        plan: { type: 'string', example: 'free' },
                        widget_key: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Email/password tidak valid atau email sudah terdaftar.' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Login akun',
        description: 'Autentikasi dengan email & password, mengembalikan session cookie HttpOnly.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'budi@contoh.com' },
                  password: { type: 'string', example: 'rahasia123' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login berhasil, cookie `session` diset.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string', nullable: true },
                        plan: { type: 'string', example: 'free' },
                        widget_key: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Email atau password salah.' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        summary: 'Logout akun',
        description: 'Menghapus session cookie.',
        responses: {
          '200': { description: 'Logout berhasil.' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        summary: 'Profil user saat ini',
        description: 'Mendapatkan data user yang sedang login via cookie session.',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': {
            description: 'Data user.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string', nullable: true },
                        plan: { type: 'string', example: 'free' },
                        widget_key: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized (belum login).' },
        },
      },
    },
    '/api/user/usage': {
      get: {
        summary: 'Informasi penggunaan kuota dan paket user',
        description:
          'Mengambil informasi paket akun (Free/Pro), batas kuota dokumen, jumlah dokumen yang di-ingest, kuota chat harian, dan widget key. **Butuh login (cookie session).**',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': {
            description: 'Informasi kuota user.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string', nullable: true },
                      },
                    },
                    plan: { type: 'string', enum: ['free', 'pro'] },
                    isPro: { type: 'boolean' },
                    docsCount: { type: 'integer' },
                    maxDocs: { type: 'integer' },
                    chatsToday: { type: 'integer' },
                    maxDailyChats: { type: 'integer' },
                    widgetKey: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized.' },
        },
      },
    },
    '/api/user/plan': {
      post: {
        summary: 'Ubah paket akun user (Free / Pro)',
        description:
          'Mengubah tingkat paket user antara Free dan Pro. Otomatis menghasilkan widget key jika belum ada. **Butuh login (cookie session).**',
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['plan'],
                properties: {
                  plan: { type: 'string', enum: ['free', 'pro'], example: 'pro' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Paket berhasil diperbarui.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    plan: { type: 'string', enum: ['free', 'pro'] },
                    isPro: { type: 'boolean' },
                    widgetKey: { type: 'string', nullable: true },
                    widget_key: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          '400': { description: 'Pilihan plan tidak valid.' },
          '401': { description: 'Unauthorized.' },
        },
      },
    },
    '/api/widget/config': {
      get: {
        summary: 'Konfigurasi embed widget chat',
        description:
          'Mengambil konfigurasi widget key, status Pro, dan script embed HTML untuk dipasang di website pengguna. **Butuh login (cookie session).**',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': {
            description: 'Konfigurasi widget berhasil diambil.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    widgetKey: { type: 'string' },
                    widget_key: { type: 'string' },
                    isPro: { type: 'boolean' },
                    embedSnippet: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized.' },
        },
      },
    },
    '/api/widget/regenerate-key': {
      post: {
        summary: 'Regenerate API / Widget Key',
        description: 'Membuat widget key baru untuk user. **Butuh login (cookie session).**',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': {
            description: 'Widget key berhasil diperbarui.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    widgetKey: { type: 'string' },
                    widget_key: { type: 'string' },
                    embedSnippet: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized.' },
        },
      },
    },
    '/api/documents': {
      get: {
        summary: 'Daftar dokumen milik user',
        description:
          'Mengembalikan ringkasan dokumen yang di-ingest oleh user yang sedang login (grouped per dokumen).',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': {
            description: 'Daftar dokumen.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    documents: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          source_url: { type: 'string', nullable: true },
                          preview: { type: 'string' },
                          size: { type: 'integer' },
                          created_at: { type: 'string' },
                          chunk_count: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/documents/{id}': {
      delete: {
        summary: 'Hapus dokumen milik user',
        description: 'Menghapus chunk dokumen (D1 + Vectorize) hanya jika milik user yang sedang login.',
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'ID dokumen.',
          },
        ],
        responses: {
          '200': { description: 'Dokumen dihapus.' },
          '404': { description: 'Dokumen tidak ditemukan atau bukan milik Anda.' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'session',
        description: 'Cookie session HttpOnly yang di-set saat login/register.',
      },
    },
  },
};

// Endpoint untuk menyajikan OpenAPI JSON Specification
app.get('/openapi.json', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(getOpenApiSpec(origin));
});

// Scalar API Reference Documentation UI
app.get(
  '/reference',
  apiReference((c: any) => {
    const origin = new URL(c.req.url).origin;
    return {
      pageTitle: 'Cabe Chatbot API Documentation',
      theme: 'purple',
      spec: {
        content: getOpenApiSpec(origin),
      },
    };
  })
);

// --------------------------------------------------------------------
// Routes autentikasi
// --------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = body.name ? String(body.name).trim() : null;

    if (!email || !EMAIL_RE.test(email)) {
      return c.json({ error: 'Format email tidak valid' }, 400);
    }
    if (!password || password.length < 8) {
      return c.json({ error: 'Password minimal 8 karakter' }, 400);
    }

    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();
    if (existing) {
      return c.json({ error: 'Email sudah terdaftar' }, 400);
    }

    const id = crypto.randomUUID();
    const widgetKey = generateWidgetKey();
    const { passwordHash, salt } = await hashPassword(password);

    await c.env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, salt, name, plan, widget_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(id, email, passwordHash, salt, name, 'free', widgetKey)
      .run();

    const secret = c.env.AUTH_SECRET || 'dev-secret-change-me';
    const token = await signSession(id, secret);
    const isSecure = isSecureRequest(c.req.url);

    c.header('Set-Cookie', buildSessionCookie(token, isSecure));
    return c.json({
      success: true,
      user: { id, email, name, plan: 'free', widget_key: widgetKey },
    });
  } catch (error: any) {
    console.error('Register error:', error);
    return c.json({ error: error.message || 'Gagal registrasi' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return c.json({ error: 'Email dan password wajib diisi' }, 400);
    }

    const row = await c.env.DB.prepare(
      'SELECT id, email, name, plan, widget_key, password_hash, salt FROM users WHERE email = ?'
    )
      .bind(email)
      .first<{
        id: string;
        email: string;
        name: string | null;
        plan: 'free' | 'pro' | null;
        widget_key: string | null;
        password_hash: string;
        salt: string;
      }>();

    if (!row) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    const valid = await verifyPassword(password, row.salt, row.password_hash);
    if (!valid) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    const secret = c.env.AUTH_SECRET || 'dev-secret-change-me';
    const token = await signSession(row.id, secret);
    const isSecure = isSecureRequest(c.req.url);

    c.header('Set-Cookie', buildSessionCookie(token, isSecure));
    return c.json({
      success: true,
      user: {
        id: row.id,
        email: row.email,
        name: row.name ?? null,
        plan: row.plan === 'pro' ? 'pro' : 'free',
        widget_key: row.widget_key ?? null,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return c.json({ error: error.message || 'Gagal login' }, 500);
  }
});

app.post('/api/auth/logout', (c) => {
  const isSecure = isSecureRequest(c.req.url);
  c.header('Set-Cookie', buildLogoutCookie(isSecure));
  return c.json({ success: true });
});

app.get('/api/auth/me', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return c.json({ user });
});

// --------------------------------------------------------------------
// User Plan & Widget Management Endpoints
// --------------------------------------------------------------------

app.get('/api/user/usage', authGuard, async (c) => {
  try {
    const user = c.get('user');
    const today = new Date().toISOString().slice(0, 10);

    const docCountRow = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT coalesce(doc_id, id)) as total FROM documents WHERE user_id = ?'
    )
      .bind(user.id)
      .first<{ total: number }>();

    const usageRow = await c.env.DB.prepare(
      'SELECT count FROM daily_chat_usage WHERE user_id = ? AND usage_date = ?'
    )
      .bind(user.id, today)
      .first<{ count: number }>();

    const docsCount = docCountRow?.total ?? 0;
    const chatsToday = usageRow?.count ?? 0;
    const plan = user.plan === 'pro' ? 'pro' : 'free';
    const limits = PLAN_LIMITS[plan];

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      plan,
      isPro: plan === 'pro',
      docsCount,
      maxDocs: limits.maxDocs,
      chatsToday,
      maxDailyChats: limits.maxDailyChats,
      widgetKey: user.widget_key,
    });
  } catch (error: any) {
    console.error('User usage error:', error);
    return c.json({ error: error.message || 'Gagal memuat penggunaan user' }, 500);
  }
});

app.post('/api/user/plan', authGuard, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const newPlan = body.plan;

    if (newPlan !== 'free' && newPlan !== 'pro') {
      return c.json({ error: "Nilai plan harus 'free' atau 'pro'" }, 400);
    }

    let widgetKey = user.widget_key;
    if (!widgetKey) {
      widgetKey = generateWidgetKey();
    }

    await c.env.DB.prepare(
      'UPDATE users SET plan = ?, widget_key = coalesce(widget_key, ?) WHERE id = ?'
    )
      .bind(newPlan, widgetKey, user.id)
      .run();

    return c.json({
      success: true,
      plan: newPlan,
      isPro: newPlan === 'pro',
      widgetKey,
      widget_key: widgetKey,
    });
  } catch (error: any) {
    console.error('Update plan error:', error);
    return c.json({ error: error.message || 'Gagal memperbarui paket' }, 500);
  }
});

app.get('/api/widget/config', authGuard, async (c) => {
  try {
    const user = c.get('user');
    const isPro = user.plan === 'pro';
    const origin = new URL(c.req.url).origin;
    let widgetKey = user.widget_key;

    if (!widgetKey) {
      widgetKey = generateWidgetKey();
      await c.env.DB.prepare('UPDATE users SET widget_key = ? WHERE id = ?')
        .bind(widgetKey, user.id)
        .run();
    }

    const embedSnippet = `<script src="${origin}/widget.js" data-widget-key="${widgetKey}" defer></script>`;

    return c.json({
      widgetKey,
      widget_key: widgetKey,
      isPro,
      embedSnippet,
    });
  } catch (error: any) {
    console.error('Widget config error:', error);
    return c.json({ error: error.message || 'Gagal memuat konfigurasi widget' }, 500);
  }
});

app.post('/api/widget/regenerate-key', authGuard, async (c) => {
  try {
    const user = c.get('user');
    const newKey = generateWidgetKey();

    await c.env.DB.prepare('UPDATE users SET widget_key = ? WHERE id = ?')
      .bind(newKey, user.id)
      .run();

    const origin = new URL(c.req.url).origin;
    const embedSnippet = `<script src="${origin}/widget.js" data-widget-key="${newKey}" defer></script>`;

    return c.json({
      success: true,
      widgetKey: newKey,
      widget_key: newKey,
      embedSnippet,
    });
  } catch (error: any) {
    console.error('Regenerate key error:', error);
    return c.json({ error: error.message || 'Gagal meregenerasi widget key' }, 500);
  }
});

// --------------------------------------------------------------------
// Public Embeddable Widget API
// --------------------------------------------------------------------

app.post('/api/widget/chat', async (c) => {
  try {
    if (!c.env.VECTORIZE) {
      return c.json({ error: 'VECTORIZE binding is undefined.' }, 500);
    }
    if (!c.env.DB) {
      return c.json({ error: 'DB (D1) binding is undefined.' }, 500);
    }
    if (!c.env.AI) {
      return c.json({ error: 'AI (Workers AI) binding is undefined.' }, 500);
    }

    const body = await c.req.json();
    const widgetKey = String(body.widgetKey || body.widget_key || '').trim();
    const question = String(body.question || body.message || '').trim();

    if (!widgetKey) {
      return c.json({ error: 'Parameter widgetKey wajib diisi.' }, 400);
    }
    if (!question) {
      return c.json({ error: 'Parameter question wajib diisi.' }, 400);
    }

    // Look up user by widget_key
    const owner = await c.env.DB.prepare(
      'SELECT id, email, name, plan, widget_key FROM users WHERE widget_key = ?'
    )
      .bind(widgetKey)
      .first<{
        id: string;
        email: string;
        name: string | null;
        plan: 'free' | 'pro' | null;
        widget_key: string;
      }>();

    if (!owner) {
      return c.json({ error: 'Widget key tidak valid atau tidak ditemukan.' }, 404);
    }

    const plan = owner.plan === 'pro' ? 'pro' : 'free';
    if (plan !== 'pro') {
      return c.json(
        {
          error: 'Embeddable widget hanya tersedia untuk Pro Plan user. Silakan upgrade ke Pro Plan.',
          proRequired: true,
        },
        403
      );
    }

    // Check daily chat limit for owner (100 chats/day)
    const today = new Date().toISOString().slice(0, 10);
    const usageRow = await c.env.DB.prepare(
      'SELECT count FROM daily_chat_usage WHERE user_id = ? AND usage_date = ?'
    )
      .bind(owner.id, today)
      .first<{ count: number }>();

    const ownerChats = usageRow?.count ?? 0;
    if (ownerChats >= PLAN_LIMITS.pro.maxDailyChats) {
      return c.json(
        { error: 'Batas chat harian pemilik widget telah tercapai (100 pesan/hari).' },
        429
      );
    }

    // 1. Generate embedding for the question
    const { data } = await c.env.AI.run('@cf/baai/bge-m3', {
      text: [question],
    });
    const questionEmbedding = data[0];

    // 2. Query Vectorize
    const vectorizeResults = await c.env.VECTORIZE.query(questionEmbedding, { topK: 3 });

    if (vectorizeResults.matches.length === 0) {
      await c.env.DB.prepare(
        `INSERT INTO daily_chat_usage (id, user_id, usage_date, count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1`
      )
        .bind(crypto.randomUUID(), owner.id, today)
        .run();

      return c.json({
        answer: "I couldn't find any relevant information to answer your question.",
        context_used: 0,
      });
    }

    // 3. Retrieve text context from D1 matching owner.id
    const matchIds = vectorizeResults.matches.map((m: any) => m.id);
    const placeholders = matchIds.map(() => '?').join(',');

    const { results } = await c.env.DB.prepare(
      `SELECT text_content FROM documents WHERE id IN (${placeholders}) AND user_id = ?`
    )
      .bind(...matchIds, owner.id)
      .all();

    const context = (results || []).map((r: any) => r.text_content).join('\n\n');

    // 4. Generate answer using LLM
    const systemPrompt = `You are a helpful assistant. Use the following context to answer the user's question. If you cannot answer the question based on the context, say "I don't know based on the provided documents."\n\nContext:\n${context}`;

    const response = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
    });

    // 5. Increment daily chat usage for owner
    await c.env.DB.prepare(
      `INSERT INTO daily_chat_usage (id, user_id, usage_date, count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1`
    )
      .bind(crypto.randomUUID(), owner.id, today)
      .run();

    return c.json({
      answer: response.response,
      context_used: results ? results.length : 0,
    });
  } catch (error: any) {
    console.error('Widget chat error:', error);
    return c.json({ error: error.message || 'Failed to process widget chat request' }, 500);
  }
});

// --------------------------------------------------------------------
// Routes dokumen milik user
// --------------------------------------------------------------------

app.get('/api/documents', authGuard, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT
       coalesce(doc_id, id) as id,
       min(source_url) as source_url,
       substr(min(text_content), 1, 100) as preview,
       sum(length(text_content)) as size,
       min(created_at) as created_at,
       count(*) as chunk_count
     FROM documents
     WHERE user_id = ?
     GROUP BY coalesce(doc_id, id)
     ORDER BY min(created_at) DESC`
  )
    .bind(user.id)
    .all();

  return c.json({ documents: results || [] });
});

app.delete('/api/documents/:id', authGuard, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // 1. Get all matching chunk IDs to delete from Vectorize
  const { results } = await c.env.DB.prepare(
    'SELECT id FROM documents WHERE (id = ? OR doc_id = ?) AND user_id = ?'
  )
    .bind(id, id, user.id)
    .all();

  const chunkIds = results ? results.map((r: any) => r.id as string).filter(Boolean) : [];

  if (chunkIds.length === 0) {
    return c.json({ error: 'Dokumen tidak ditemukan atau bukan milik Anda' }, 404);
  }

  // 2. Delete from D1
  await c.env.DB.prepare(
    'DELETE FROM documents WHERE (id = ? OR doc_id = ?) AND user_id = ?'
  )
    .bind(id, id, user.id)
    .run();

  // 3. Delete from Vectorize
  if (c.env.VECTORIZE) {
    try {
      await c.env.VECTORIZE.deleteByIds(chunkIds);
    } catch (e) {
      console.error('Vectorize delete error (best-effort):', e);
    }
  }

  return c.json({ success: true, deleted_chunks: chunkIds.length });
});

// --------------------------------------------------------------------
// UI (landing, login, signup, dashboard)
// --------------------------------------------------------------------

registerUiRoutes(app as any);

// Decode common HTML entities
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '-',
    '&mdash;': '-',
    '&hellip;': '...',
  };

  return text
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|ndash|mdash|hellip);/g, (match) => entities[match] || match)
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _;
      }
    });
}

// Extract valuable text content from raw HTML without external libraries
function extractValuableContent(html: string): string {
  if (!html) return '';

  let cleaned = html;

  // 1. Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Remove script, style, noscript, svg, iframe, canvas, nav, footer, header tags
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  cleaned = cleaned.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');
  cleaned = cleaned.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ');
  cleaned = cleaned.replace(/<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi, ' ');
  cleaned = cleaned.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ');
  cleaned = cleaned.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');
  cleaned = cleaned.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');

  // 3. Try prioritizing main content containers if available
  const mainMatch = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
                    cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (mainMatch && mainMatch[1] && mainMatch[1].trim().length > 100) {
    cleaned = mainMatch[1];
  }

  // 4. Replace block level tags with newlines
  cleaned = cleaned.replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n');
  cleaned = cleaned.replace(/<br\s*[\/]?>/gi, '\n');

  // 5. Strip remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 6. Decode entities
  cleaned = decodeHtmlEntities(cleaned);

  // 7. Clean up whitespace
  const lines = cleaned.split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0);

  return lines.join('\n');
}

// Chunk text with overlap
function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

app.post('/ingest', authGuard, async (c) => {
  try {
    const user = c.get('user');
    if (!c.env.VECTORIZE) {
      return c.json(
        {
          error:
            'VECTORIZE binding is undefined. Jalankan server lokal dengan mode remote menggunakan: `npm run dev` (atau `wrangler dev --remote`) agar Vectorize terikat ke Cloudflare.',
        },
        500
      );
    }
    if (!c.env.DB) {
      return c.json({ error: 'DB (D1) binding is undefined.' }, 500);
    }
    if (!c.env.AI) {
      return c.json({ error: 'AI (Workers AI) binding is undefined.' }, 500);
    }

    const plan = user.plan === 'pro' ? 'pro' : 'free';
    const maxDocs = PLAN_LIMITS[plan].maxDocs;

    const docCountRow = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT coalesce(doc_id, id)) as total FROM documents WHERE user_id = ?'
    )
      .bind(user.id)
      .first<{ total: number }>();

    const currentDocs = docCountRow?.total ?? 0;
    if (currentDocs >= maxDocs) {
      return c.json(
        {
          error: `Batas upload dokumen tercapai untuk paket ${plan.toUpperCase()} (maksimal ${maxDocs} dokumen). Silakan upgrade ke Pro Plan atau hapus dokumen lama.`,
        },
        403
      );
    }

    const body = await c.req.json();
    let textToProcess = '';
    let sourceUrl: string | null = null;

    if (body.url) {
      sourceUrl = body.url;
      try {
        const response = await fetch(body.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Cabe-Chatbot/1.0',
          },
        });
        if (!response.ok) {
          return c.json(
            { error: `Gagal mengambil URL: ${response.status} ${response.statusText}` },
            400
          );
        }
        const html = await response.text();
        textToProcess = extractValuableContent(html);
      } catch (err: any) {
        return c.json({ error: `Gagal fetch URL: ${err.message}` }, 400);
      }
    } else if (body.html) {
      textToProcess = extractValuableContent(body.html);
    } else {
      return c.json({ error: 'Missing required field: `url` or `html`' }, 400);
    }

    if (!textToProcess || textToProcess.trim().length === 0) {
      return c.json(
        { error: 'Tidak ada konten teks yang dapat diekstrak dari sumber tersebut.' },
        400
      );
    }

    const chunks = chunkText(textToProcess);
    if (chunks.length === 0) {
      return c.json({ error: 'Konten terlalu pendek untuk di-chunk.' }, 400);
    }

    const docId = crypto.randomUUID();
    const insertedIds: string[] = [];

    // Process chunks in batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const batchIds = batchChunks.map(() => crypto.randomUUID());

      // 1. Generate embeddings using Workers AI
      const { data } = await c.env.AI.run('@cf/baai/bge-m3', {
        text: batchChunks,
      });

      // 2. Insert text into D1
      const statements = batchChunks.map((chunkText, idx) => {
        return c.env.DB.prepare(
          'INSERT INTO documents (id, doc_id, text_content, source_url, user_id) VALUES (?, ?, ?, ?, ?)'
        ).bind(batchIds[idx], docId, chunkText, sourceUrl, user.id);
      });
      await c.env.DB.batch(statements);

      // 3. Batch upsert all vectors into Vectorize
      const vectorizePayload = batchIds.map((id, idx) => ({
        id,
        values: data[idx],
      }));
      await c.env.VECTORIZE.upsert(vectorizePayload);

      insertedIds.push(...batchIds);
    }

    return c.json({
      success: true,
      message: `Ingested ${chunks.length} chunks successfully`,
      doc_id: docId,
      ids: insertedIds,
    });
  } catch (error: any) {
    console.error('Ingest error:', error);
    return c.json({ error: error.message || 'Failed to ingest document' }, 500);
  }
});

app.post('/chat', authGuard, async (c) => {
  try {
    const user = c.get('user');
    if (!c.env.VECTORIZE) {
      return c.json(
        {
          error:
            'VECTORIZE binding is undefined. Jalankan server lokal dengan mode remote menggunakan: `npm run dev` (atau `wrangler dev --remote`) agar Vectorize terikat ke Cloudflare.',
        },
        500
      );
    }
    if (!c.env.DB) {
      return c.json({ error: 'DB (D1) binding is undefined.' }, 500);
    }
    if (!c.env.AI) {
      return c.json({ error: 'AI (Workers AI) binding is undefined.' }, 500);
    }

    // Check daily chat limit
    const plan = user.plan === 'pro' ? 'pro' : 'free';
    const maxDailyChats = PLAN_LIMITS[plan].maxDailyChats;
    const today = new Date().toISOString().slice(0, 10);

    const usageRow = await c.env.DB.prepare(
      'SELECT count FROM daily_chat_usage WHERE user_id = ? AND usage_date = ?'
    )
      .bind(user.id, today)
      .first<{ count: number }>();

    const currentChats = usageRow?.count ?? 0;
    if (currentChats >= maxDailyChats) {
      return c.json(
        {
          error: `Batas chat harian (${maxDailyChats} pesan/hari) untuk paket ${plan.toUpperCase()} telah tercapai. Silakan coba lagi besok atau upgrade ke Pro Plan.`,
        },
        429
      );
    }

    const body = await c.req.json();
    const question = body.question;

    if (!question) {
      return c.json({ error: 'Missing question field in request body' }, 400);
    }

    // 1. Generate embedding for the question
    const { data } = await c.env.AI.run('@cf/baai/bge-m3', {
      text: [question],
    });
    const questionEmbedding = data[0];

    // 2. Query Vectorize for top matches
    const vectorizeResults = await c.env.VECTORIZE.query(questionEmbedding, { topK: 3 });

    if (vectorizeResults.matches.length === 0) {
      await c.env.DB.prepare(
        `INSERT INTO daily_chat_usage (id, user_id, usage_date, count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1`
      )
        .bind(crypto.randomUUID(), user.id, today)
        .run();

      return c.json({
        answer: "I couldn't find any relevant information to answer your question.",
        context_used: 0,
      });
    }

    // 3. Retrieve text context from D1 (only chunks owned by this user)
    const matchIds = vectorizeResults.matches.map((m: any) => m.id);
    const placeholders = matchIds.map(() => '?').join(',');

    const { results } = await c.env.DB.prepare(
      `SELECT text_content FROM documents WHERE id IN (${placeholders}) AND user_id = ?`
    )
      .bind(...matchIds, user.id)
      .all();

    const context = (results || []).map((r: any) => r.text_content).join('\n\n');

    // 4. Generate answer using LLM
    const systemPrompt = `You are a helpful assistant. Use the following context to answer the user's question. If you cannot answer the question based on the context, say "I don't know based on the provided documents."\n\nContext:\n${context}`;

    const response = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
    });

    // 5. Increment daily chat usage on successful response
    await c.env.DB.prepare(
      `INSERT INTO daily_chat_usage (id, user_id, usage_date, count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1`
    )
      .bind(crypto.randomUUID(), user.id, today)
      .run();

    return c.json({
      answer: response.response,
      context_used: results ? results.length : 0,
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return c.json({ error: error.message || 'Failed to process chat request' }, 500);
  }
});

export default app;
