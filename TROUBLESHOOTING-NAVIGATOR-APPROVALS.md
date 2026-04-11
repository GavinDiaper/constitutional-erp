# Troubleshooting: Navigator Approvals HTML Response Issue

## Problem
The "Load Approvals" button on the Navigator page returns HTML DOCTYPE instead of JSON.

## Diagnosis Steps

### 1. Check Navigator API Service Status (Highest Priority)

The Navigator API must be running on port 4016 for the approvals feature to work.

#### Option A: Use the Diagnostic Endpoint
Navigate to: `http://localhost:3000/api/navigator/health`

**Expected Response:**
```json
{
  "status": "ok",
  "navigatorApi": {
    "baseUrl": "http://localhost:4016/api/v1",
    "healthUrl": "http://localhost:4016/health",
    "httpStatus": 200,
    "contentType": "application/json",
    "isJson": true,
    "responsePreview": "{\"status\":\"ok\",\"service\":\"navigator-ai\",...}",
    "accessible": true
  }
}
```

**If it fails or shows error**: Navigator API is not running or not accessible.

#### Option B: Test Navigator Health Directly
```powershell
# Test the health endpoint
curl http://localhost:4016/health

# Test with API key (if configured)
curl -H "X-API-Key: your-api-key" http://localhost:4016/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "navigator-ai",
  "llm": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "startupStatus": "Ready"
}
```

#### Option C: Test Approvals Endpoint Directly
```powershell
# Test the approvals list endpoint
curl -H "X-API-Key: change-me" http://localhost:4016/api/v1/approvals

# Or with curl verbose to see response headers
curl -v -H "X-API-Key: change-me" http://localhost:4016/api/v1/approvals
```

**Expected HTTP Status:** 200
**Expected Content-Type:** application/json
**Expected Body:** `{"data":[]}`

### 2. Verify Environment Configuration

Check that the Navigator API URL is correctly configured in the SvelteKit environment.

#### Check Current Configuration
A /api/navigator/health diagnostic endpoint is available that shows the resolved configuration.

**File**: [src/lib/server/hubProxy.ts](src/lib/server/hubProxy.ts)

**Configuration mapping:**
```typescript
'navigator-ai': {
  baseUrl: process.env.NAVIGATOR_AI_URL ?? 'http://localhost:4016/api/v1',
  apiKey: process.env.NAVIGATOR_AI_API_KEY ?? 'change-me'
}
```

**What to check:**
1. Is `NAVIGATOR_AI_URL` set in your `.env.local` or environment variables?
2. If not set, it uses default: `http://localhost:4016/api/v1`
3. Is the URL correct? (no typos in hostname or port)

#### To Override Configuration
Add to your `.env.local`:
```
NAVIGATOR_AI_URL=http://localhost:4016/api/v1
NAVIGATOR_AI_API_KEY=change-me
```

### 3. Verify Navigator API Startup

Check if Navigator API started successfully with all dependencies available.

#### Look for Navigator Process
```powershell
# PowerShell: Check if process is listening on port 4016
netstat -ano | findstr :4016

# If running, you should see: TCP  0.0.0.0:4016  0.0.0.0:0  LISTENING
```

#### Check Navigator Startup Logs

**File**: [ConstitutionalERP-ConstitutionalLayer/navigator-ai/](../../ConstitutionalERP-ConstitutionalLayer/navigator-ai/)

Look for startup log output showing:
- ✅ `navigator-ai listening on 4016`
- ✅ `navigator-ai startup checks complete; service is ready`
- ⚠️ If you see startup errors, likely cause is LLM connectivity

### 4. Common Causes & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| HTML response with DOCTYPE | Navigator API not running | Start Navigator API service: `npm run dev` in navigator-ai folder |
| 502 Bad Gateway error | Wrong URL configured | Check NAVIGATOR_AI_URL environment variable |
| 401/403 Unauthorized | Invalid API key | Verify NAVIGATOR_AI_API_KEY matches Navigator config |
| 404 Not Found | Wrong API version | Verify path uses `/api/v1/approvals` |
| Network unreachable | Port 4016 blocked/wrong host | Check firewall, DNS resolution |
| LLM connectivity error | OpenAI key invalid or network issue | Check OPENAI_API_KEY configuration in Navigator |

### 5. API Response Debugging

Recent changes add better error logging to the approvals proxy:

**File**: [src/routes/api/navigator/approvals/+server.ts](../ui/src/routes/api/navigator/approvals/+server.ts)

**What the proxy logs:**
- HTTP status from Navigator API
- Error messages if request fails
- Debug information including base URL and full request URL

Check browser console or SvelteKit server logs for detailed error messages.

## Architectural Notes

### Dashboard Approvals vs Navigator Page Approvals

**Dashboard "Approval Queue"** (`/dashboard`):
- Source: Mock data from query tables (customers, requisitions, journals)
- Purpose: Show pending items that typically need approval
- Data: Built from entity state not from Navigator API
- Status: Does NOT require Navigator API to be running

**Navigator Page "Load Approvals"** (`/navigator`):
- Source: Real approval requests from Navigator `/approvals` endpoint
- Purpose: Show actual approval requests awaiting resolution
- Data: Actual ApprovalRequest records from Navigator SQLite database
- Status: **REQUIRES Navigator API to be running**
- Note: This is where approvers would resolve actual approval requests

### API Path
```
SvelteKit UI (port 3000)
  → GET /api/navigator/approvals?{filters}
    → proxy via SvelteKit route
      → Navigator API (port 4016)
        → GET /api/v1/approvals?{filters}
```

## Testing the Complete Flow

Once Navigator API is running and returning JSON:

1. **Load Approvals**: Click "Load Approvals" button on Navigator page
2. **Should see**: Empty array (if no approvals) or list of approval requests
3. **Actions available**: Approve, reject, escalate an approval request
4. **After approval**: Approved action should execute automatically

## Additional Resources

- Navigator Service Documentation: [ConstitutionalERP-ConstitutionalLayer/navigator-ai/README.md](../../ConstitutionalERP-ConstitutionalLayer/navigator-ai/README.md)
- Approval Request Schema: Navigator SQLite migration 002
- API Route: [navigator-ai/src/api/navigator.routes.ts](../../ConstitutionalERP-ConstitutionalLayer/navigator-ai/src/api/navigator.routes.ts) (line 190: `/approvals` GET endpoint)

