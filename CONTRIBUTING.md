# Contributing to goose.gifts

## Development Workflow

### Running Locally

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production build locally
npm start
```

### Code Style

- TypeScript everywhere
- Functional components with hooks
- Server Components by default (use 'use client' only when needed)
- Tailwind CSS for styling
- Follow existing naming conventions

### Adding New Features

#### Adding a New Product Source

1. Create `lib/new-source.ts`:
```typescript
import type { Product } from './types';

export async function searchNewSource(
  keywords: string,
  minPrice: number,
  maxPrice: number
): Promise<Product[]> {
  // Implementation
}
```

2. Update `app/api/generate-gift/route.ts` to include the new source

3. Update types if needed in `lib/types.ts`

#### Adding New Humor Styles

1. Update `lib/types.ts`:
```typescript
export const HumorStyle = z.enum(['dad-joke', 'office-safe', 'edgy', 'pg', 'new-style']);
```

2. Update `lib/openai.ts` system prompts with new style guide

3. Update `components/GiftRequestForm.tsx` to include new option

#### Adding Database Models

1. Update `lib/db.ts` with new table schema

2. Create migration script if needed

3. Update types in `lib/types.ts`

## Testing

### Manual Testing Checklist

- [ ] Form validation works (min 10 chars, valid prices)
- [ ] AI generates appropriate concepts for each humor style
- [ ] Products are found and displayed
- [ ] Affiliate links are correctly formatted
- [ ] Permalink saves and loads correctly
- [ ] Share link copies to clipboard
- [ ] Mobile responsive
- [ ] Error handling works (try with invalid API keys)

### Test Cases

**Test 1: Basic Flow**
- Input: "My friend loves coffee and cats"
- Expected: 3-4 gift concepts with coffee/cat themed products

**Test 2: Budget Constraints**
- Input: Budget $10-$20
- Expected: All product bundles under $20 total

**Test 3: Humor Styles**
- Try each humor style
- Expected: Tone matches selected style

**Test 4: Permalink**
- Generate gifts, copy link
- Open link in new tab
- Expected: Same results, view count incremented

## Performance Optimization

### Current Performance
- Average generation time: 20-30 seconds
- Bottleneck: API calls (unavoidable for real-time data)

### Potential Optimizations
1. **Caching**: Cache popular search terms
2. **Parallel Processing**: Already implemented
3. **Rate Limiting**: Add Redis for distributed rate limiting
4. **Product Pre-fetching**: Pre-load trending products

## API Rate Limits

### Current Limits
- OpenAI: Depends on your tier (usually 10k RPM)
- Amazon PA-API: 1 req/sec initially, scales with revenue
- Etsy: 10 req/sec, 10k req/day
- Awin: 20 req/min

### Handling Rate Limits
All APIs have retry logic with exponential backoff built in.

## Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Environment Variables Checklist
- [ ] OPENAI_API_KEY
- [ ] AWS_ACCESS_KEY
- [ ] AWS_SECRET_KEY
- [ ] AWS_PARTNER_TAG
- [ ] ETSY_API_KEY
- [ ] AWIN_PUBLISHER_ID
- [ ] AWIN_API_TOKEN
- [ ] POSTGRES_URL
- [ ] NEXT_PUBLIC_BASE_URL

## Monitoring

### What to Monitor
- API error rates (OpenAI, Amazon, Etsy, Awin)
- Database connection health
- Average response times
- User conversion rate (views → clicks → purchases)

### Vercel Analytics
Free tier includes:
- Page views
- Unique visitors
- Core Web Vitals
- Serverless function metrics

### Recommended Tools
- **Posthog**: Product analytics (generous free tier)
- **Sentry**: Error tracking
- **LogRocket**: Session replay (for debugging UX issues)

## SEO Optimization

### Current SEO Features
- ✅ Server-side rendering
- ✅ Dynamic metadata for permalink pages
- ✅ Semantic HTML
- ✅ Mobile responsive

### Future SEO Enhancements
- [ ] Sitemap generation
- [ ] Landing pages for popular occasions
- [ ] Blog content (funny gift guides)
- [ ] Schema.org markup for products
- [ ] Social sharing cards (custom OG images)

## Growth Tactics

### Viral Strategies
1. **Social Sharing**: Add Twitter/Reddit share buttons
2. **Funny Examples**: Create and share hilarious gift ideas
3. **Influencer Outreach**: Send free gift ideas to YouTubers
4. **Reddit Marketing**: Share in r/funny, r/gifts, etc.

### SEO Content Ideas
- "Funny gifts for [occasion]" landing pages
- "Best gag gifts under $[price]" guides
- Gift ideas by personality type
- Trending funny products

### Affiliate Revenue Optimization
- Track which products convert best
- Promote higher-commission products
- Add seasonal gift guides
- Email marketing (collect emails, send weekly funny gifts)

## Code Review Checklist

Before committing:
- [ ] Code follows TypeScript best practices
- [ ] No console.logs in production code
- [ ] Error handling for all async operations
- [ ] Types are properly defined
- [ ] Components are reasonably sized (<200 lines)
- [ ] No hardcoded secrets (use .env)
- [ ] Comments for complex logic
- [ ] Mobile tested

## Future Feature Ideas

### User Accounts
- Save favorite gift ideas
- Track shared links
- Purchase history

### Social Features
- Vote on funniest gift ideas
- Comment on permalinks
- Share to social media with custom images

### AI Enhancements
- Learn from user feedback (upvote/downvote concepts)
- Personalized humor styles based on past searches
- Multi-language support

### Monetization
- Premium humor styles (celebrity impressions, etc.)
- Sponsored products
- Print-on-demand custom gag products
- Affiliate partnerships beyond Amazon/Etsy

### Analytics Dashboard
- Track trending occasions
- Most viewed gift ideas
- Revenue by product source
- User demographics

## Troubleshooting

### Common Development Issues

**Module not found errors**
```bash
rm -rf node_modules package-lock.json
npm install
```

**TypeScript errors after updates**
```bash
rm -rf .next
npm run dev
```

**Database connection issues**
- Check Vercel dashboard for connection strings
- Verify .env variables are loaded
- Try restarting dev server

**API timeout errors**
- Normal for first request (cold start)
- Increase timeout in route.ts if needed
- Check API key validity

## Resources

- [Next.js Docs](https://nextjs.org/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Amazon PA-API Docs](https://webservices.amazon.com/paapi5/documentation/)
- [Etsy API Docs](https://www.etsy.com/developers/documentation)
- [Awin API Docs](https://wiki.awin.com/index.php/API)
- [Vercel Postgres Docs](https://vercel.com/docs/storage/vercel-postgres)

## Questions?

Open an issue or check the existing documentation:
- `README.md` - Project overview
- `QUICKSTART.md` - Get started fast
- `SETUP.md` - Detailed setup guide
- `CONTRIBUTING.md` - This file!

Happy coding! 🎁
