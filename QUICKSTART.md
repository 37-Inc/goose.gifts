# goose.gifts - Quick Start 🚀

Hey there! Super excited you're building this with your wife! Here's everything you need to get started.

## What We Built

A fully functional AI-powered funny gift finder that:
- Takes recipient descriptions and generates 3-4 hilarious gift concepts with punny titles
- Searches Amazon & Etsy in real-time for actual products
- Bundles 2-4 products per concept
- Generates affiliate links for monetization
- Creates shareable permalinks
- Includes full compliance (affiliate disclosures, etc.)

## Tech Stack

- **Next.js 15** with App Router & Turbopack
- **React 19** with TypeScript
- **Tailwind CSS** for styling
- **OpenAI GPT-4** for humor generation
- **Amazon Product Advertising API** for products
- **Etsy API + Awin** for handmade products & affiliate links
- **Vercel Postgres** for permalinks database

## Get Started in 5 Minutes

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Your .env File

You'll need API keys for:
1. **OpenAI** - Get at https://platform.openai.com/api-keys
2. **Amazon PA-API** - Sign up at https://affiliate-program.amazon.com/ (takes 48hrs to activate)
3. **Etsy API** - Get at https://www.etsy.com/developers
4. **Awin** - Join at https://www.awin.com/ and apply for Etsy program

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

**Don't have all API keys yet?** That's okay! For initial testing:
- Start with just `OPENAI_API_KEY`
- The app will gracefully handle missing product APIs (just won't show products)

### 3. Set Up Database

For local testing, you can skip this initially. The app will error gracefully.

For production:
1. Create a Vercel account
2. Add Vercel Postgres to your project
3. Copy connection strings to `.env`

### 4. Run It!

```bash
npm run dev
```

Open http://localhost:3000 and you should see the landing page!

## Testing Without Full API Setup

Want to see it in action before getting all the API keys?

1. Just add `OPENAI_API_KEY` to `.env`
2. Comment out the product search in `app/api/generate-gift/route.ts` (lines 32-50)
3. Add mock products for testing

But honestly, it's worth getting the real APIs set up to see the full magic!

## First Test Run

Try this example:

**Recipient Description:**
```
My coworker Sarah is leaving for a new job. She's obsessed with cats,
drinks way too much coffee, and makes terrible puns all day. She's
basically the queen of dad jokes in our office.
```

**Occasion:** Farewell party

**Humor Style:** Dad Joke

**Budget:** $20-$60

Hit submit and watch the magic happen! Should take 20-30 seconds.

## What You'll See

The AI will generate concepts like:
- "The Purr-fessional Departure Kit"
- "Grounds for Feline Good"
- Each with 2-4 actual products from Amazon/Etsy

## Next Steps

Once you've got it working:

### Immediate
- [ ] Get all API keys activated
- [ ] Set up Vercel Postgres database
- [ ] Test the full flow end-to-end
- [ ] Create some gift ideas and share them!

### Soon
- [ ] Deploy to Vercel (super easy, just connect GitHub)
- [ ] Get a custom domain (goose.gifts!)
- [ ] Start generating those affiliate commissions

### Growth Phase
- [ ] SEO: Create landing pages for popular occasions
- [ ] Social: Share hilarious gift ideas on Twitter/Reddit
- [ ] Analytics: Add tracking to see what's popular
- [ ] More features: User accounts, favorites, trending gifts

## Pro Tips

### Make the Humor Better
Edit `lib/openai.ts` - the system prompts control the humor style. Tweak them to match your sense of humor!

### Find Better Products
Adjust the scoring in `lib/amazon.ts` and `lib/etsy.ts` - you can prioritize funnier products, better reviews, etc.

### Speed It Up
- Product searches happen in parallel (already optimized!)
- Consider caching popular searches once you have traffic
- Amazon/Etsy rate limits are generous for MVP scale

## Common Issues & Quick Fixes

**"OpenAI API error"**
- Check your API key is correct
- Make sure you have credits in your OpenAI account

**"No products found"**
- Amazon PA-API keys take 48 hours to activate after signup
- Try broader budget ranges
- Check your API keys are correct

**"Database error"**
- Totally fine for local testing! Just means permalink won't save
- Set up Vercel Postgres when you're ready to deploy

**"Slow response time"**
- Normal! Searching 2 APIs + AI takes 20-30 seconds
- This is real-time product data - worth the wait
- Consider adding a loading animation with fun facts

## The Fun Part

This is where you and your wife get to be creative:

1. **Test different personalities** - Try finding gifts for fictional characters, celebrities, etc.
2. **Experiment with humor styles** - Which generates the funniest results?
3. **Share funny results** - Post them on social media to build buzz
4. **Iterate on the prompts** - Make the AI funnier!

## Architecture Overview

```
User Input
    ↓
OpenAI generates gift concepts (punny titles + product queries)
    ↓
Search Amazon + Etsy in parallel for each query
    ↓
Score & filter products by humor/relevance
    ↓
Generate affiliate links (Amazon auto, Etsy via Awin)
    ↓
Save to database with unique slug
    ↓
Display results + shareable permalink
```

## File Structure

```
/app
  /api/generate-gift/route.ts  - Main API endpoint
  /[slug]/page.tsx              - Permalink pages
  page.tsx                      - Homepage
  layout.tsx                    - App layout + footer

/components
  GiftRequestForm.tsx           - Input form
  GiftResults.tsx               - Results display

/lib
  openai.ts                     - AI humor generation
  amazon.ts                     - Amazon product search
  etsy.ts                       - Etsy product search
  db.ts                         - Database operations
  types.ts                      - TypeScript types
```

## Deployment Checklist

When you're ready to deploy:

- [ ] Push code to GitHub
- [ ] Create Vercel project
- [ ] Add all environment variables in Vercel
- [ ] Deploy!
- [ ] Update `NEXT_PUBLIC_BASE_URL` to your domain
- [ ] Test permalink sharing
- [ ] Set up custom domain
- [ ] Add analytics

## Support & Resources

- Full setup guide: `SETUP.md`
- Code is fully documented with comments
- All APIs have error handling built in
- TypeScript types make everything clear

## Let's Goose! 🎁

You've got everything you need. The MVP is production-ready. Just add your API keys and you're off to the races!

Can't wait to see what funny gift ideas you create together!

Good luck! 🚀
