# Admin Portal Setup Guide

This guide will help you set up and configure the goose.gifts admin portal.

## Prerequisites

- Database already configured (Vercel Postgres)
- Node.js and npm installed
- Admin password chosen

## Step 1: Environment Variables

Add these environment variables to your `.env` file:

```bash
# Admin Authentication
ADMIN_PASSWORD=your-secure-password-here
ADMIN_SESSION_SECRET=your-random-secret-key-here
```

**Important Security Notes:**
- Use a strong, unique password for `ADMIN_PASSWORD`
- Generate a random secret for `ADMIN_SESSION_SECRET` (min 32 characters)
- Never commit these values to version control

**Generate a secure session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 2: Database Migration

The admin portal requires new database tables and columns. Run the migration:

### Option A: Using Drizzle Kit (Recommended)

Generate and push the schema changes:

```bash
npm run db:push
```

This will add:
- `deleted_at` column to `gift_bundles` table
- New `admin_actions` table for audit logging
- New `error_logs` table for system monitoring

### Option B: Manual SQL Migration

If you prefer to review the changes first, you can generate SQL:

```bash
npm run db:generate
```

Then review the generated SQL in `lib/db/migrations/` and apply manually.

## Step 3: Verify Setup

1. Start the development server:
```bash
npm run dev
```

2. Navigate to the admin login page:
```
http://localhost:3000/admin/login
```

3. Enter your admin password and log in

4. You should see the admin dashboard with today's stats

## Admin Portal Features

### Dashboard (`/admin`)
- Today's activity summary
- All-time statistics
- Recent bundles list
- System health indicators
- Quick action buttons

### Bundles Management (`/admin/bundles`)
- Paginated list of all bundles (25 per page)
- Advanced filters:
  - Search by slug or title
  - Filter by humor style
  - Filter by minimum views
  - Date range filtering
  - Sort by date or views
- Actions:
  - View bundle details
  - Delete bundles (soft delete)

### Bundle Detail (`/admin/bundles/[slug]`)
- View complete bundle information
- Edit SEO metadata (title, description)
- Copy permalink URL
- Preview bundle
- Delete bundle
- View all gift ideas and products

### Analytics (`/admin/analytics`)
- Total bundles and views
- Average views per bundle
- Top 10 most viewed bundles
- Humor style distribution
- Daily activity for last 30 days
- Summary insights

## Authentication & Security

### Session Management
- Sessions expire after 24 hours
- Logout clears session immediately
- Middleware protects all `/admin/*` routes except `/admin/login`

### Rate Limiting
- Maximum 5 login attempts per IP per hour
- Automatic reset after rate limit window expires

### Security Features
- httpOnly cookies (XSS protection)
- Secure flag in production (HTTPS only)
- CSRF protection on destructive actions
- Audit logging for all admin actions
- Password-based authentication

## Audit Trail

All admin actions are logged in the `admin_actions` table:
- Login/logout events
- Bundle edits (with field tracking)
- Bundle deletions (with reason)
- Export operations

Access audit logs via the database:
```sql
SELECT * FROM admin_actions ORDER BY created_at DESC LIMIT 50;
```

## Troubleshooting

### "Unauthorized" error when accessing admin pages
- Check that `ADMIN_PASSWORD` is set in `.env`
- Verify you're logged in (session cookie present)
- Clear browser cookies and try logging in again

### Database column errors
- Run `npm run db:push` to apply schema changes
- Verify database connection in `.env`
- Check that migrations completed successfully

### Session expires immediately
- Ensure `ADMIN_SESSION_SECRET` is set
- Check that cookies are enabled in your browser
- Verify secure flag settings (should be false in development)

### Rate limited after too many attempts
- Wait 1 hour for rate limit to reset
- Or restart the development server (rate limits are in-memory)

## Production Deployment

### Vercel Deployment

1. Add environment variables in Vercel dashboard:
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`

2. Deploy normally:
```bash
vercel
```

3. Run database migration on production:
```bash
vercel env pull .env.production.local
npm run db:push
```

### Security Checklist

- [ ] Strong admin password set
- [ ] Session secret is random and unique
- [ ] Environment variables not committed to git
- [ ] HTTPS enabled in production
- [ ] Regular password rotation policy
- [ ] Audit logs reviewed periodically

## API Endpoints

All admin API endpoints are under `/api/admin/*`:

### Authentication
- `POST /api/admin/auth/login` - Login
- `POST /api/admin/auth/logout` - Logout
- `GET /api/admin/auth/verify` - Check session

### Bundles
- `GET /api/admin/bundles` - List bundles (with filters)
- `GET /api/admin/bundles/[slug]` - Get bundle
- `PATCH /api/admin/bundles/[slug]` - Update bundle
- `DELETE /api/admin/bundles/[slug]` - Delete bundle (soft)

### Stats & Analytics
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/analytics` - Detailed analytics

## Database Schema

### gift_bundles (modified)
```sql
-- Added columns:
deleted_at TIMESTAMP NULL -- For soft deletes
```

### admin_actions (new)
```sql
id UUID PRIMARY KEY
admin_id VARCHAR(255) NOT NULL
action_type VARCHAR(50) NOT NULL -- 'delete', 'edit', 'export', 'login', 'logout'
target_slug VARCHAR(100) NULL
reason TEXT NULL
metadata JSONB NULL
created_at TIMESTAMP NOT NULL
```

### error_logs (new)
```sql
id UUID PRIMARY KEY
error_type VARCHAR(50) NOT NULL -- 'openai', 'amazon', 'etsy', 'database', 'other'
error_message TEXT NOT NULL
stack_trace TEXT NULL
metadata JSONB NULL
resolved INTEGER NOT NULL DEFAULT 0
created_at TIMESTAMP NOT NULL
```

## Future Enhancements

V1 focuses on core content management. Future versions may include:
- Multi-admin support with roles/permissions
- OAuth integration (Google, GitHub)
- Advanced analytics and reporting
- Bulk operations on bundles
- Email notifications for errors
- API rate limit dashboards
- Cost tracking (OpenAI usage)
- Automated content moderation

## Support

For issues or questions:
1. Check this documentation
2. Review the main project README
3. Check the codebase comments
4. Inspect browser console for errors

## License

Same as main project (MIT)
