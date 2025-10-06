import OpenAI from 'openai';
import type { HumorStyle, Product } from './types';
import { GIFT_CONCEPTS_COUNT, PRODUCTS_PER_BUNDLE, MAX_PRODUCTS_BEFORE_LLM } from './config';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface GiftConceptRequest {
  recipientDescription: string;
  occasion?: string;
  humorStyle: HumorStyle;
  minPrice: number;
  maxPrice: number;
}

export interface GiftConcept {
  title: string; // Punny title
  tagline: string; // One-liner
  description: string; // Why this bundle works
  productSearchQueries: string[]; // 2-4 search queries for Amazon/Etsy
}

export async function generateGiftConcepts(
  request: GiftConceptRequest
): Promise<GiftConcept[]> {
  const systemPrompt = buildSystemPrompt(request.humorStyle);
  const userPrompt = buildUserPrompt(request);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 1, // GPT-5 models only support temperature=1
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    return parsed.giftConcepts || [];
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}

function buildSystemPrompt(humorStyle: HumorStyle): string {
  const styleGuides = {
    'dad-joke': 'Use wholesome puns, groan-worthy wordplay, and family-friendly humor. Think classic dad jokes and corny one-liners.',
    'office-safe': 'Keep it professional yet funny. Suitable for workplace gifts with clever wit but nothing offensive or inappropriate.',
    'edgy': 'Push boundaries with sarcastic, irreverent humor. Clever and bold, but not mean-spirited. Think comedians like Anthony Jeselnik or Sarah Silverman.',
    'pg': 'Fun and lighthearted humor suitable for all ages. Playful and silly without any adult themes.',
  };

  return `You are a world-class comedy writer and gift expert who creates hilarious, thoughtful gift ideas.

HUMOR STYLE: ${styleGuides[humorStyle]}

Your task is to generate ${GIFT_CONCEPTS_COUNT} creative gift "concepts" - each concept is a themed bundle of ${PRODUCTS_PER_BUNDLE} products with a punny title.

Requirements:
1. Each concept must have a punny, memorable title that makes people laugh
2. Write a witty one-liner tagline (max 20 words)
3. Explain why this bundle is perfect for the recipient (2-3 sentences)
4. Provide ${PRODUCTS_PER_BUNDLE} specific product search queries for finding items on Amazon/Etsy (we'll use these to find the best ${PRODUCTS_PER_BUNDLE} products)

IMPORTANT:
- Product queries should be specific enough to find real products (e.g., "funny cat coffee mug ceramic" not just "cat thing")
- Mix practical items with novelty/humorous items
- Ensure products fit together thematically
- Keep the overall bundle within the specified price range
- Make it actually funny - this is crucial! People should laugh and want to share it.

Return JSON in this EXACT format:
{
  "giftConcepts": [
    {
      "title": "The Purrfect Brew Kit",
      "tagline": "For the colleague who runs on coffee and cat memes",
      "description": "This bundle combines their two greatest loves into one hilarious package...",
      "productSearchQueries": [
        "funny cat coffee mug ceramic",
        "cat butt coasters set",
        "coffee beans gourmet sampler"
      ]
    }
  ]
}`;
}

function buildUserPrompt(request: GiftConceptRequest): string {
  return `Create funny gift concepts for this person:

RECIPIENT: ${request.recipientDescription}
${request.occasion ? `OCCASION: ${request.occasion}` : ''}
HUMOR STYLE: ${request.humorStyle}

Generate ${GIFT_CONCEPTS_COUNT} creative gift bundles. Make them genuinely funny and shareable!`;
}

// Streaming version for real-time UI updates
export async function streamGiftConcepts(
  request: GiftConceptRequest
): Promise<ReadableStream> {
  const systemPrompt = buildSystemPrompt(request.humorStyle);
  const userPrompt = buildUserPrompt(request);

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
    response_format: { type: 'json_object' },
    stream: true,
  });

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// Select unique, high-quality products for a gift concept using LLM
export async function selectBestProducts(
  conceptTitle: string,
  conceptDescription: string,
  products: Product[],
  targetCount: number = PRODUCTS_PER_BUNDLE
): Promise<Product[]> {
  console.log(`🤖 selectBestProducts called: ${products.length} products, target ${targetCount}`);

  // If we have fewer products than target, return all
  if (products.length <= targetCount) {
    console.log(`📌 Returning all ${products.length} products (less than target)`);
    return products;
  }

  // PRE-FILTER: Reduce product set before LLM processing for speed
  let filteredProducts = products;

  // 1. Basic title deduplication - remove very similar titles
  const seen = new Map<string, Product>();
  filteredProducts = filteredProducts.filter(p => {
    // Use first 40 chars of normalized title as dedup key
    const key = p.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 40);
    if (seen.has(key)) {
      return false;
    }
    seen.set(key, p);
    return true;
  });
  console.log(`🔍 After title dedup: ${filteredProducts.length} products`);

  // 2. Limit to MAX_PRODUCTS_BEFORE_LLM to reduce LLM processing time
  if (filteredProducts.length > MAX_PRODUCTS_BEFORE_LLM) {
    // Prioritize products with valid prices, then shuffle the rest
    const withPrice = filteredProducts.filter(p => p.price > 0).sort((a, b) => b.price - a.price);
    const withoutPrice = filteredProducts.filter(p => p.price <= 0);
    filteredProducts = [...withPrice, ...withoutPrice].slice(0, MAX_PRODUCTS_BEFORE_LLM);
    console.log(`🔍 Limited to top ${MAX_PRODUCTS_BEFORE_LLM} products for LLM (${withPrice.length} with prices)`);
  }

  // If we're now under target, just return what we have
  if (filteredProducts.length <= targetCount) {
    console.log(`📌 After pre-filtering: ${filteredProducts.length} products (returning all)`);
    return filteredProducts;
  }

  try {
    const productSummaries = filteredProducts.map((p, idx) => ({
      index: idx,
      title: p.title,
      price: p.price,
      source: p.source,
    }));

    const prompt = `You are selecting products for a gift bundle called "${conceptTitle}".

Description: ${conceptDescription}

Available products (${filteredProducts.length} total):
${JSON.stringify(productSummaries, null, 2)}

Task: Select exactly ${targetCount} products that are:
1. UNIQUE (no duplicates or very similar items)
   - AVOID product variants (e.g., don't select both "iPhone 11 case" AND "iPhone 12 case" with same design)
   - AVOID size/format variants (e.g., don't select both "pint glass" AND "beer can" with same design/text)
   - If products share the same core design/joke/theme, pick only ONE
2. RELEVANT to the gift concept
3. DIVERSE (different types of items, not all the same thing)
   - Mix product categories (e.g., book + drinkware + accessory + clothing)
   - Avoid selecting multiple items from the same category
4. WELL-PRICED (prefer items with valid prices > $0)

CRITICAL: Look at product titles carefully. Products like "Funny Cat Pun iPhone 11" and "Funny Cat Pun iPhone 12" are VARIANTS - only pick one!

Return ONLY a JSON object with an "indices" array, like: {"indices": [0, 3, 7, 12]}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using mini for speed
      messages: [
        {
          role: 'system',
          content: 'You are a product curation expert. Always respond with valid JSON only.'
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      // Fallback: return first N filtered products
      return filteredProducts.slice(0, targetCount);
    }

    const parsed = JSON.parse(content);
    const selectedIndices = parsed.indices || parsed.selected || [];

    // Validate indices and return selected products
    const selectedProducts = selectedIndices
      .filter((idx: number) => idx >= 0 && idx < filteredProducts.length)
      .slice(0, targetCount)
      .map((idx: number) => filteredProducts[idx]);

    // If we got fewer than target, fill with remaining products
    if (selectedProducts.length < targetCount) {
      const usedIndices = new Set(selectedIndices);
      const remaining = filteredProducts
        .map((p, idx) => ({ product: p, index: idx }))
        .filter(({ index }) => !usedIndices.has(index))
        .slice(0, targetCount - selectedProducts.length)
        .map(({ product }) => product);
      selectedProducts.push(...remaining);
    }

    const finalProducts = selectedProducts.slice(0, targetCount);
    console.log(`✅ LLM selected ${finalProducts.length} products`);
    return finalProducts;
  } catch (error) {
    console.error('❌ Error selecting products with LLM:', error);
    // Fallback: return pre-filtered products (already deduplicated)
    const fallbackProducts = filteredProducts.slice(0, targetCount);
    console.log(`🔄 Fallback: returning ${fallbackProducts.length} pre-filtered products`);
    return fallbackProducts;
  }
}

// Helper to pre-filter products (extracted for reuse)
function preFilterProducts(products: Product[], maxCount: number = MAX_PRODUCTS_BEFORE_LLM): Product[] {
  let filtered = products;

  // 1. Basic title deduplication
  const seen = new Map<string, Product>();
  filtered = filtered.filter(p => {
    const key = p.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.set(key, p);
    return true;
  });

  // 2. Limit to max count, prioritizing products with prices
  if (filtered.length > maxCount) {
    const withPrice = filtered.filter(p => p.price > 0).sort((a, b) => b.price - a.price);
    const withoutPrice = filtered.filter(p => p.price <= 0);
    filtered = [...withPrice, ...withoutPrice].slice(0, maxCount);
  }

  return filtered;
}

// Batched version - select products for multiple concepts in one LLM call
export async function selectBestProductsBatch(
  conceptsWithProducts: Array<{
    title: string;
    description: string;
    products: Product[];
  }>,
  targetCount: number = PRODUCTS_PER_BUNDLE
): Promise<Product[][]> {
  console.log(`🤖 selectBestProductsBatch called: ${conceptsWithProducts.length} concepts`);

  // Pre-filter products for each concept
  const preFiltered = conceptsWithProducts.map((concept, idx) => {
    const filtered = preFilterProducts(concept.products);
    console.log(`🔍 Concept ${idx + 1} "${concept.title}": ${concept.products.length} → ${filtered.length} products after pre-filter`);
    return {
      ...concept,
      products: filtered
    };
  });

  try {
    // Build prompt with all concepts and their products
    const conceptPrompts = preFiltered.map((concept, idx) => {
      const productSummaries = concept.products.map((p, pIdx) => ({
        index: pIdx,
        title: p.title,
        price: p.price,
        source: p.source,
      }));

      return `CONCEPT ${idx + 1}: "${concept.title}"
Description: ${concept.description}
Available products (${concept.products.length} total):
${JSON.stringify(productSummaries, null, 2)}`;
    }).join('\n\n---\n\n');

    const prompt = `You are selecting products for ${conceptsWithProducts.length} different gift bundles.

${conceptPrompts}

Task: For EACH concept, select exactly ${targetCount} products that are:
1. UNIQUE (no duplicates or very similar items within that concept)
2. RELEVANT to that specific gift concept
3. DIVERSE (different types of items, not all the same thing)
4. WELL-PRICED (prefer items with valid prices > $0 when available)

Return a JSON object with selections for each concept:
{
  "selections": [
    {"conceptIndex": 0, "indices": [2, 5, 8, 11]},
    {"conceptIndex": 1, "indices": [0, 3, 7, 9]},
    {"conceptIndex": 2, "indices": [1, 4, 6, 10]}
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a product curation expert. Always respond with valid JSON only.'
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      console.log('⚠️ No LLM response, using fallback');
      return preFiltered.map(c => c.products.slice(0, targetCount));
    }

    const parsed = JSON.parse(content);
    const selections = parsed.selections || [];

    // Map selections back to products
    const results: Product[][] = preFiltered.map((concept, conceptIdx) => {
      const selection = selections.find((s: { conceptIndex: number }) => s.conceptIndex === conceptIdx);

      if (!selection || !selection.indices) {
        // Fallback to first N products
        return concept.products.slice(0, targetCount);
      }

      const selectedProducts = selection.indices
        .filter((idx: number) => idx >= 0 && idx < concept.products.length)
        .slice(0, targetCount)
        .map((idx: number) => concept.products[idx]);

      // Fill if we got fewer than target
      if (selectedProducts.length < targetCount) {
        const usedIndices = new Set(selection.indices);
        const remaining = concept.products
          .filter((_, idx) => !usedIndices.has(idx))
          .slice(0, targetCount - selectedProducts.length);
        selectedProducts.push(...remaining);
      }

      return selectedProducts.slice(0, targetCount);
    });

    console.log(`✅ Batched LLM selected products for ${results.length} concepts`);
    return results;

  } catch (error) {
    console.error('❌ Error in batched product selection:', error);
    // Fallback: return pre-filtered products for each concept
    return preFiltered.map(c => c.products.slice(0, targetCount));
  }
}
