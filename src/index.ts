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
} from './auth';
import { registerUiRoutes } from './ui';

type Bindings = {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: any;
  AUTH_SECRET: string;
};

const app = new Hono<{
  Bindings: Bindings;
  Variables: { user: { id: string; email: string; name: string | null } };
}>();

const authGuard = requireAuth() as any;

// Enable CORS for testing from browser / Scalar UI
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
          'Menerima dokumen HTML atau URL halaman web, mengekstrak konten teks bernilai, memecahnya menjadi potongan teks (*chunks*), membuat vektor embedding dengan Workers AI (`@cf/baai/bge-m3`), serta menyimpannya ke D1 Database dan Vectorize milik user yang sedang login. **Butuh login (cookie session).**',
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
            description: 'Dokumen berhasil di-ingest dan disimpan ke D1 & Vectorize.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Ingested 2 chunks successfully' },
                    ids: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['d9e6f3b0-2b1b-4f8a-9f8a-2b1b4f8a9f8a'],
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad Request - Field `html` atau `url` tidak ditemukan atau konten kosong.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Missing html or url field in request body' },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Internal Server Error.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Failed to ingest document' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/chat': {
      post: {
        summary: 'Tanya Dokumen (Chat RAG)',
        description:
          'Menerima pertanyaan user, membuat embedding dari pertanyaan, melakukan similarity search di Vectorize Index, mengambil potongan dokumen teks asli dari D1 Database, dan menghasilkan jawaban cerdas menggunakan LLM `@cf/meta/llama-3.2-3b-instruct`. **Butuh login (cookie session).**',
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
                      description: 'Jumlah potongan teks referensi D1 yang digunakan sebagai konteks LLM.',
                      example: 2,
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad Request - Parameter pertanyaan tidak ada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Missing question field in request body' },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Internal Server Error.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Failed to process chat request' },
                  },
                },
              },
            },
          },
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
        summary: 'Login',
        description: 'Login dengan email & password. Set cookie session HttpOnly.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login berhasil.' },
          '401': { description: 'Email atau password salah.' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        summary: 'Logout',
        description: 'Menghapus cookie session.',
        responses: { '200': { description: 'Logout berhasil.' } },
      },
    },
    '/api/auth/me': {
      get: {
        summary: 'Profil user saat ini',
        description: 'Mengembalikan user yang sedang login berdasarkan cookie session.',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': { description: 'Data user.' },
          '401': { description: 'Belum login.' },
        },
      },
    },
    '/api/documents': {
      get: {
        summary: 'Daftar dokumen milik user',
        description: 'Mengembalikan semua chunk dokumen milik user yang sedang login.',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': { description: 'Daftar dokumen.' },
          '401': { description: 'Belum login.' },
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
    const name = body.name ? String(body.name).trim() || null : null;

    if (!email || !EMAIL_RE.test(email)) {
      return c.json({ error: 'Email tidak valid' }, 400);
    }
    if (password.length < 8) {
      return c.json({ error: 'Password minimal 8 karakter' }, 400);
    }

    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();
    if (existing) {
      return c.json({ error: 'Email sudah terdaftar' }, 400);
    }

    const id = crypto.randomUUID();
    const { passwordHash, salt } = await hashPassword(password);

    await c.env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, salt, name) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(id, email, passwordHash, salt, name)
      .run();

    const secret = c.env.AUTH_SECRET || 'dev-secret-change-me';
    const token = await signSession(id, secret);
    const isSecure = new URL(c.req.url).protocol === 'https:';

    c.header('Set-Cookie', buildSessionCookie(token, isSecure));
    return c.json({ success: true, user: { id, email, name } });
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
      'SELECT id, email, name, password_hash, salt FROM users WHERE email = ?'
    )
      .bind(email)
      .first<{ id: string; email: string; name: string | null; password_hash: string; salt: string }>();

    if (!row) {
      return c.json({ error: 'Email atau password salah' }, 401);
    }

    const valid = await verifyPassword(password, row.salt, row.password_hash);
    if (!valid) {
      return c.json({ error: 'Email atau password salah' }, 401);
    }

    const secret = c.env.AUTH_SECRET || 'dev-secret-change-me';
    const token = await signSession(row.id, secret);
    const isSecure = new URL(c.req.url).protocol === 'https:';

    c.header('Set-Cookie', buildSessionCookie(token, isSecure));
    return c.json({ success: true, user: { id: row.id, email: row.email, name: row.name ?? null } });
  } catch (error: any) {
    console.error('Login error:', error);
    return c.json({ error: error.message || 'Gagal login' }, 500);
  }
});

app.post('/api/auth/logout', (c) => {
  const isSecure = new URL(c.req.url).protocol === 'https:';
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
// Routes dokumen milik user
// --------------------------------------------------------------------

app.get('/api/documents', authGuard, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT id, source_url, substr(text_content, 1, 200) AS preview, length(text_content) AS size, created_at
     FROM documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`
  )
    .bind(user.id)
    .all();
  return c.json({ documents: results });
});

app.delete('/api/documents/:id', authGuard, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();
  if (!row) {
    return c.json({ error: 'Dokumen tidak ditemukan atau bukan milik Anda' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();

  try {
    await c.env.VECTORIZE.deleteByIds([id]);
  } catch (e) {
    console.error('Vectorize delete error (best-effort):', e);
  }

  return c.json({ success: true });
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

  // 2. Remove non-content / boilerplate / noise tags along with their inner contents
  const tagsToRemove = [
    'script',
    'style',
    'noscript',
    'template',
    'svg',
    'canvas',
    'header',
    'footer',
    'nav',
    'aside',
    'form',
    'iframe',
  ];

  for (const tag of tagsToRemove) {
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    cleaned = cleaned.replace(regex, ' ');
  }

  // 3. Extract body content if present
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    cleaned = bodyMatch[1];
  }

  // 4. Add newlines around block-level elements to preserve structure/spacing
  cleaned = cleaned.replace(/<\/(p|div|section|article|main|h[1-6]|li|tr|blockquote|pre)>/gi, '\n');
  cleaned = cleaned.replace(/<(br|hr)[\s/]*>/gi, '\n');

  // 5. Strip all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 6. Decode entities
  cleaned = decodeHtmlEntities(cleaned);

  // 7. Normalize whitespace while preserving paragraphs
  const lines = cleaned
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return lines.join('\n');
}

// Simple utility to chunk text by length
function chunkText(text: string, maxLength: number = 1000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
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

    const body = await c.req.json();
    let html = body.html;
    const sourceUrl = body.url || 'unknown';

    // If url is provided and html is not, fetch directly using standard fetch
    if (!html && body.url) {
      const response = await fetch(body.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; cabe-bot/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        return c.json({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` }, 400);
      }

      html = await response.text();
    }

    if (!html) {
      return c.json({ error: 'Missing html or url field in request body' }, 400);
    }

    // Extract valuable plain text from HTML without Cheerio
    const plainText = extractValuableContent(html);

    if (!plainText) {
      return c.json({ error: 'Could not extract valuable text from HTML' }, 400);
    }

    // Chunk the text
    const chunks = chunkText(plainText, 1000);
    
    // Process chunks in batches for high-speed parallel ingest
    const BATCH_SIZE = 25;
    const insertedIds: string[] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const batchIds = batchChunks.map(() => crypto.randomUUID());

      // 1. Generate embeddings for all chunks in the batch in a single call
      const { data } = await c.env.AI.run('@cf/baai/bge-m3', {
        text: batchChunks,
      });

      // 2. Batch insert all chunks into D1 database (owned by user)
      const d1Statements = batchChunks.map((chunk, idx) =>
        c.env.DB.prepare(
          'INSERT INTO documents (id, text_content, source_url, user_id) VALUES (?, ?, ?, ?)'
        ).bind(batchIds[idx], chunk, sourceUrl, user.id)
      );
      await c.env.DB.batch(d1Statements);

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
      ids: insertedIds
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

    const body = await c.req.json();
    const question = body.question;

    if (!question) {
      return c.json({ error: 'Missing question field in request body' }, 400);
    }

    // 1. Generate embedding for the question
    const { data } = await c.env.AI.run('@cf/baai/bge-m3', {
      text: [question]
    });
    const questionEmbedding = data[0];

    // 2. Query Vectorize for top matches (isolation is enforced by the user_id
    // filter on the D1 context query below)
    const vectorizeResults = await c.env.VECTORIZE.query(questionEmbedding, { topK: 3 });

    if (vectorizeResults.matches.length === 0) {
      return c.json({ answer: "I couldn't find any relevant information to answer your question." });
    }

    // 3. Retrieve text context from D1 (only chunks owned by this user)
    const matchIds = vectorizeResults.matches.map(m => m.id);
    const placeholders = matchIds.map(() => '?').join(',');
    
    const { results } = await c.env.DB.prepare(
      `SELECT text_content FROM documents WHERE id IN (${placeholders}) AND user_id = ?`
    ).bind(...matchIds, user.id).all();

    const context = results.map((r: any) => r.text_content).join('\n\n');

    // 4. Generate answer using LLM
    const systemPrompt = `You are a helpful assistant. Use the following context to answer the user's question. If you cannot answer the question based on the context, say "I don't know based on the provided documents."\n\nContext:\n${context}`;
    
    const response = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ]
    });

    return c.json({
      answer: response.response,
      context_used: results.length
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return c.json({ error: error.message || 'Failed to process chat request' }, 500);
  }
});

export default app;
