import app from '../src/index';

class MockD1 {
  users: any[] = [];
  documents: any[] = [];
  daily_chat_usage: any[] = [];

  prepare(query: string) {
    const db = this;
    return {
      _binds: [] as any[],
      bind(...args: any[]) {
        this._binds = args;
        return this;
      },
      async first<T = any>(): Promise<T | null> {
        const res = await this.all<T>();
        return res.results && res.results[0] ? res.results[0] : null;
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        const q = query.trim();
        const binds = this._binds;

        if (q.includes('SELECT id, email, name, plan, widget_key FROM users WHERE id = ?')) {
          const user = db.users.find(u => u.id === binds[0]);
          return { results: user ? [user as any] : [] };
        }
        if (q.includes('SELECT id, email, name, password_hash, salt FROM users WHERE email = ?')) {
          const user = db.users.find(u => u.email === binds[0]);
          return { results: user ? [user as any] : [] };
        }
        if (q.includes('SELECT id, email, name, plan, widget_key FROM users WHERE widget_key = ?')) {
          const user = db.users.find(u => u.widget_key === binds[0]);
          return { results: user ? [user as any] : [] };
        }
        if (q.includes('SELECT COUNT(DISTINCT coalesce(doc_id, id)) as total FROM documents WHERE user_id = ?')) {
          const userDocs = db.documents.filter(d => d.user_id === binds[0]);
          const distinct = new Set(userDocs.map(d => d.doc_id || d.id));
          return { results: [{ total: distinct.size } as any] };
        }
        if (q.includes('SELECT count FROM daily_chat_usage WHERE user_id = ? AND usage_date = ?')) {
          const row = db.daily_chat_usage.find(r => r.user_id === binds[0] && r.usage_date === binds[1]);
          return { results: row ? [{ count: row.count } as any] : [] };
        }
        if (q.includes('SELECT') && q.includes('FROM documents WHERE user_id = ?')) {
          const userDocs = db.documents.filter(d => d.user_id === binds[0]);
          const groups = new Map<string, any>();
          for (const d of userDocs) {
            const key = d.doc_id || d.id;
            if (!groups.has(key)) {
              groups.set(key, {
                id: key,
                source_url: d.source_url,
                preview: d.text_content.slice(0, 100),
                size: d.text_content.length,
                created_at: d.created_at || '2026-09-06',
                chunk_count: 1
              });
            } else {
              const g = groups.get(key);
              g.size += d.text_content.length;
              g.chunk_count += 1;
            }
          }
          return { results: Array.from(groups.values()) as any };
        }
        if (q.includes('SELECT id FROM documents WHERE (id = ? OR doc_id = ?) AND user_id = ?')) {
          const userDocs = db.documents.filter(d => (d.id === binds[0] || d.doc_id === binds[1]) && d.user_id === binds[2]);
          return { results: userDocs.map(d => ({ id: d.id })) as any };
        }
        if (q.includes('SELECT text_content FROM documents WHERE id IN')) {
          const userDocs = db.documents.filter(d => d.user_id === binds[binds.length - 1]);
          return { results: userDocs.map(d => ({ text_content: d.text_content })) as any };
        }
        return { results: [] };
      },
      async run(): Promise<{ success: boolean }> {
        const q = query.trim();
        const binds = this._binds;

        if (q.includes('INSERT INTO users')) {
          db.users.push({
            id: binds[0],
            email: binds[1],
            password_hash: binds[2],
            salt: binds[3],
            name: binds[4],
            plan: binds[5] || 'free',
            widget_key: binds[6] || null
          });
          return { success: true };
        }
        if (q.includes('UPDATE users SET plan = ?')) {
          const u = db.users.find(x => x.id === binds[2]);
          if (u) {
            u.plan = binds[0];
            u.widget_key = binds[1];
          }
          return { success: true };
        }
        if (q.includes('UPDATE users SET widget_key = ? WHERE id = ?')) {
          const u = db.users.find(x => x.id === binds[1]);
          if (u) u.widget_key = binds[0];
          return { success: true };
        }
        if (q.includes('INSERT INTO documents')) {
          db.documents.push({
            id: binds[0],
            doc_id: binds[1],
            text_content: binds[2],
            source_url: binds[3],
            user_id: binds[4]
          });
          return { success: true };
        }
        if (q.includes('DELETE FROM documents WHERE (id = ? OR doc_id = ?) AND user_id = ?')) {
          db.documents = db.documents.filter(d => !( (d.id === binds[0] || d.doc_id === binds[1]) && d.user_id === binds[2] ));
          return { success: true };
        }
        if (q.includes('INSERT INTO daily_chat_usage')) {
          const row = db.daily_chat_usage.find(r => r.user_id === binds[1] && r.usage_date === binds[2]);
          if (row) {
            row.count += 1;
          } else {
            db.daily_chat_usage.push({
              id: binds[0],
              user_id: binds[1],
              usage_date: binds[2],
              count: 1
            });
          }
          return { success: true };
        }
        return { success: true };
      }
    };
  }

  async batch(statements: any[]) {
    for (const stmt of statements) {
      await stmt.run();
    }
  }
}

const mockEnv = {
  DB: new MockD1() as any,
  VECTORIZE: {
    async query() {
      return { matches: [{ id: 'mock-doc-1' }] };
    },
    async upsert() {
      return { success: true };
    },
    async deleteByIds() {
      return { success: true };
    }
  } as any,
  AI: {
    async run(model: string, input: any) {
      if (model.includes('bge-m3')) {
        const count = Array.isArray(input.text) ? input.text.length : 1;
        return { data: Array(count).fill(Array(1024).fill(0.1)) };
      }
      if (model.includes('llama')) {
        return { response: 'AI Answer based on document context.' };
      }
      return { response: 'Mock AI response' };
    }
  } as any,
  AUTH_SECRET: 'test-secret-key-12345'
};

async function runVerification() {
  console.log('=== RUNNING FULL VERIFICATION SUITE ===');

  // 1. Register Free user
  const regRes = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@test.com', password: 'password123', name: 'User Test' })
  }, mockEnv);
  const regJson = await regRes.json() as any;
  if (regRes.status !== 200 || !regJson.success) throw new Error('Registration failed');
  console.log('✔ 1. User registration');

  const cookie = regRes.headers.get('set-cookie') || '';
  const authHeaders = { 'Cookie': cookie, 'Content-Type': 'application/json' };

  // 2. Initial Free plan usage check
  const usageRes = await app.request('/api/user/usage', { method: 'GET', headers: authHeaders }, mockEnv);
  const usageJson = await usageRes.json() as any;
  if (usageJson.plan !== 'free' || usageJson.maxDocs !== 1 || usageJson.maxDailyChats !== 10) {
    throw new Error(`Free usage incorrect: ${JSON.stringify(usageJson)}`);
  }
  console.log('✔ 2. Free plan default limits (1 doc, 10 chats/day)');

  // 3. Ingest first doc on Free plan
  const ing1 = await app.request('/ingest', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ html: '<h1>Doc 1</h1><p>Sample text for document one.</p>' })
  }, mockEnv);
  if (ing1.status !== 200) throw new Error(`Ingest 1 failed: ${ing1.status}`);
  console.log('✔ 3. Ingest 1 doc on Free plan');

  // 4. Ingest second doc on Free plan (should be 403)
  const ing2 = await app.request('/ingest', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ html: '<h1>Doc 2</h1><p>Sample text for document two.</p>' })
  }, mockEnv);
  if (ing2.status !== 403) throw new Error(`Expected 403 for 2nd doc on Free, got ${ing2.status}`);
  console.log('✔ 4. Ingest 2nd doc on Free blocked with 403');

  // 5. Chat 10 times on Free plan
  for (let i = 1; i <= 10; i++) {
    const cRes = await app.request('/chat', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ question: `Question ${i}` })
    }, mockEnv);
    if (cRes.status !== 200) throw new Error(`Chat ${i} failed: ${cRes.status}`);
  }
  console.log('✔ 5. 10 chats completed on Free plan');

  // 6. 11th chat on Free plan (should be 429)
  const c11 = await app.request('/chat', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ question: 'Question 11' })
  }, mockEnv);
  if (c11.status !== 429) throw new Error(`Expected 429 for 11th chat on Free, got ${c11.status}`);
  console.log('✔ 6. 11th chat on Free blocked with 429');

  // 7. Widget Chat on Free plan (should be 403 proRequired)
  const wKey = usageJson.widgetKey;
  const wFree = await app.request('/api/widget/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ widgetKey: wKey, question: 'Widget test' })
  }, mockEnv);
  const wFreeJson = await wFree.json() as any;
  if (wFree.status !== 403 || !wFreeJson.proRequired) {
    throw new Error(`Expected 403 proRequired for widget on Free, got ${wFree.status}`);
  }
  console.log('✔ 7. Widget chat blocked on Free with 403 (proRequired)');

  // 8. Upgrade to Pro
  const upg = await app.request('/api/user/plan', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ plan: 'pro' })
  }, mockEnv);
  const upgJson = await upg.json() as any;
  if (upg.status !== 200 || upgJson.plan !== 'pro') throw new Error('Upgrade to Pro failed');
  console.log('✔ 8. Upgrade user to Pro plan');

  // 9. Check Pro plan usage (10 docs, 100 chats/day)
  const proUsage = await app.request('/api/user/usage', { method: 'GET', headers: authHeaders }, mockEnv);
  const proUsageJson = await proUsage.json() as any;
  if (proUsageJson.plan !== 'pro' || proUsageJson.maxDocs !== 10 || proUsageJson.maxDailyChats !== 100) {
    throw new Error(`Pro usage incorrect: ${JSON.stringify(proUsageJson)}`);
  }
  console.log('✔ 9. Pro plan limits verified (10 docs, 100 chats/day)');

  // 10. Ingest up to 10 docs on Pro
  for (let i = 2; i <= 10; i++) {
    const res = await app.request('/ingest', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ html: `<h1>Doc ${i}</h1><p>Text for doc ${i}</p>` })
    }, mockEnv);
    if (res.status !== 200) throw new Error(`Pro ingest ${i} failed: ${res.status}`);
  }
  console.log('✔ 10. Pro plan ingested up to 10 docs');

  // 11. 11th doc on Pro blocked (403)
  const ing11 = await app.request('/ingest', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ html: '<h1>Doc 11</h1><p>Text for doc 11</p>' })
  }, mockEnv);
  if (ing11.status !== 403) throw new Error(`Expected 403 for 11th doc on Pro, got ${ing11.status}`);
  console.log('✔ 11. 11th doc on Pro blocked with 403');

  // 12. Widget chat on Pro (200 OK)
  const proKey = proUsageJson.widgetKey;
  const wPro = await app.request('/api/widget/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ widgetKey: proKey, question: 'What is document one about?' })
  }, mockEnv);
  const wProJson = await wPro.json() as any;
  if (wPro.status !== 200 || !wProJson.answer) {
    throw new Error(`Widget chat on Pro failed: ${wPro.status} ${JSON.stringify(wProJson)}`);
  }
  console.log('✔ 12. Widget chat on Pro succeeded');

  // 13. Regenerate widget key
  const regen = await app.request('/api/widget/regenerate-key', { method: 'POST', headers: authHeaders }, mockEnv);
  const regenJson = await regen.json() as any;
  if (regen.status !== 200 || !regenJson.widgetKey || regenJson.widgetKey === proKey) {
    throw new Error('Regenerate widget key failed');
  }
  console.log('✔ 13. Widget key regenerated successfully');

  // 14. Static and spec endpoints
  const wJs = await app.request('/widget.js', { method: 'GET' }, mockEnv);
  if (wJs.status !== 200 || !wJs.headers.get('content-type')?.includes('javascript')) throw new Error('widget.js failed');
  console.log('✔ 14. GET /widget.js valid');

  const wDemo = await app.request('/widget-demo', { method: 'GET' }, mockEnv);
  if (wDemo.status !== 200) throw new Error('/widget-demo failed');
  console.log('✔ 15. GET /widget-demo valid');

  const oapi = await app.request('/openapi.json', { method: 'GET' }, mockEnv);
  if (oapi.status !== 200) throw new Error('/openapi.json failed');
  console.log('✔ 16. GET /openapi.json valid');

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED!\n');
}

runVerification().catch(e => {
  console.error(e);
  (globalThis as any).process?.exit?.(1);
});
