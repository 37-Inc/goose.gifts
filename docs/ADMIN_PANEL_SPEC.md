# Admin Panel Specification - V1

## Overview

A lightweight admin interface for goose.gifts to manage generated content, monitor system health, and track basic performance metrics.

**Version**: 1.0 (MVP)
**Priority**: Content management first, analytics second
**Philosophy**: Simple, functional, no over-engineering

## Goals

1. **Content Control**: Review, edit, and moderate generated gift bundles
2. **Quality Assurance**: Catch inappropriate or low-quality AI outputs
3. **Performance Visibility**: Understand what's working (views, clicks)
4. **System Health**: Monitor API status and errors at a glance

## User Stories

- As an admin, I want to see all generated gift bundles so I can review what's being shared
- As an admin, I want to delete inappropriate or low-quality bundles so the site maintains quality
- As an admin, I want to edit bundle titles/taglines so I can fix AI mistakes
- As an admin, I want to see which bundles are most popular so I can understand what resonates
- As an admin, I want to check if APIs are working so I can troubleshoot issues quickly

## V1 Features

### 1. Content Management (Priority 1)

#### Bundle Library
- **List View**: Paginated table of all generated gift bundles
  - Columns: Thumbnail, Permalink slug, Title, Humor style, Created date, Views, Actions
  - Sortable by: Date, Views
  - Filters: Humor style, Date range, View count threshold
  - Search: By slug, title, recipient description
  - Default sort: Newest first
  - Pagination: 25 per page

#### Bundle Detail View
- View full bundle data:
  - All gift concepts with titles, taglines, descriptions
  - All products with images, titles, prices, affiliate links
  - Metadata: Created date, view count, original user input
  - Permalink URL (with copy button)

#### Bundle Actions
- **Delete**: Remove bundle from database (with confirmation modal)
  - Include reason tracking (inappropriate, low quality, user request, etc.)
- **Edit**: Modify bundle content
  - Edit gift concept titles and taglines (not products)
  - Edit should update `updated_at` timestamp
- **Preview**: Open permalink in new tab

#### Bulk Actions
- Select multiple bundles (checkboxes)
- Bulk delete with confirmation
- Export selected bundles as JSON

### 2. Dashboard (Priority 2)

Simple overview page with key metrics:

#### Today's Stats
- Gift ideas generated today
- Total permalinks created
- Total permalink views (all time)
- Bundles deleted today

#### Recent Activity
- Last 10 generated bundles (title, timestamp, views)
- Quick links to view/delete each

#### System Status
- API Health Indicators (simple up/down status):
  - OpenAI API (check last generation time)
  - Amazon PA-API (check last successful search)
  - Etsy API (check last successful search)
  - Database connection

### 3. Analytics (Priority 3)

Basic performance insights:

#### Gift Bundle Stats
- Total bundles generated (all time)
- Total views (all time)
- Average views per bundle
- Most viewed bundles (top 10)

#### Humor Style Breakdown
- Count of bundles by humor style (Dad Joke, Office-Safe, Edgy, PG)
- Simple bar chart or table

#### Time-Series Data
- Bundles generated per day (last 30 days)
- Views per day (last 30 days)
- Simple line chart or table

### 4. System Logs (Priority 4)

Simple error visibility:

#### Recent Errors
- Last 50 error logs with:
  - Timestamp
  - Error type (OpenAI, Amazon, Etsy, Database, Other)
  - Error message
  - Stack trace (collapsible)
- Filter by error type
- Clear all logs button

## Data Requirements

### New Database Tables

#### `admin_actions` (audit log)
- `id`: UUID
- `admin_id`: String (for future multi-admin support)
- `action_type`: Enum (delete, edit, export)
- `target_slug`: String (permalink slug)
- `reason`: Text (optional, for deletions)
- `created_at`: Timestamp

#### `error_logs`
- `id`: UUID
- `error_type`: Enum (openai, amazon, etsy, database, other)
- `error_message`: Text
- `stack_trace`: Text
- `created_at`: Timestamp
- `resolved`: Boolean (for future tracking)

### Existing Table Updates

#### `gift_ideas` table (existing)
- Add `view_count` column (integer, default 0)
- Add `updated_at` column (timestamp)
- Add `deleted_at` column (timestamp, nullable) for soft deletes

## Authentication

### V1: Simple Password-Based Auth (Zero Dependencies)

**Implementation approach**: Custom password authentication with no external libraries

#### How it works:
1. Admin password stored in environment variable (`ADMIN_PASSWORD`)
2. Password is hashed using Node.js built-in crypto (bcrypt alternative)
3. Login page at `/admin/login` accepts password
4. On success, sets httpOnly + secure session cookie
5. Middleware checks cookie on all `/admin/*` routes (except login)
6. Session expires after 24 hours

#### Security measures:
- Store password hash, never plain text (use crypto.pbkdf2 or bcrypt if added)
- Rate limiting on login attempts (max 5 attempts per IP per hour)
- httpOnly cookies (prevent XSS)
- Secure flag on cookies (HTTPS only in production)
- CSRF protection on all POST/DELETE/PATCH endpoints
- Session tokens are cryptographically random (crypto.randomBytes)

#### Environment variables needed:
- `ADMIN_PASSWORD`: The admin password (set this securely)
- Optional: `ADMIN_SESSION_SECRET`: Secret for signing session tokens

#### Login flow:
1. User visits `/admin` → redirected to `/admin/login`
2. Enter password → POST to `/api/admin/auth/login`
3. Server validates password, creates session
4. Set cookie, redirect to `/admin`
5. All admin pages check cookie via middleware

#### Why no NextAuth/OAuth for V1:
- Single admin only (you)
- Zero dependencies to maintain
- Fast to implement (~100 lines)
- Easy to migrate to NextAuth.js later when multi-admin needed

### Future: Multi-Admin Support
- Individual admin accounts
- Role-based permissions
- OAuth integration

## UI/UX Guidelines

### Layout
- Sidebar navigation:
  - Dashboard (home)
  - Bundles (content management)
  - Analytics
  - Logs
  - Logout
- Header: Site title, current admin, timestamp
- Mobile-responsive (but desktop-first for admin work)

### Design Principles
- Clean and functional (no fancy animations)
- Fast loading (server-side rendering where possible)
- Keyboard shortcuts for power users (delete = 'd', edit = 'e', etc.)
- Confirmation modals for destructive actions
- Toast notifications for actions (success/error messages)

### Accessibility
- Semantic HTML
- Keyboard navigable
- Clear focus states
- Screen reader friendly

## API Endpoints

All admin endpoints under `/api/admin/*`:

- `GET /api/admin/bundles` - List all bundles (with filters/pagination)
- `GET /api/admin/bundles/[slug]` - Get single bundle details
- `DELETE /api/admin/bundles/[slug]` - Delete bundle (soft delete)
- `PATCH /api/admin/bundles/[slug]` - Update bundle content
- `GET /api/admin/stats` - Dashboard metrics
- `GET /api/admin/analytics` - Analytics data
- `GET /api/admin/errors` - Error logs
- `DELETE /api/admin/errors` - Clear error logs
- `POST /api/admin/auth/login` - Admin login
- `POST /api/admin/auth/logout` - Admin logout
- `GET /api/admin/health` - API health check

## Implementation Priorities

### Phase 1: Content Management (Week 1)
1. Auth middleware
2. Bundle list view with basic filters
3. Delete functionality
4. Simple dashboard

### Phase 2: Enhanced Management (Week 2)
1. Bundle detail view
2. Edit functionality
3. Bulk actions
4. Search

### Phase 3: Monitoring (Week 3)
1. Basic analytics
2. Error logs
3. System health checks

## Out of Scope for V1

- Affiliate revenue tracking (requires Amazon/Etsy reporting APIs)
- User management/accounts (no user system yet)
- A/B testing
- Advanced analytics (conversion funnels, cohorts)
- Email notifications
- Automated moderation rules
- API rate limit dashboards
- Cost tracking (OpenAI spend)
- Content scheduling/publishing
- SEO management tools
- Social media integration
- Custom reports/exports

These can be added in future versions based on actual needs.

## Success Metrics

V1 will be considered successful if:
- Can review all generated bundles in under 30 seconds
- Can delete inappropriate content in under 10 seconds
- Can identify top-performing bundles at a glance
- Can detect API issues within 5 minutes of occurrence
- Adds less than 100ms to page load times (admin routes only)

## Technical Considerations

### Performance
- Paginate all lists (never load all records at once)
- Index database columns used in filters (humor_style, created_at, view_count)
- Cache dashboard stats (refresh every 5 minutes)
- Lazy load large data (error stack traces, full bundle content)

### Security
- Rate limit admin login attempts
- HTTPS only
- CSRF protection on all POST/DELETE/PATCH
- Sanitize all user inputs
- Log all admin actions for audit trail
- Environment variables for secrets (never commit passwords)

### Maintenance
- Keep dependencies minimal
- Self-documenting code
- Error boundaries for graceful failures
- Regular database backups (especially before bulk operations)

## Open Questions

1. Should soft-deleted bundles be recoverable? (Suggest: Yes, for first 30 days)
2. Should we track permalink clicks to external sites? (Suggest: V2 feature)
3. How long to keep error logs? (Suggest: Last 1000 or 30 days)
4. Should admins get email alerts for errors? (Suggest: V2 feature)

## Notes

- Keep it simple - this is internal tooling, not a customer-facing product
- Build incrementally - launch Phase 1, gather feedback, iterate
- Monitor actual usage - add features based on what admins actually need
- Consider adding feature flags for gradual rollout
