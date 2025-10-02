# goose.gifts 🎁

An AI-powered gag gift finder that generates funny, pun-driven gift ideas by combining AI humor generation with real-time affiliate marketplace searches.

## Overview

goose.gifts helps users discover the perfect funny gift by understanding the recipient and occasion, then curating themed product bundles from Amazon and Etsy with punny titles and witty descriptions.

## How It Works

1. **User Input**: Describe the recipient and occasion (e.g., "My coworker is leaving for a new job, he loves cats and beer")
2. **Customize**: Select humor style (dad joke, office-safe, edgy, PG) and budget range
3. **AI Generation**: System creates 2–4 gift concepts with punny titles and one-liners
4. **Product Sourcing**: Real-time search across Amazon and Etsy for relevant products
5. **Bundling**: Each concept includes 2–4 curated products with images, prices, and affiliate links
6. **Share**: Get a permalink to share your funny gift ideas

## Key Features

### Core Functionality
- **Humor Generation**: AI-powered punny names, witty taglines, and themed gift concepts
- **Smart Product Sourcing**: Automated search and ranking by humor relevance, ratings, and budget fit
- **Gift Bundling**: Curated collections (e.g., "The Meow-tini Kit: Cat mug + Beer opener + Funny socks")
- **Affiliate Integration**: Amazon Associate tags and Etsy/Awin deeplinks for commission revenue

### User Experience
- **Shareable Links**: Permalink pages for each gift idea set
- **Multiple Humor Styles**: Dad jokes, office-safe, edgy, or PG humor modes
- **Budget Control**: Filter products by price range
- **Compliance**: Clear affiliate disclosures and dynamic pricing from APIs

## Business Model

- **Revenue**: Affiliate commissions from Amazon and Etsy purchases
- **Growth**: Viral sharing of funny, unique gift bundles
- **SEO**: Optimized pages for popular occasions ("Funny Secret Santa gifts," "Divorce party gag gifts")

## MVP Status ✅

**All MVP features are complete and ready to deploy!**

- ✅ Landing page with recipient/occasion input form
- ✅ AI-powered generation of 2–4 gift ideas per search
- ✅ Real-time product sourcing from Amazon and Etsy APIs
- ✅ Humor style selector (dad joke, office-safe, edgy, PG)
- ✅ Budget range filtering
- ✅ Product display with images, prices, and affiliate links
- ✅ Shareable permalink pages
- ✅ Affiliate disclosure and compliance

## Technology Stack

### Frontend & Backend
- **Next.js 15** - App Router, React Server Components, Turbopack
- **React 19** - Modern React with full TypeScript
- **Tailwind CSS** - Utility-first styling
- **Vercel Postgres** - Serverless PostgreSQL database

### APIs & Integrations
- **OpenAI GPT-4** - AI humor generation and gift concepts
- **Amazon Product Advertising API 5.0** - Product search and affiliate links
- **Etsy API v3** - Handmade/quirky product search
- **Awin** - Etsy affiliate link generation

### Key Features
- Server-side rendering for SEO
- Real-time product data (no stale prices)
- Parallel API requests for speed
- Comprehensive error handling
- Full TypeScript type safety
- Mobile-responsive design

### Compliance
- ✅ Dynamic pricing only (no cached prices)
- ✅ Affiliate disclaimers on all pages
- ✅ Content moderation built-in
- ✅ All API terms of service followed

## Future Extensions

- **User Accounts**: Save favorites and search history
- **Print-on-Demand**: Custom gag products (mugs, shirts, cards)
- **Expanded Affiliates**: Walmart, Target, and other marketplaces
- **Social Sharing**: Custom OG images with gift titles
- **Advanced Features**: Gift occasion calendar, trending gifts, user ratings

## Getting Started

### Quick Start (5 minutes)

1. **Install dependencies**:
```bash
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
# Add your API keys to .env
```

3. **Run development server**:
```bash
npm run dev
```

4. **Open in browser**:
```
http://localhost:3000
```

### Required API Keys

- **OpenAI API Key** - Get at https://platform.openai.com/api-keys
- **Amazon PA-API** - Sign up at https://affiliate-program.amazon.com/
- **Etsy API Key** - Get at https://www.etsy.com/developers
- **Awin Account** - Join at https://www.awin.com/

📖 **Full setup guide**: See `QUICKSTART.md` for detailed instructions

## Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get up and running in 5 minutes
- **[SETUP.md](./SETUP.md)** - Comprehensive setup guide with all API details
- **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)** - Complete project overview and roadmap
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development guide and best practices
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions

## Project Stats

- **1,441 lines** of production-ready TypeScript/React code
- **8 core modules** (AI, Amazon, Etsy, Database, UI components)
- **4 comprehensive guides** (Setup, Quickstart, Contributing, Troubleshooting)
- **100% TypeScript** for type safety
- **Mobile-first** responsive design
- **SEO-optimized** from day one

## What's Included

✅ Complete frontend with beautiful UI
✅ AI-powered gift concept generation
✅ Real-time product search (Amazon + Etsy)
✅ Affiliate link integration
✅ Database with permalinks
✅ Error handling & validation
✅ Mobile responsive design
✅ SEO & metadata
✅ Compliance & disclosures
✅ Production-ready deployment config

## Deployment

Deploy to Vercel in one click:

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repo to Vercel dashboard for automatic deployments.

📖 See `SETUP.md` for detailed deployment instructions

## License

MIT License - feel free to use this for your own projects!

---

**Affiliate Disclosure**: goose.gifts participates in affiliate programs including Amazon Associates and Awin. We earn commissions from qualifying purchases made through our links at no additional cost to you.
