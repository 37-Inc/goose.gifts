import OpenAI from 'openai';

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return client;
}

export async function generateTextEmbedding(input: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const text = input.trim();

  if (!openai || !text) {
    return [];
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });

    return response.data[0]?.embedding ?? [];
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    return [];
  }
}

export function buildProductEmbeddingText(product: {
  title: string;
  punnyTitle?: string | null;
  wittyDescription?: string | null;
  sourceQuery?: string | null;
  humorTags?: string[] | null;
}): string {
  return [
    product.punnyTitle,
    product.title,
    product.wittyDescription,
    product.sourceQuery,
    product.humorTags?.join(' '),
  ].filter(Boolean).join('. ');
}
