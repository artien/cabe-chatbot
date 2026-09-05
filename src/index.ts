import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: any;
};

const app = new Hono<{ Bindings: Bindings }>();

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

app.post('/ingest', async (c) => {
  try {
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
    
    // Process each chunk
    const insertedIds = [];
    for (const chunk of chunks) {
      const id = crypto.randomUUID();
      
      // Generate embedding
      const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: [chunk]
      });
      const embedding = data[0];

      // Save to D1
      await c.env.DB.prepare(
        'INSERT INTO documents (id, text_content, source_url) VALUES (?, ?, ?)'
      ).bind(id, chunk, sourceUrl).run();

      // Save to Vectorize
      await c.env.VECTORIZE.upsert([
        {
          id: id,
          values: embedding,
        }
      ]);

      insertedIds.push(id);
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

app.post('/chat', async (c) => {
  try {
    const body = await c.req.json();
    const question = body.question;

    if (!question) {
      return c.json({ error: 'Missing question field in request body' }, 400);
    }

    // 1. Generate embedding for the question
    const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [question]
    });
    const questionEmbedding = data[0];

    // 2. Query Vectorize for top matches
    const vectorizeResults = await c.env.VECTORIZE.query(questionEmbedding, { topK: 3 });

    if (vectorizeResults.matches.length === 0) {
      return c.json({ answer: "I couldn't find any relevant information to answer your question." });
    }

    // 3. Retrieve text context from D1
    const matchIds = vectorizeResults.matches.map(m => m.id);
    const placeholders = matchIds.map(() => '?').join(',');
    
    const { results } = await c.env.DB.prepare(
      `SELECT text_content FROM documents WHERE id IN (${placeholders})`
    ).bind(...matchIds).all();

    const context = results.map((r: any) => r.text_content).join('\\n\\n');

    // 4. Generate answer using LLM
    const systemPrompt = `You are a helpful assistant. Use the following context to answer the user's question. If you cannot answer the question based on the context, say "I don't know based on the provided documents."\n\nContext:\n${context}`;
    
    const response = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
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
