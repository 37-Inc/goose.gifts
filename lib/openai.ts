import OpenAI from 'openai';
import type { HumorStyle } from './types';

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
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9, // Higher temperature for creative humor
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

Your task is to generate 3-4 creative gift "concepts" - each concept is a themed bundle of 2-4 products with a punny title.

Requirements:
1. Each concept must have a punny, memorable title that makes people laugh
2. Write a witty one-liner tagline (max 20 words)
3. Explain why this bundle is perfect for the recipient (2-3 sentences)
4. Provide 2-4 specific product search queries for finding items on Amazon/Etsy

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
BUDGET: $${request.minPrice} - $${request.maxPrice} per bundle
HUMOR STYLE: ${request.humorStyle}

Generate 3-4 creative gift bundles. Make them genuinely funny and shareable!`;
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
