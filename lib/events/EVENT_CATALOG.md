# EVENT CATALOG

Complete reference of all system events in Glimad v0.

**Last Updated:** April 16, 2026
**Total Events:** 19
**Event Retention:** 30-180 days based on type

---

## 📋 TABLE OF CONTENTS

1. [User & Authentication Events](#user--authentication-events)
2. [Payment Events](#payment-events)
3. [Mission Events](#mission-events)
4. [Brain & Intelligence Events](#brain--intelligence-events)
5. [Content Events](#content-events)
6. [System & Error Events](#system--error-events)
7. [Engagement Events](#engagement-events)
8. [Event Tracking Best Practices](#event-tracking-best-practices)

---

## USER & AUTHENTICATION EVENTS

### `user_signup`

- **Category:** User
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** email, name
- **Description:** New user completed signup process
- **When Triggered:** User creates account via email or social OAuth
- **Payload Schema:**
  ```typescript
  {
    email: string; // User email address
    name: string; // User full name
    source: "email" | "google" | "facebook" | "twitter"; // Auth method
  }
  ```
- **Example:**
  ```json
  {
    "email": "[TOKEN:abc123]",
    "name": "[TOKEN:def456]",
    "source": "google"
  }
  ```

### `user_login`

- **Category:** Auth
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** email
- **Description:** User authenticated successfully
- **When Triggered:** User logs in via magic link, password, or OAuth
- **Payload Schema:**
  ```typescript
  {
    email: string; // User email
    method: "magic_link" | "password" | "oauth";
  }
  ```

### `user_logout`

- **Category:** Auth
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** User session terminated
- **When Triggered:** User clicks logout or session expires
- **Payload Schema:**
  ```typescript
  {
    userId: string; // User UUID
    reason: "user_initiated" | "session_expired" | "security";
  }
  ```

---

## PAYMENT EVENTS

### `stripe_checkout_created`

- **Category:** Payment
- **Severity:** Info
- **Retention:** 180 days
- **PII Fields:** None
- **Description:** Payment session initiated
- **When Triggered:** User clicks checkout button
- **Payload Schema:**
  ```typescript
  {
    sessionId: string; // Stripe checkout session ID
    amountEur: number; // Price in EUR (39.00, 69.00, 149.00)
    plan: "starter" | "growth" | "scale";
    currency: string; // 'EUR'
  }
  ```

### `stripe_payment_completed`

- **Category:** Payment
- **Severity:** Info
- **Retention:** 180 days
- **PII Fields:** None
- **Description:** Charge completed successfully, subscription active
- **When Triggered:** Stripe webhook confirms payment_intent.succeeded
- **Payload Schema:**
  ```typescript
  {
    chargeId: string; // Stripe charge ID
    amountEur: number; // Amount charged
    plan: "starter" | "growth" | "scale";
    creditsAwarded: number; // Credits added to wallet (500/1250/3125)
  }
  ```
- **Note:** Triggers credit grant in ledger and updates user.plan

### `stripe_payment_failed`

- **Category:** Payment
- **Severity:** Error
- **Retention:** 180 days
- **PII Fields:** None
- **Description:** Charge declined by payment processor
- **When Triggered:** Stripe webhook reports charge.failed or payment declined
- **Payload Schema:**
  ```typescript
  {
    chargeId: string; // Stripe charge ID
    errorCode: string; // e.g. 'card_declined', 'card_error'
    errorMessage: string; // Human-readable error
    attemptCount: number; // Number of retry attempts
  }
  ```

---

## MISSION EVENTS

### `mission_started`

- **Category:** Mission
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** User initiated a mission
- **When Triggered:** User clicks "Start Mission" button
- **Payload Schema:**
  ```typescript
  {
    missionId: string; // UUID of mission instance
    missionType: string; // e.g. 'content_audit' (13 types total)
    missionName: string; // Display name
  }
  ```

### `mission_completed`

- **Category:** Mission
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** User finished mission and received credits
- **When Triggered:** Mission results validated, credits deducted from wallet
- **Payload Schema:**
  ```typescript
  {
    missionId: string;              // UUID
    missionType: string;            // Task category
    durationMinutes: number;        // Time spent
    creditsEarned: number;          // Reward (10-100 typically)
    qualityScore?: number;          // 0-100 if applicable
  }
  ```
- **Side Effects:**
  - Deducts cost from user.wallet
  - Increments user.mission_count
  - May trigger brain update
  - Gamification points awarded

### `mission_abandoned`

- **Category:** Mission
- **Severity:** Warning
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** User quit mission prematurely
- **When Triggered:** User abandons mission or session timeout
- **Payload Schema:**
  ```typescript
  {
    missionId: string;
    missionType: string;
    reason: "user_cancel" | "timeout" | "error" | "insufficient_credits";
    completionPercentage: number; // % of mission completed (0-100)
  }
  ```

---

## BRAIN & INTELLIGENCE EVENTS

### `brain_update_started`

- **Category:** Brain
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** Brain analysis engine initiated
- **When Triggered:** Manual trigger, scheduled job, or post-mission
- **Payload Schema:**
  ```typescript
  {
    userId: string; // UUID
    projectId: string; // UUID
    trigger: "manual" | "scheduled" | "webhook" | "mission_completion";
    inputDataSize: number; // Bytes of data to process
  }
  ```

### `brain_update_completed`

- **Category:** Brain
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** Brain analysis finished, phase calculated
- **When Triggered:** Phase Engine and Inflexion Engine complete
- **Payload Schema:**
  ```typescript
  {
    userId: string;
    phase: string; // F0-F7 phase label
    signalsCount: number; // Count of signals generated
    executionTimeMs: number; // Total processing time
    tokensUsed: number; // AI tokens consumed
    success: boolean; // true if no errors
  }
  ```

### `brain_facts_added`

- **Category:** Brain
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** New facts ingested into brain system
- **When Triggered:** User provides info, scraper collects data, or API call
- **Payload Schema:**
  ```typescript
  {
    factsCount: number; // New facts added
    source: "user_input" | "scraper" | "webhook" | "api";
    dataSize: number; // Bytes ingested
  }
  ```

---

## CONTENT EVENTS

### `content_published`

- **Category:** Content
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** Content scheduled or published to social media
- **When Triggered:** User publishes via calendar or calendar auto-publishes
- **Payload Schema:**
  ```typescript
  {
    contentId: string;              // UUID
    contentType: string;            // 'post', 'story', 'reel', 'short'
    medium: 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'email';
    url?: string;                   // Published content URL (if available)
  }
  ```

### `content_scraped`

- **Category:** Engagement
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** url
- **Description:** External content scraping job completed
- **When Triggered:** Scrape Light workflow executes (daily)
- **Payload Schema:**
  ```typescript
  {
    url: string; // Source URL
    domain: string; // Domain (e.g. 'instagram.com')
    postsCount: number; // Posts scraped in this job
    dataSize: number; // Bytes of raw scraped data
    executionTimeMs: number; // Job duration
  }
  ```

---

## SYSTEM & ERROR EVENTS

### `system_health_check`

- **Category:** System
- **Severity:** Info
- **Retention:** 30 days (short retention, frequent)
- **PII Fields:** None
- **Description:** Periodic system status snapshot
- **When Triggered:** Health check endpoint (every 5 minutes)
- **Payload Schema:**
  ```typescript
  {
    database: 'healthy' | 'degraded' | 'down';
    api: 'healthy' | 'degraded' | 'down';
    n8n: 'healthy' | 'degraded' | 'down';
    cache: 'healthy' | 'degraded' | 'down';
    externalServices: {
      openai: 'healthy' | 'degraded' | 'down';
      stripe: 'healthy' | 'degraded' | 'down';
      [custom]: 'healthy' | 'degraded' | 'down';
    };
  }
  ```

### `error_occurred`

- **Category:** Error
- **Severity:** error | critical
- **Retention:** 180 days
- **PII Fields:** None
- **Description:** Application error captured
- **When Triggered:** Caught exception in any service
- **Payload Schema:**
  ```typescript
  {
    errorCode: string;              // e.g. 'OPENAI_TIMEOUT', 'DB_CONNECTION'
    errorMessage: string;           // User-friendly message
    stackTrace?: string;            // Full stack (server-side only)
    severity: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, any>;  // Additional debugging info
  }
  ```

### `rate_limit_exceeded`

- **Category:** Error
- **Severity:** Warning
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** User hit API rate limit
- **When Triggered:** Rate limit check fails
- **Payload Schema:**
  ```typescript
  {
    userId: string;
    endpoint: string; // API path (e.g. '/api/brain/analyze')
    limit: number; // Rate limit threshold
    currentUsage: number; // Requests in window
    resetAfterSeconds: number; // When limit resets
    planType: "starter" | "growth" | "scale" | "default";
  }
  ```

---

## ENGAGEMENT EVENTS

### `feature_accessed`

- **Category:** Engagement
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** User accessed a feature
- **When Triggered:** User navigates to feature or section
- **Payload Schema:**
  ```typescript
  {
    featureName: string; // e.g. 'dashboard', 'brain_analysis'
    featureCategory: string; // e.g. 'analytics', 'content'
    accessMethod: "direct" | "navigation" | "search" | "recommendation";
  }
  ```

### `button_clicked`

- **Category:** Engagement
- **Severity:** Info
- **Retention:** 90 days
- **PII Fields:** None
- **Description:** User interacted with UI button/link
- **When Triggered:** Click event on tracked element
- **Payload Schema:**
  ```typescript
  {
    buttonName: string;             // Button label/ID
    buttonId?: string;              // HTML element ID
    page: string;                   // Page name
    section: string;                // Page section
    actionTriggered?: string;       // What action resulted
  }
  ```

---

## EVENT TRACKING BEST PRACTICES

### When to Log Events

✅ **DO Log:**

- User actions (signup, login, mission completion)
- Financial transactions (payments, credits)
- System state changes (phase updates, brain analysis)
- Errors and exceptions
- Performance degradation
- Rate limit violations

❌ **DON'T Log:**

- Every keystroke or form input change
- Third-party events you don't control
- Sensitive data (passwords, auth tokens)
- Personally identifiable information (PII) in plain text

### PII Handling

All PII fields are automatically masked:

| Field       | Masking Strategy | Example          |
| ----------- | ---------------- | ---------------- |
| email       | Tokenize         | `[TOKEN:abc123]` |
| name        | Tokenize         | `[TOKEN:def456]` |
| phone       | Hide Partial     | `+1****5678`     |
| credit_card | Hide Partial     | `****1234`       |
| ip_address  | Hide Partial     | `192.168.*.*`    |
| user_id     | Tokenize         | `[TOKEN:xyz789]` |
| password    | Redact           | `[REDACTED]`     |
| auth_token  | Redact           | `[REDACTED]`     |

### Correlation IDs

Every request includes a unique correlation ID to trace related events:

```
Request → API Handler → Database Insert → N8N Workflow → Email Send
  ↑
  └─ Same correlation ID flows through entire chain
```

Use `x-correlation-id` header to follow an event's journey.

### Querying Events

```typescript
import { getEventLogger } from "@/lib/events/event-logger";

const eventLogger = getEventLogger();

// Get user's recent mission completions
const missionEvents = await eventLogger.queryEvents({
  userId: "user-uuid-here",
  eventType: "mission_completed",
  dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
  limit: 50,
});

// Get error events for debugging
const errors = await eventLogger.queryEvents({
  eventType: "error_occurred",
  severity: "critical",
  limit: 100,
});
```

### Retention Policy

Events are automatically deleted based on type:

| Event Type          | Retention | Reason                       |
| ------------------- | --------- | ---------------------------- |
| system_health_check | 30 days   | High volume, diagnostic only |
| User events         | 90 days   | Standard retention           |
| Payment events      | 180 days  | Financial record keeping     |
| Error events        | 180 days  | Compliance and debugging     |

Cleanup runs daily at 02:00 UTC via scheduled N8N workflow.

### Event Analytics

Get quick stats on event frequency:

```typescript
const stats = await eventLogger.getEventStats("mission_completed", 60);
// Returns: { count: 47, errorRate: 2.1 }
```

---

## IMPLEMENTATION EXAMPLES

### Log a Mission Completion

```typescript
import { getEventLogger } from "@/lib/events/event-logger";
import { MissionCompletedEvent } from "@/lib/events/event-types";
import { extractEventContext } from "@/lib/events/event-middleware";

export async function completeMission(req: NextRequest) {
  const context = extractEventContext(req);
  const eventLogger = getEventLogger();

  // ... mission completion logic ...

  const event: MissionCompletedEvent = {
    eventType: "mission_completed",
    category: "mission",
    severity: "info",
    payload: {
      missionId: mission.id,
      missionType: mission.type,
      durationMinutes: (Date.now() - mission.startTime) / 60000,
      creditsEarned: 50,
      qualityScore: 85,
    },
  };

  await eventLogger.logEvent(event, context);
}
```

### Catch and Log Errors

```typescript
import { withEventTracking } from "@/lib/events/event-middleware";

export const POST = withEventTracking(async (req, context) => {
  try {
    // Your handler logic
  } catch (error) {
    // Error is automatically logged!
    return new NextResponse("Error", { status: 500 });
  }
});
```

---

## TROUBLESHOOTING

**Q: Events not appearing in database?**

- Check `core_event_log` table exists (run migration 023)
- Verify Supabase connection and credentials
- Check browser console for client-side errors
- Ensure RLS policies allow SELECT on `core_event_log`

**Q: PII fields not masked?**

- Verify field name is in `event_definitions.pii_fields` array
- Check `pii_masking_rules` table for masking strategy
- Ensure **`payloadMasked`** is used in reports (not `payload`)

**Q: Missing correlation IDs?**

- Verify middleware is applied to all routes
- Check `x-correlation-id` header in requests
- Ensure `withEventTracking` wrapper is used

---

**Maintained by:** Glimad Dev Team  
**Last Updated:** April 16, 2026  
**Events Status:** ✅ 19/19 Defined & Seeded
