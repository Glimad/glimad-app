# Glimad Error Catalog

Complete reference for all error codes used in the Glimad application.

## Error Code Format

All error codes follow the pattern: `GLM_[CATEGORY]_[NUMBER]`

| Category | Code Range | Description                    |
| -------- | ---------- | ------------------------------ |
| AUTH     | 001-099    | Authentication & Authorization |
| USER     | 100-199    | User Management                |
| DATA     | 200-299    | Data Operations                |
| API      | 300-399    | External API Integrations      |
| PAY      | 400-499    | Payment & Billing (Stripe)     |
| MISSION  | 500-599    | Mission System                 |
| BRAIN    | 600-699    | Brain/AI System                |
| SCRAPE   | 700-799    | Social Media Scraping          |
| STUDIO   | 800-899    | Content Studio                 |
| SYS      | 900-999    | System & Infrastructure        |

---

## Authentication Errors (GLM_AUTH_001-099)

| Code         | HTTP | Severity | Message                                | Recovery |
| ------------ | ---- | -------- | -------------------------------------- | -------- |
| GLM_AUTH_001 | 401  | medium   | Authentication required                | ignore   |
| GLM_AUTH_002 | 401  | medium   | Invalid credentials                    | ignore   |
| GLM_AUTH_003 | 401  | low      | Session expired                        | ignore   |
| GLM_AUTH_004 | 403  | medium   | Insufficient permissions               | ignore   |
| GLM_AUTH_005 | 403  | high     | Account suspended                      | escalate |
| GLM_AUTH_006 | 400  | low      | Magic link expired                     | ignore   |
| GLM_AUTH_007 | 502  | medium   | OAuth provider error                   | retry    |
| GLM_AUTH_008 | 403  | low      | Email not verified                     | ignore   |
| GLM_AUTH_009 | 429  | medium   | Rate limited - too many login attempts | queue    |

---

## User Management Errors (GLM_USER_100-199)

| Code         | HTTP | Severity | Message                  | Recovery |
| ------------ | ---- | -------- | ------------------------ | -------- |
| GLM_USER_100 | 404  | medium   | User not found           | ignore   |
| GLM_USER_101 | 409  | low      | Email already registered | ignore   |
| GLM_USER_102 | 400  | low      | Profile incomplete       | ignore   |
| GLM_USER_103 | 400  | low      | Onboarding not completed | ignore   |
| GLM_USER_104 | 400  | low      | Invalid profile data     | ignore   |
| GLM_USER_105 | 500  | medium   | Preferences save failed  | retry    |

---

## Data Operation Errors (GLM_DATA_200-299)

| Code         | HTTP | Severity | Message                          | Recovery |
| ------------ | ---- | -------- | -------------------------------- | -------- |
| GLM_DATA_200 | 503  | critical | Database connection failed       | retry    |
| GLM_DATA_201 | 504  | high     | Query timeout                    | retry    |
| GLM_DATA_202 | 404  | low      | Record not found                 | ignore   |
| GLM_DATA_203 | 409  | low      | Duplicate record                 | ignore   |
| GLM_DATA_204 | 400  | medium   | Foreign key constraint violation | ignore   |
| GLM_DATA_205 | 400  | low      | Validation failed                | ignore   |
| GLM_DATA_206 | 500  | high     | Transaction failed               | retry    |
| GLM_DATA_207 | 403  | medium   | RLS policy denied                | ignore   |

---

## External API Errors (GLM_API_300-399)

| Code        | HTTP | Severity | Message                    | Recovery |
| ----------- | ---- | -------- | -------------------------- | -------- |
| GLM_API_300 | 503  | high     | External API unavailable   | retry    |
| GLM_API_301 | 429  | medium   | API rate limit exceeded    | queue    |
| GLM_API_302 | 502  | critical | API authentication failed  | escalate |
| GLM_API_303 | 502  | high     | API response invalid       | retry    |
| GLM_API_304 | 504  | medium   | API timeout                | retry    |
| GLM_API_305 | 502  | high     | Claude API error           | retry    |
| GLM_API_306 | 429  | medium   | Claude rate limit exceeded | queue    |

---

## Payment & Billing Errors (GLM_PAY_400-499)

| Code        | HTTP | Severity | Message                | Recovery |
| ----------- | ---- | -------- | ---------------------- | -------- |
| GLM_PAY_400 | 402  | high     | Payment failed         | ignore   |
| GLM_PAY_401 | 402  | medium   | Card declined          | ignore   |
| GLM_PAY_402 | 404  | medium   | Subscription not found | ignore   |
| GLM_PAY_403 | 402  | medium   | Subscription cancelled | ignore   |
| GLM_PAY_404 | 402  | low      | Insufficient credits   | ignore   |
| GLM_PAY_405 | 400  | critical | Stripe webhook failed  | escalate |
| GLM_PAY_406 | 404  | high     | Price not found        | escalate |
| GLM_PAY_407 | 502  | high     | Stripe API error       | retry    |
| GLM_PAY_408 | 404  | medium   | Customer not found     | ignore   |

---

## Mission System Errors (GLM_MISSION_500-599)

| Code            | HTTP | Severity | Message                       | Recovery |
| --------------- | ---- | -------- | ----------------------------- | -------- |
| GLM_MISSION_500 | 404  | medium   | Mission not found             | ignore   |
| GLM_MISSION_501 | 409  | low      | Mission already completed     | ignore   |
| GLM_MISSION_502 | 410  | low      | Mission expired               | ignore   |
| GLM_MISSION_503 | 400  | low      | Mission prerequisites not met | ignore   |
| GLM_MISSION_504 | 500  | high     | Mission generation failed     | retry    |
| GLM_MISSION_505 | 400  | low      | Invalid mission response      | ignore   |
| GLM_MISSION_506 | 429  | low      | Mission limit reached         | ignore   |

---

## Brain/AI System Errors (GLM_BRAIN_600-699)

| Code          | HTTP | Severity | Message                   | Recovery |
| ------------- | ---- | -------- | ------------------------- | -------- |
| GLM_BRAIN_600 | 404  | high     | Brain not found           | ignore   |
| GLM_BRAIN_601 | 500  | high     | Brain update failed       | retry    |
| GLM_BRAIN_602 | 504  | medium   | Brain computation timeout | retry    |
| GLM_BRAIN_603 | 404  | medium   | Engine not found          | ignore   |
| GLM_BRAIN_604 | 500  | high     | Engine execution failed   | retry    |
| GLM_BRAIN_605 | 400  | low      | Insufficient signals      | ignore   |
| GLM_BRAIN_606 | 500  | high     | Rollback failed           | escalate |

---

## Scraping System Errors (GLM_SCRAPE_700-799)

| Code           | HTTP | Severity | Message                | Recovery |
| -------------- | ---- | -------- | ---------------------- | -------- |
| GLM_SCRAPE_700 | 400  | low      | Platform not supported | ignore   |
| GLM_SCRAPE_701 | 404  | low      | Profile not found      | ignore   |
| GLM_SCRAPE_702 | 403  | low      | Profile is private     | ignore   |
| GLM_SCRAPE_703 | 429  | medium   | Scrape rate limited    | queue    |
| GLM_SCRAPE_704 | 403  | high     | Scrape blocked         | escalate |
| GLM_SCRAPE_705 | 500  | medium   | Scrape parse failed    | retry    |
| GLM_SCRAPE_706 | 500  | critical | API key missing        | escalate |
| GLM_SCRAPE_707 | 404  | medium   | Scrape job not found   | ignore   |

---

## Content Studio Errors (GLM_STUDIO_800-899)

| Code           | HTTP | Severity | Message                   | Recovery |
| -------------- | ---- | -------- | ------------------------- | -------- |
| GLM_STUDIO_800 | 500  | high     | Content generation failed | retry    |
| GLM_STUDIO_801 | 404  | medium   | Asset not found           | ignore   |
| GLM_STUDIO_802 | 400  | low      | Topic exhausted           | ignore   |
| GLM_STUDIO_803 | 409  | low      | Calendar slot unavailable | ignore   |
| GLM_STUDIO_804 | 400  | low      | Invalid content format    | ignore   |
| GLM_STUDIO_805 | 500  | medium   | Content approval failed   | retry    |

---

## System & Infrastructure Errors (GLM_SYS_900-999)

| Code        | HTTP | Severity | Message               | Recovery |
| ----------- | ---- | -------- | --------------------- | -------- |
| GLM_SYS_900 | 500  | critical | Internal server error | escalate |
| GLM_SYS_901 | 503  | critical | Service unavailable   | retry    |
| GLM_SYS_902 | 429  | medium   | Rate limit exceeded   | queue    |
| GLM_SYS_903 | 400  | low      | Invalid request       | ignore   |
| GLM_SYS_904 | 405  | low      | Method not allowed    | ignore   |
| GLM_SYS_905 | 500  | critical | Configuration error   | escalate |
| GLM_SYS_906 | 500  | high     | Cron job failed       | retry    |
| GLM_SYS_907 | 503  | high     | Circuit breaker open  | degrade  |
| GLM_SYS_908 | 408  | medium   | Request timeout       | retry    |
| GLM_SYS_909 | 403  | low      | Feature disabled      | ignore   |

---

## Recovery Strategies

| Strategy     | Description                                  | Use Case                               |
| ------------ | -------------------------------------------- | -------------------------------------- |
| **retry**    | Automatically retry with exponential backoff | Transient failures (network, timeouts) |
| **degrade**  | Fall back to degraded functionality          | Non-critical features                  |
| **queue**    | Queue operation for later retry              | Rate limited operations                |
| **escalate** | Alert operations team                        | Critical failures                      |
| **ignore**   | Do not retry, return error to user           | Validation errors, not found           |

---

## Usage Examples

### Throwing Errors

```typescript
import { AppError, authError, dataError } from "@/lib/errors";

// Using AppError directly
throw new AppError("GLM_AUTH_001", {
  userId: "user_123",
  endpoint: "/api/protected",
});

// Using factory functions (type-safe)
throw authError("GLM_AUTH_002");
throw dataError("GLM_DATA_202", { metadata: { recordId: "abc" } });
```

### Converting External Errors

```typescript
import { AppError } from "@/lib/errors";

// From Supabase
const { data, error } = await supabase.from("users").select();
if (error) {
  throw AppError.fromSupabaseError(error);
}

// From Stripe
try {
  await stripe.customers.create({});
} catch (error) {
  throw AppError.fromStripeError(error);
}

// From unknown
try {
  await riskyOperation();
} catch (error) {
  throw AppError.fromUnknown(error, "GLM_SYS_900");
}
```

### API Route Handler

```typescript
import { withErrorHandler } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = withErrorHandler(async (req: NextRequest) => {
  // Your logic here
  // Errors are automatically caught and formatted
  return NextResponse.json({ data: "success" });
});
```

### Circuit Breaker

```typescript
import { databaseCircuitBreaker, claudeCircuitBreaker } from "@/lib/errors";

// Protect database calls
const users = await databaseCircuitBreaker.execute(() =>
  supabase.from("users").select(),
);

// Protect AI calls with fallback
const content = await claudeCircuitBreaker.executeWithFallback(
  () => generateAIContent(prompt),
  () => getDefaultContent(), // Fallback when circuit is open
);
```

### Retry with Backoff

```typescript
import { withRetry, retryable } from "@/lib/errors";

// One-time retry
const result = await withRetry(() => fetchExternalData(), {
  maxRetries: 3,
  initialDelay: 1000,
});

// Create retryable function
const fetchWithRetry = retryable(fetchExternalData, { maxRetries: 3 });
const data = await fetchWithRetry();
```

### Graceful Degradation

```typescript
import { withDegrade } from "@/lib/errors";

const recommendations = await withDegrade(
  () => getPersonalizedRecommendations(userId),
  () => getDefaultRecommendations(), // Fallback
);
```

### Assertions

```typescript
import {
  assertAuthenticated,
  assertDefined,
  assertOrThrow,
} from "@/lib/errors";

// Assert user is logged in
assertAuthenticated(session?.user?.id); // Throws GLM_AUTH_001 if null

// Assert value exists
assertDefined(mission, "GLM_MISSION_500"); // Throws if null/undefined

// Assert condition
assertOrThrow(credits >= 10, "GLM_PAY_404"); // Throws if false
```

---

## Monitoring & Escalation

### Severity Levels

| Severity     | Action                      | Example                      |
| ------------ | --------------------------- | ---------------------------- |
| **critical** | Immediate escalation + page | Database down, config error  |
| **high**     | Escalation within 15 min    | Payment failures, AI errors  |
| **medium**   | Log + monitor               | Rate limits, auth failures   |
| **low**      | Log only                    | Validation errors, not found |

### Circuit Breaker States

| State         | Behavior                                 |
| ------------- | ---------------------------------------- |
| **CLOSED**    | Normal operation, all requests pass      |
| **OPEN**      | All requests blocked, waiting to recover |
| **HALF_OPEN** | Testing with limited requests            |

---

## Adding New Error Codes

1. Add to appropriate category in `error-codes.ts`
2. Follow naming convention: `GLM_[CATEGORY]_[NUMBER]`
3. Define all required fields
4. Update this documentation

```typescript
// In error-codes.ts
GLM_NEW_100: {
  code: "GLM_NEW_100",
  message: "Technical message for logs",
  httpStatus: 400,
  severity: "low" as ErrorSeverity,
  recoveryStrategy: "ignore" as RecoveryStrategy,
  retryable: false,
  maxRetries: 0,
  retryDelayMs: 0,
  userMessage: "User-friendly message",
  internalDescription: "Detailed explanation for devs",
},
```
