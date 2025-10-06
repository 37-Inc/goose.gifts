# Troubleshooting Guide

## Quick Diagnostics

Run this to check your setup:

```bash
# Check Node version (need 18+)
node --version

# Check if dependencies are installed
ls node_modules | wc -l  # Should show ~460+

# Check if .env exists
cat .env | grep -v "^#" | grep -v "^$"

# Try running dev server
npm run dev
```

## Common Issues

### 1. "Module not found" errors

**Symptom**: Import errors, can't find modules

**Solutions**:
```bash
# Clean install
rm -rf node_modules package-lock.json .next
npm install

# Make sure you're in the right directory
pwd  # Should end with /goose.gifts
```

### 2. OpenAI API errors

**Error**: "Invalid API key" or "Insufficient credits"

**Solutions**:
- Check `.env` has correct `OPENAI_API_KEY=sk-...`
- Verify key at https://platform.openai.com/api-keys
- Check you have credits: https://platform.openai.com/usage
- Make sure key starts with `sk-proj-` or `sk-`

**Error**: "Rate limit exceeded"

**Solutions**:
- You're on free tier with low limits
- Upgrade to paid tier
- Wait a minute and try again

### 3. Amazon PA-API errors

**Error**: "InvalidCredentials"

**Causes**:
- Keys not activated yet (takes 48 hours after signup)
- Mismatch between Access Key, Secret Key, and Partner Tag
- All three must be from same Associates account

**Solutions**:
```bash
# Verify in .env:
AWS_ACCESS_KEY=AKIA...  # Starts with AKIA
AWS_SECRET_KEY=...      # Long string
AWS_PARTNER_TAG=...     # Ends with -20
```

**Error**: "TooManyRequests"

**Cause**: Hit rate limit (1 req/sec initially)

**Solution**: App has retry logic, but if persistent:
```typescript
// In lib/amazon.ts, add delay between requests
await new Promise(resolve => setTimeout(resolve, 1100));
```

**Error**: "No matching version found"

**Cause**: Amazon hasn't approved your Associates account

**Solution**:
- Check Associates Central for approval status
- Need at least 3 qualifying sales within 180 days
- For testing, use mock data until approved

### 4. Etsy API errors

**Error**: "Invalid API key"

**Solution**:
- Check `.env` has `ETSY_API_KEY=...`
- Verify at https://www.etsy.com/developers/your-apps

**Error**: 429 Rate Limit

**Cause**: Hit 10 requests/second limit

**Solution**: App handles this, but if persistent:
```typescript
// In lib/etsy.ts, reduce parallel requests
const searchPromises = keywordStrategies.slice(0, 2)  // Reduce from 4 to 2
```

### 5. Awin errors

**Error**: "Unauthorized" or "Invalid token"

**Solutions**:
- Regenerate token at https://ui.awin.com/awin-api
- Format must be: `Bearer abc123...` (with "Bearer " prefix)
- Check `.env` has correct `AWIN_API_TOKEN=...`

**Error**: "Advertiser not approved"

**Cause**: You haven't been approved for Etsy program

**Solution**:
- Apply in Awin dashboard for Etsy (Advertiser 6220)
- Approval takes 2-3 business days
- Meanwhile, direct Etsy links will be used (no affiliate commission)

### 6. Database errors

**Error**: "Connection refused" or "ENOTFOUND"

**Cause**: Database not configured

**Solutions**:

For Vercel Postgres:
```bash
# Link your project
vercel link

# Pull environment variables
vercel env pull .env.local
```

For local Postgres:
```bash
# Install PostgreSQL
brew install postgresql  # macOS
# or
sudo apt-get install postgresql  # Linux

# Start database
brew services start postgresql

# Create database
createdb goose_gifts

# Update .env
POSTGRES_URL=postgresql://localhost:5432/goose_gifts
```

**Error**: "Table does not exist"

**Solution**:
```typescript
// Run database initialization
// In lib/db.ts, uncomment and run:
await initializeDatabase();
```

Or manually:
```sql
CREATE TABLE gift_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  recipient_description TEXT NOT NULL,
  occasion VARCHAR(255),
  humor_style VARCHAR(50) NOT NULL,
  min_price INTEGER NOT NULL,
  max_price INTEGER NOT NULL,
  gift_ideas JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  view_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_slug ON gift_ideas(slug);
CREATE INDEX idx_created_at ON gift_ideas(created_at DESC);
```

### 7. Build/TypeScript errors

**Error**: "Type 'X' is not assignable to type 'Y'"

**Solutions**:
```bash
# Clear Next.js cache
rm -rf .next

# Restart TypeScript server in your editor
# VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"

# Check tsconfig.json is correct
cat tsconfig.json
```

**Error**: "Cannot find module '@/...'"

**Solution**:
```json
// Verify tsconfig.json has:
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### 8. Slow response times

**Expected**: 20-30 seconds for gift generation

**If longer than 60 seconds**:

Check:
```bash
# Network connectivity
ping api.openai.com
ping webservices.amazon.com

# API timeouts in route.ts
export const maxDuration = 60;  # Increase if needed
```

Optimize:
```typescript
// Reduce number of product queries
const requestParameters = {
  ItemCount: 5,  // Reduce from 10
};

// Reduce number of categories searched
const categories = ['All', 'ToysAndGames'];  // Instead of 5
```

### 9. Mobile display issues

**Symptoms**: Layout broken on phone

**Solutions**:
```bash
# Test responsive design
npm run dev
# Open http://localhost:3000 in Chrome
# Press F12 → Toggle device toolbar
# Test iPhone, iPad, etc.
```

Check:
- Tailwind classes have responsive prefixes (`sm:`, `md:`, `lg:`)
- Images have proper sizing
- Forms are touch-friendly

### 10. Environment variable issues

**Error**: "process.env.X is undefined"

**Solutions**:

Client-side variables must have `NEXT_PUBLIC_` prefix:
```bash
# ❌ Wrong (server-side only)
BASE_URL=http://localhost:3000

# ✅ Correct (available client-side)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Restart dev server after changing .env:
```bash
# Ctrl+C to stop
npm run dev
```

For Vercel deployment:
- Add all env vars in Vercel dashboard
- Project Settings → Environment Variables
- Redeploy after adding

## Debugging Tips

### Enable verbose logging

Add to any file:
```typescript
console.log('Debug:', { variable, anotherVariable });
```

### Check API responses

```typescript
// In app/api/generate-gift/route.ts
console.log('OpenAI response:', concepts);
console.log('Amazon products:', amazonProducts);
console.log('Etsy products:', etsyProducts);
```

### Test individual components

```bash
# Test OpenAI alone
node -e "require('./lib/openai').generateGiftConcepts({
  recipientDescription: 'test',
  humorStyle: 'dad-joke',
  minPrice: 10,
  maxPrice: 50
}).then(console.log)"

# Test Amazon search
node -e "require('./lib/amazon').searchAmazonProducts({
  keywords: 'funny mug',
  minPrice: 10,
  maxPrice: 20
}).then(console.log)"
```

### Check browser console

Open DevTools (F12) and check:
- Console tab for errors
- Network tab for failed requests
- Application tab for storage issues

### Production debugging

Add error tracking:
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

## Still Stuck?

1. **Check the logs**:
   - Vercel: Deployments → Your deployment → Logs
   - Local: Terminal where you ran `npm run dev`

2. **Search the error**:
   - Copy exact error message
   - Google: "nextjs [your error]"
   - Stack Overflow usually has answers

3. **Verify API status**:
   - OpenAI: https://status.openai.com/
   - Amazon: Check Associates Central
   - Etsy: https://www.etsystatus.com/

4. **Check documentation**:
   - `SETUP.md` for setup steps
   - `QUICKSTART.md` for quick fixes
   - Code comments for inline help

5. **Test with minimal setup**:
   - Start with just OpenAI key
   - Get that working first
   - Add other APIs one at a time

## Emergency Fixes

### If everything is broken:

```bash
# Nuclear option - start fresh
cd ..
mv goose.gifts goose.gifts.backup
git clone [your-repo] goose.gifts
cd goose.gifts
npm install
cp ../goose.gifts.backup/.env .env
npm run dev
```

### If database is corrupted:

```sql
-- Drop and recreate
DROP TABLE gift_ideas;
-- Then run initialization again
```

### If Vercel deployment fails:

```bash
# Deploy from CLI
npm i -g vercel
vercel --prod

# Or rollback to previous deployment
# In Vercel dashboard: Deployments → Previous → Promote to Production
```

## Prevention

### Before each deploy:

```bash
# Run checks
npm run build  # Should complete without errors
npm run lint   # Fix any warnings

# Test locally
npm run start  # Test production build
```

### Regular maintenance:

```bash
# Update dependencies monthly
npm outdated
npm update

# Check for security issues
npm audit
npm audit fix
```

### Monitoring setup:

- [ ] Add error tracking (Sentry)
- [ ] Set up uptime monitoring (UptimeRobot)
- [ ] Enable Vercel Analytics
- [ ] Check API usage weekly

## Getting Help

If you can't solve it:

1. Open GitHub issue with:
   - Error message (full text)
   - What you tried
   - Environment (local/Vercel)
   - Relevant code

2. Include:
   ```bash
   node --version
   npm --version
   # Your .env (without actual keys!)
   ```

3. Screenshots of:
   - Error in browser/terminal
   - Network tab in DevTools
   - Vercel logs (if deployed)

Remember: Most issues are env variables or API key problems. Double-check those first! 🔍
