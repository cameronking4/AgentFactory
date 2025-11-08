# Vercel Workflows Implementation Analysis

## Repository Overview

This repository implements an **Actor Pattern** using Vercel Workflows. The actor pattern is a concurrency model where each actor maintains isolated state and processes events sequentially, ensuring thread-safe state management.

## Architecture

### Core Components

1. **Workflow Definition** (`workflows/counter-actor.ts`)
   - Defines the actor workflow using `"use workflow"` directive
   - Implements event-driven state management
   - Uses hooks for external event reception

2. **API Routes**
   - `/api/actor` - Starts new actor instances
   - `/api/actor/[actorId]/event` - Sends events to actors
   - `/api/actor/[actorId]/state` - Queries actor state

3. **State Management** (`lib/actor-state-store.ts`)
   - In-memory state store (demo implementation)
   - Production would use Redis, Upstash, or database

4. **Next.js Integration** (`next.config.ts`)
   - Uses `withWorkflow()` wrapper to enable workflows

## Implementation Details

### 1. Workflow Function

```36:79:workflows/counter-actor.ts
export async function counterActor(initialState: CounterState) {
  "use workflow";

  // Get workflow metadata to use as actor ID
  const metadata = getWorkflowMetadata();
  const actorId = metadata.workflowRunId;

  console.log(`[Actor ${actorId}] Starting with initial state:`, initialState);

  // Initialize the actor's state
  await setState(actorId, initialState);

  // Create the hook outside the loop
  // The hook is an async iterator that can receive multiple events
  const receiveEvent = counterActorHook.create({
    token: `counter_actor:${actorId}`,
  });

  console.log(
    `[Actor ${actorId}] Hook created with token: counter_actor:${actorId}`
  );

  // Event loop: process events sequentially
  // The hook can be iterated over to handle multiple events
  for await (const event of receiveEvent) {
    try {
      console.log(`[Actor ${actorId}] Received event:`, event);

      // Get current state
      const state = await getState(actorId);

      // Compute new state based on the event
      const newState = await computeNewState(state, event);

      // Update state
      await setState(actorId, newState);

      console.log(`[Actor ${actorId}] State updated:`, newState);
    } catch (err) {
      console.error(`[Actor ${actorId}] Error processing event:`, err);
      // Continue processing events even if one fails
    }
  }
}
```

**Key Features:**
- ✅ Uses `"use workflow"` directive (required)
- ✅ Uses `getWorkflowMetadata()` to get unique actor ID
- ✅ Creates hook **outside the loop** (best practice)
- ✅ Uses `for await...of` pattern for multiple events
- ✅ Deterministic token based on actor ID

### 2. Type-Safe Hook Definition

```18:19:workflows/counter-actor.ts
// Define the hook once for type safety across workflow and API routes
export const counterActorHook = defineHook<CounterEvent>();
```

**Documentation Alignment:**
- ✅ Uses `defineHook()` for type safety (recommended over `createHook()`)
- ✅ Defines hook once, reuses in workflow and API routes
- ✅ Ensures payload type consistency at compile time

### 3. Hook Creation with Deterministic Token

```50:52:workflows/counter-actor.ts
  const receiveEvent = counterActorHook.create({
    token: `counter_actor:${actorId}`,
  });
```

**Documentation Alignment:**
- ✅ Uses custom deterministic token pattern
- ✅ Token format: `counter_actor:${actorId}` allows external systems to find specific actors
- ✅ Matches documentation pattern: `slack_messages:${channelId}`

### 4. Event Processing Loop

```60:78:workflows/counter-actor.ts
  for await (const event of receiveEvent) {
    try {
      console.log(`[Actor ${actorId}] Received event:`, event);

      // Get current state
      const state = await getState(actorId);

      // Compute new state based on the event
      const newState = await computeNewState(state, event);

      // Update state
      await setState(actorId, newState);

      console.log(`[Actor ${actorId}] State updated:`, newState);
    } catch (err) {
      console.error(`[Actor ${actorId}] Error processing event:`, err);
      // Continue processing events even if one fails
    }
  }
```

**Documentation Alignment:**
- ✅ Uses `for await...of` pattern (recommended for multiple events)
- ✅ Hook is reusable across multiple resumptions
- ✅ Processes events sequentially (actor pattern requirement)

### 5. Step Functions

```85:97:workflows/counter-actor.ts
async function getState(actorId: string): Promise<CounterState> {
  "use step";

  // Use the shared state store
  const storedState = actorStateStore.get(actorId);

  if (storedState) {
    return storedState;
  }

  // Return default state if not found
  return createInitialState();
}
```

```103:112:workflows/counter-actor.ts
async function setState(actorId: string, state: CounterState): Promise<void> {
  "use step";

  // Store state in the shared state store
  // This allows both the workflow and API routes to access it
  actorStateStore.set(actorId, state);

  // In production, you would also persist here:
  // await kv.set(`actor:${actorId}`, JSON.stringify(state));
}
```

**Documentation Alignment:**
- ✅ Uses `"use step"` directive for stateful operations
- ✅ Steps are durable and can be retried
- ✅ Proper separation of workflow logic and step logic

### 6. Starting Workflows

```14:31:app/api/actor/route.ts
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const initialState: CounterState =
      body.initialState ?? createInitialState();

    // Start the actor workflow
    const result = await start(counterActor, [initialState]);

    // Don't await the return value - actors run indefinitely
    // Just return the workflow run ID
    const runId = result.runId;

    return NextResponse.json({
      success: true,
      actorId: runId,
      message: "Actor started successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isFatal = error instanceof FatalError;

    return NextResponse.json(
      {
        error: message,
        fatal: isFatal,
      },
      { status: isFatal ? 400 : 500 }
    );
  }
}
```

**Documentation Alignment:**
- ✅ Uses `start()` from `workflow/api` (correct runtime function)
- ✅ Passes workflow function and arguments correctly
- ✅ Returns `runId` immediately (doesn't await completion - correct for long-running actors)

### 7. Resuming Hooks from API Routes

```8:40:app/api/actor/[actorId]/event/route.ts
export async function POST(
  request: Request,
  { params }: { params: Promise<{ actorId: string }> }
): Promise<NextResponse> {
  try {
    const { actorId } = await params;
    const body = await request.json();
    const event: CounterEvent = body.event;

    if (!event || !event.type) {
      return NextResponse.json(
        { error: "Event is required and must have a type" },
        { status: 400 }
      );
    }

    // Resume the hook with the event using the defined hook for type safety
    // The token format matches what we used in the workflow
    const token = `counter_actor:${actorId}`;
    const result = await counterActorHook.resume(token, event);

    if (result) {
      return NextResponse.json({
        success: true,
        runId: result.runId,
        message: "Event sent to actor",
      });
    } else {
      return NextResponse.json(
        { error: "Actor not found or hook invalid" },
        { status: 404 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
```

**Documentation Alignment:**
- ✅ Uses `defineHook().resume()` for type-safe resumption
- ✅ Reconstructs deterministic token from actor ID
- ✅ Handles null result (hook not found)
- ✅ Returns `runId` from resume result

### 8. Next.js Configuration

```1:8:next.config.ts
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withWorkflow(nextConfig);
```

**Documentation Alignment:**
- ✅ Uses `withWorkflow()` wrapper (required for Next.js integration)
- ✅ Enables workflow runtime in Next.js environment

## Best Practices Followed

### ✅ Type Safety
- Uses `defineHook<T>()` instead of `createHook()` for compile-time type checking
- Ensures payload types match between workflow and API routes

### ✅ Hook Creation Pattern
- Creates hook **outside the loop** (recommended pattern)
- Hook is reusable across multiple event resumptions
- More efficient than recreating hook on each iteration

### ✅ Deterministic Tokens
- Uses predictable token format: `counter_actor:${actorId}`
- Allows external systems to reliably find specific workflow instances
- Matches documentation examples (e.g., `slack_messages:${channelId}`)

### ✅ Async Iterator Pattern
- Uses `for await...of` for processing multiple events
- Hook implements `AsyncIterable` interface
- Allows sequential event processing (actor pattern requirement)

### ✅ Workflow Metadata
- Uses `getWorkflowMetadata()` to get unique `workflowRunId`
- Uses run ID as actor identifier
- Follows documentation pattern for accessing workflow context

### ✅ Step Functions
- Properly marks stateful operations with `"use step"`
- Separates workflow orchestration from step execution
- Steps are durable and retryable

### ✅ Error Handling
- Continues processing events even if one fails
- Proper error handling in API routes
- Handles `FatalError` appropriately

## Comparison with Documentation

### Patterns Matched

1. **Type-Safe Hook Definition** ✅
   - Documentation: Use `defineHook<T>()` for type safety
   - Implementation: `export const counterActorHook = defineHook<CounterEvent>()`

2. **Deterministic Token Pattern** ✅
   - Documentation: `token: \`slack_messages:${channelId}\``
   - Implementation: `token: \`counter_actor:${actorId}\``

3. **Hook Creation Outside Loop** ✅
   - Documentation: Recommended pattern for efficiency
   - Implementation: Hook created before `for await...of` loop

4. **Async Iterator Pattern** ✅
   - Documentation: `for await (const payload of hook)`
   - Implementation: `for await (const event of receiveEvent)`

5. **Workflow Metadata Usage** ✅
   - Documentation: `const metadata = getWorkflowMetadata()`
   - Implementation: Uses `metadata.workflowRunId` as actor ID

6. **Resume Hook from API Route** ✅
   - Documentation: `await approvalHook.resume(token, payload)`
   - Implementation: `await counterActorHook.resume(token, event)`

7. **Start Workflow from API Route** ✅
   - Documentation: `await start(workflow, [args])`
   - Implementation: `await start(counterActor, [initialState])`

## Potential Improvements

### 1. State Persistence
**Current:** In-memory state store (demo only)
**Production:** Should use persistent storage:
```typescript
// Example using Upstash Redis
import { Redis } from '@upstash/redis';

async function setState(actorId: string, state: CounterState): Promise<void> {
  "use step";
  const redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN });
  await redis.set(`actor:${actorId}`, JSON.stringify(state));
}
```

### 2. Error Recovery
**Current:** Basic error handling
**Production:** Could add:
- Retry logic for transient failures
- Dead letter queue for failed events
- State recovery mechanisms

### 3. Observability
**Current:** Console logging
**Production:** Could add:
- Structured logging
- Metrics collection
- Workflow run monitoring using `getRun()`

### 4. Actor Lifecycle Management
**Current:** Actors run indefinitely
**Production:** Could add:
- Actor termination logic
- Actor suspension/resumption
- Cleanup of inactive actors

### 5. Event Validation
**Current:** Basic type checking
**Production:** Could add:
- Schema validation (e.g., Zod)
- Event versioning
- Backward compatibility handling

## Documentation References

The implementation aligns with these Vercel Workflows documentation sections:

1. **Hooks & Webhooks Guide** - Type-safe hooks, async iterators
2. **Workflows and Steps Guide** - Workflow/step directives, metadata
3. **API Reference** - `defineHook()`, `getWorkflowMetadata()`, `start()`, `resumeHook()`
4. **Control Flow Patterns** - Sequential processing, event loops

## Conclusion

This repository demonstrates a **well-implemented Actor Pattern** using Vercel Workflows that closely follows the official documentation and best practices. The code:

- ✅ Uses type-safe hooks with `defineHook()`
- ✅ Follows recommended patterns (hook outside loop, async iterators)
- ✅ Implements deterministic tokens for actor identification
- ✅ Properly separates workflow and step logic
- ✅ Handles errors appropriately
- ✅ Integrates correctly with Next.js

The implementation is production-ready with the addition of persistent state storage and enhanced observability.

## Related Documentation

For integrating AI capabilities with workflows, see:
- **[AI SDK + Workflows Integration Guide](./AI_SDK_WORKFLOWS_GUIDE.md)** - Comprehensive guide on using Vercel AI SDK with workflows, including streaming, tool execution, and agent patterns

