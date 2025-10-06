import OpenAI from 'openai';
import type { GiftIdea } from './types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export interface SEOContent {
  title: string; // 60 chars max
  description: string; // 155 chars max
  keywords: string; // comma-separated
  content: string; // 400-500 words
  faq: Array<{ question: string; answer: string }>; // 4 Q&A pairs
}

/**
 * Generate comprehensive SEO content for a gift bundle
 * Uses GPT-4o-mini for cost-effectiveness (~$0.00015 per bundle)
 */
export async function generateSEOContent(
  recipientDescription: string,
  occasion: string | undefined,
  giftIdeas: GiftIdea[]
): Promise<SEOContent> {
  const startTime = Date.now();
  console.log('📝 Generating SEO content...');

  // Combine all bundle titles and descriptions for context
  const bundleContext = giftIdeas
    .map(idea => `- ${idea.title}: ${idea.description}`)
    .join('\n');

  const prompt = `You are an SEO expert writing content for a gift recommendation page.

RECIPIENT: ${recipientDescription}
${occasion ? `OCCASION: ${occasion}` : ''}

GIFT BUNDLES ON THIS PAGE:
${bundleContext}

Generate SEO-optimized content with the following structure:

1. **Meta Title** (60 chars max): Catchy, includes main keywords
2. **Meta Description** (155 chars max): Compelling, includes call-to-action
3. **Keywords** (comma-separated): 5-8 relevant SEO keywords
4. **Long-form Content** (250-300 words):
   - Why these bundles are perfect for this person
   - Target long-tail keywords naturally (e.g., "funny gifts for bald dad who loves muffins")
   - Include product benefits and humor style
   - Make it engaging and shareable
   - Write in second person ("you'll love", "perfect for your")
5. **FAQ Section** (4 Q&A pairs):
   - "Who is this gift for?"
   - "What's included in these bundles?"
   - "How much do these gifts cost?"
   - "Can I buy items separately?"

IMPORTANT:
- Use natural language, avoid keyword stuffing
- Write for humans first, search engines second
- Be specific and authentic
- Match the humor style of the bundles

Return JSON in this EXACT format:
{
  "title": "...",
  "description": "...",
  "keywords": "keyword1, keyword2, keyword3",
  "content": "...",
  "faq": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SEO copywriter. Always respond with valid JSON only. Be concise.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5, // Lower temp = faster, more focused
      max_completion_tokens: 1000, // Limit output length
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ SEO content generated in ${duration}s`);

    // Validate and return
    return {
      title: parsed.title?.slice(0, 60) || 'Unique Gift Bundles',
      description: parsed.description?.slice(0, 160) || 'Discover perfect gift ideas',
      keywords: parsed.keywords || '',
      content: parsed.content || '',
      faq: Array.isArray(parsed.faq) && parsed.faq.length === 4
        ? parsed.faq
        : [
            { question: 'Who is this gift for?', answer: recipientDescription },
            { question: "What's included?", answer: 'Curated product bundles' },
            { question: 'How much does it cost?', answer: 'Varies by bundle' },
            { question: 'Can I buy items separately?', answer: 'Yes, each product links to Amazon' },
          ],
    };
  } catch (error) {
    console.error('SEO content generation error:', error);

    // Fallback content
    const occasionText = occasion ? ` for ${occasion}` : '';
    return {
      title: `Gift Ideas for ${recipientDescription.slice(0, 35)}${occasionText}`,
      description: `Discover ${giftIdeas.length} hilarious gift bundles perfect for ${recipientDescription.slice(0, 80)}. AI-curated with Amazon products.`,
      keywords: `gifts, ${recipientDescription.split(' ').slice(0, 3).join(', ')}${occasion ? `, ${occasion}` : ''}`,
      content: `Looking for the perfect gift for ${recipientDescription}? We've curated ${giftIdeas.length} unique gift bundles that combine humor and practicality. Each bundle includes carefully selected products from Amazon, creating a memorable gift experience. Whether you're shopping for a birthday, holiday, or just because, these gift ideas are designed to make your recipient laugh and feel appreciated.`,
      faq: [
        { question: 'Who is this gift for?', answer: recipientDescription },
        { question: "What's included in these bundles?", answer: `${giftIdeas.length} themed gift bundles with curated Amazon products` },
        { question: 'How much do these gifts cost?', answer: 'Prices vary by bundle, with options for every budget' },
        { question: 'Can I buy items separately?', answer: 'Yes, each product links directly to Amazon for individual purchase' },
      ],
    };
  }
}
