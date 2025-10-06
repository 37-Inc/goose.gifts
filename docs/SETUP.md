# goose.gifts Setup Guide

Welcome! This guide will help you get your AI-powered funny gift finder up and running.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- API keys for OpenAI, Amazon Product Advertising, Etsy, and Awin
- A Vercel account (for deployment and database)

## Step 1: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Next.js 15 with React 19
- OpenAI SDK
- Amazon Product Advertising API client
- Database tools (Vercel Postgres)
- TypeScript and tooling

## Step 2: Set Up Environment Variables

1. Copy the example env file:
```bash
cp .env.example .env
```

2. Fill in your API credentials in `.env`:

### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Add to `.env`:
```
OPENAI_API_KEY=sk-...
```

### Amazon Product Advertising API
1. Sign up for Amazon Associates: https://affiliate-program.amazon.com/
2. Register for PA-API: https://webservices.amazon.com/paapi5/documentation/
3. Wait 48 hours for keys to activate
4. Add to `.env`:
```
AWS_ACCESS_KEY=AKIA...
AWS_SECRET_KEY=...
AWS_PARTNER_TAG=yourtag-20
```

### Etsy API
1. Create an Etsy developer account: https://www.etsy.com/developers
2. Create an app to get API key
3. Add to `.env`:
```
ETSY_API_KEY=...
```

### Awin Affiliate (for Etsy affiliate links)
1. Join Awin network: https://www.awin.com/
2. Apply to Etsy affiliate program (Advertiser ID 6220 for US)
3. Generate OAuth token: https://ui.awin.com/awin-api
4. Add to `.env`:
```
AWIN_PUBLISHER_ID=...
AWIN_API_TOKEN=...
AWIN_ADVERTISER_ID=6220
```

### Database (Vercel Postgres)
1. Create a Vercel account: https://vercel.com
2. Create a new project and link to your repo
3. Add Postgres database in Vercel dashboard
4. Copy connection strings to `.env`:
```
POSTGRES_URL=postgres://...
POSTGRES_PRISMA_URL=postgres://...
POSTGRES_URL_NON_POOLING=postgres://...
```

Alternatively, for local development, you can use any PostgreSQL database.

### Base URL
```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

For production, update this to your actual domain (e.g., `https://goose.gifts`)

## Step 3: Initialize the Database

The database will auto-create tables on first use. To manually initialize:

```bash
npm run db:init
```

Or add this script to `package.json`:
```json
{
  "scripts": {
    "db:init": "node -e \"require('./lib/db').initializeDatabase()\""
  }
}
```

## Step 4: Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000 to see your app!

## Step 5: Test the Flow

1. Fill out the gift request form with:
   - Recipient description (be detailed!)
   - Optional occasion
   - Humor style
   - Budget range

2. Click "Find Funny Gifts"

3. Wait 20-30 seconds while:
   - AI generates gift concepts
   - Products are searched on Amazon & Etsy
   - Affiliate links are generated
   - Results are saved to database

4. View your hilarious gift bundles!

5. Copy the permalink to share

## Common Issues

### Amazon API "TooManyRequests" Error
- You've hit rate limits (1 req/sec for new accounts)
- Solution: The app has retry logic built in, but if persistent, wait a few minutes

### Amazon API "InvalidCredentials" Error
- Your API keys haven't been activated yet (takes 48 hours)
- Or credentials don't match (Access Key, Secret Key, and Partner Tag must be from same account)

### Etsy API Rate Limit
- Limit is 10 requests/second
- Solution: The app batches requests properly, but if searching many categories, you may hit this

### Awin Link Generation Fails
- Check your OAuth token is valid
- Ensure you're approved for Etsy affiliate program
- Links will fall back to direct Etsy URLs if Awin fails

### Database Connection Error
- Verify your Postgres connection strings are correct
- For Vercel Postgres, ensure you're using the correct environment variables

### No Products Found
- Try broader search terms in recipient description
- Adjust budget range (very narrow ranges may not find products)
- Check that your Amazon/Etsy API keys are working

## Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub

2. Import project in Vercel dashboard

3. Add all environment variables in Vercel project settings

4. Deploy!

5. Update `NEXT_PUBLIC_BASE_URL` to your production domain

### Deploy Elsewhere

The app is a standard Next.js app and can be deployed to:
- Railway
- Netlify
- AWS Amplify
- Self-hosted with Docker

Just ensure you have a Postgres database and all env variables configured.

## Production Considerations

### API Costs
- **OpenAI**: ~$0.01-0.03 per gift generation (GPT-4)
- **Amazon PA-API**: Free (but need to generate sales)
- **Etsy API**: Free (10k requests/day)
- **Awin**: Free

### Scaling
- Amazon PA-API rate limits scale with your affiliate revenue
- Consider caching popular gift ideas
- Add Redis for session management if needed

### Monitoring
- Set up Vercel Analytics
- Monitor API error rates
- Track conversion rates (clicks → purchases)

### Compliance
- Affiliate disclosures are built into the footer
- Ensure disclaimers are visible on all pages
- Follow FTC guidelines for affiliate marketing

## Development Tips

### Testing AI Prompts
Edit `lib/openai.ts` to tweak the system prompts for better humor generation.

### Adding More Product Sources
Create new files like `lib/walmart.ts` following the same pattern as Amazon/Etsy integrations.

### Customizing Humor Styles
Add more styles in `lib/types.ts` and update the system prompts accordingly.

### Improving Product Matching
Adjust scoring algorithms in `lib/amazon.ts` and `lib/etsy.ts` to better rank products.

## Support

If you run into issues:
1. Check the console for error messages
2. Verify all API keys are correct and active
3. Review the API documentation for each service
4. Check that your Amazon Associate account has qualifying sales (for ongoing API access)

## Next Steps

Once your MVP is running:
- [ ] Add user authentication (NextAuth.js)
- [ ] Implement favorites/saved searches
- [ ] Add social sharing images (og:image)
- [ ] Set up analytics (Posthog, Google Analytics)
- [ ] Create SEO-optimized landing pages for popular occasions
- [ ] Add more affiliate integrations (Walmart, Target, etc.)
- [ ] Implement print-on-demand for custom gag products

Have fun building and growing goose.gifts! 🎁
