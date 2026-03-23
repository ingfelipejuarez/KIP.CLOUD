// KIP · scripts/embed-knowledge.js
// Genera embeddings para todos los chunks de conocimiento que aún no los tienen.
// Ejecutar UNA VEZ después de sembrar: npm run rag:embed
//
// Requiere DEEPSEEK_API_KEY en el entorno.
// Usa la API de embeddings de DeepSeek (compatible con OpenAI format).

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) {
  console.error('❌ DEEPSEEK_API_KEY no definida en .env');
  process.exit(1);
}

async function embed(text) {
  const res = await fetch('https://api.deepseek.com/embeddings', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-v2',
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embeddings API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data?.data?.[0]?.embedding;
}

async function main() {
  // Primero verificar que pgvector está disponible
  try {
    await prisma.$executeRaw`SELECT '[1,2,3]'::vector`;
    console.log('✅ pgvector disponible');
  } catch {
    console.error('❌ pgvector no está instalado en PostgreSQL.');
    console.error('   En Railway: añadir extensión "vector" en el plugin PostgreSQL.');
    console.error('   En local:   CREATE EXTENSION IF NOT EXISTS vector;');
    process.exit(1);
  }

  const chunks = await prisma.knowledgeChunk.findMany({
    where:  { embedding: null },
    select: { id: true, titulo: true, contenido: true, fuente: true },
  });

  if (chunks.length === 0) {
    console.log('✅ Todos los chunks ya tienen embedding.');
    return;
  }

  console.log(`Generando embeddings para ${chunks.length} chunks...`);

  for (const chunk of chunks) {
    try {
      // Texto a embeddear: título + contenido + fuente (para mejor contexto semántico)
      const textToEmbed = `${chunk.titulo}\n${chunk.contenido}\nFuente: ${chunk.fuente}`;
      const embedding   = await embed(textToEmbed);

      if (!embedding) throw new Error('Embedding vacío');

      // Guardar usando SQL raw para el tipo vector
      const vectorStr = `[${embedding.join(',')}]`;
      await prisma.$executeRaw`
        UPDATE knowledge_chunks
        SET embedding = ${vectorStr}::vector
        WHERE id = ${chunk.id}
      `;

      console.log(`  ✓ ${chunk.titulo.slice(0, 50)}`);

      // Esperar 200ms entre peticiones para no superar el rate limit
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`  ✗ Error en "${chunk.titulo}": ${err.message}`);
    }
  }

  const total = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM knowledge_chunks WHERE embedding IS NOT NULL
  `;
  console.log(`\n✅ ${total[0].count} chunks con embedding listos para búsqueda semántica.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
