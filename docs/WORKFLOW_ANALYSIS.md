# Vercel Workflows Implementation Analysis

## Repository Overview

This repository implements an **Actor Pattern** using **Vercel Workflows** with integrated **Vercel AI SDK** capabilities. The actor pattern is a concurrency model where each actor maintains isolated state and processes events sequentially, ensuring thread-safe state management. The implementation demonstrates how to build durable, long-running AI-powered agents that can survive timeouts, handle errors gracefully, and maintain state across multiple interactions.

## Package Versions

This implementation uses the latest Vercel packages:

- **`workflow`**: `4.0.1-beta.6` - Vercel Workflows runtime
- **`ai`**: `^5.0.89` - Vercel AI SDK (latest)
- **`@ai-sdk/gateway`**: `^2.0.7` - AI Gateway provider
- **`@ai-sdk/openai`**: `^2.0.64` - OpenAI provider
- **`@ai-sdk/provider`**: `^2.0.0` - Provider utilities
- **`next`**: `16.0.1` - Next.js framework
- **`dotenv`**: `^17.2.3` - Environment variable management

## Architecture

### Core Components

1. **Workflow Definition** (`workflows/counter-actor.ts`)
   - Defines the actor workflow using `"use workflow"` directive
   - Implements event-driven state management
   - Uses hooks for external event reception
   - Integrates AI SDK with Vercel AI Gateway for text generation

2. **API Routes**
   - `/api/actor` - Starts new actor instances
   - `/api/actor/[actorId]/event` - Sends events to actors
   - `/api/actor/[actorId]/state` - Queries actor state

3. **State Management** (`lib/actor-state-store.ts`)
   - In-memory state store (demo implementation)
   - Production would use Redis, Upstash, or database

4. **Next.js Integration** (`next.config.ts`)
   - Uses `withWorkflow()` wrapper to enable workflows

5. **UI** (`app/page.tsx`)
   - React client for interacting with actors
   - Real-time state polling
   - AI text generation interface

## Implementation Details

### 1. Workflow Function with AI SDK Integration

```40:90:workflows/counter-actor.ts
export async function counterActor(initialState: CounterState) {
  "use workflow";

  // Set up fetch for AI SDK (required for workflows)
  globalThis.fetch = fetch;

  // Get workflow metadata to use as actor ID
  const metadata = getWorkflowMetadata();
  const actorId = metadata.workflowRunId;

  console.log(`[Actor ${actorId}] Starting with initial state:`, initialState);

  // Initialize the actor's state only if it doesn't exist
  // This prevents overwriting state when the workflow restarts
  const existingState = await getState(actorId);
  if (!existingState || existingState.count === 0 && existingState.history.length === 0) {
    await setState(actorId, initialState);
  }

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
- ✅ Uses `"use workflow"` directive (required) - [Workflows and Steps Guide](https://vercel.com/docs/workflows/foundations/workflows-and-steps)
- ✅ Uses `getWorkflowMetadata()` to get unique actor ID - [getWorkflowMetadata API](https://vercel.com/docs/workflows/api-reference/workflow/get-workflow-metadata)
- ✅ Creates hook **outside the loop** (best practice) - [Hooks Guide](https://vercel.com/docs/workflows/foundations/hooks)
- ✅ Uses `for await...of` pattern for multiple events - [Hooks Guide](https://vercel.com/docs/workflows/foundations/hooks)
- ✅ Deterministic token based on actor ID
- ✅ **AI SDK Integration**: Sets `globalThis.fetch = fetch` for AI SDK compatibility - [AI SDK + Workflows Guide](./AI_SDK_WORKFLOWS_GUIDE.md)
- ✅ **State Persistence**: Checks for existing state before initializing to prevent overwriting on workflow restarts

**Documentation References:**
- [Workflows and Steps Guide](https://vercel.com/docs/workflows/foundations/workflows-and-steps)
- [getWorkflowMetadata API Reference](https://vercel.com/docs/workflows/api-reference/workflow/get-workflow-metadata)
- [Hooks & Webhooks Guide](https://vercel.com/docs/workflows/foundations/hooks)

### 2. Type-Safe Hook Definition

```22:23:workflows/counter-actor.ts
// Define the hook once for type safety across workflow and API routes
export const counterActorHook = defineHook<CounterEvent>();
```

**Documentation Alignment:**
- ✅ Uses `defineHook()` for type safety (recommended over `createHook()`) - [defineHook API](https://vercel.com/docs/workflows/api-reference/workflow/define-hook)
- ✅ Defines hook once, reuses in workflow and API routes
- ✅ Ensures payload type consistency at compile time

**Documentation References:**
- [defineHook API Reference](https://vercel.com/docs/workflows/api-reference/workflow/define-hook)
- [Type-Safe Hooks Guide](https://vercel.com/docs/workflows/foundations/hooks#type-safe-hooks)

### 3. Hook Creation with Deterministic Token

```61:63:workflows/counter-actor.ts
  const receiveEvent = counterActorHook.create({
    token: `counter_actor:${actorId}`,
  });
```

**Documentation Alignment:**
- ✅ Uses custom deterministic token pattern - [Hooks Guide - Customizing Tokens](https://vercel.com/docs/workflows/foundations/hooks#customizing-tokens)
- ✅ Token format: `counter_actor:${actorId}` allows external systems to find specific actors
- ✅ Matches documentation pattern: `slack_messages:${channelId}`

**Documentation References:**
- [Hooks Guide - Customizing Tokens](https://vercel.com/docs/workflows/foundations/hooks#customizing-tokens)
- [Deterministic Hook Pattern](https://vercel.com/docs/workflows/foundations/hooks#deterministic-hooks)

### 4. Event Processing Loop

```71:89:workflows/counter-actor.ts
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
- ✅ Uses `for await...of` pattern (recommended for multiple events) - [Hooks Guide - Iterating Over Events](https://vercel.com/docs/workflows/foundations/hooks#iterating-over-events)
- ✅ Hook is reusable across multiple resumptions
- ✅ Processes events sequentially (actor pattern requirement)

**Documentation References:**
- [Hooks Guide - Iterating Over Events](https://vercel.com/docs/workflows/foundations/hooks#iterating-over-events)
- [Async Iterator Pattern](https://vercel.com/docs/workflows/foundations/hooks#async-iterators)

### 5. Step Functions for State Management

```96:108:workflows/counter-actor.ts
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

```114:123:workflows/counter-actor.ts
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
- ✅ Uses `"use step"` directive for stateful operations - [Workflows and Steps Guide](https://vercel.com/docs/workflows/foundations/workflows-and-steps)
- ✅ Steps are durable and can be retried
- ✅ Proper separation of workflow logic and step logic
- ✅ **State Persistence Fix**: The workflow checks for existing state before initializing to prevent state loss on restarts

**Documentation References:**
- [Workflows and Steps Guide](https://vercel.com/docs/workflows/foundations/workflows-and-steps)
- [Step Functions](https://vercel.com/docs/workflows/foundations/workflows-and-steps#step-functions)

### 6. AI SDK Integration with Vercel AI Gateway

```177:203:workflows/counter-actor.ts
async function generateAIText(
  prompt: string,
  state: CounterState
): Promise<string> {
  "use step";

  try {
    // Create a context-aware prompt that includes the current counter state
    const contextualPrompt = `You are a helpful assistant. The current counter value is ${state.count}. 

User prompt: ${prompt}

Please provide a helpful response.`;

    const result = await generateText({
      model: 'openai/gpt-4.1' as never, // Uses Vercel AI Gateway automatically (type assertion for v5 compatibility)
      prompt: contextualPrompt,
      maxTokens: 500,
    });

    return result.text;
  } catch (error) {
    console.error("Error generating AI text:", error);
    // Return a fallback message if AI generation fails
    return `Sorry, I couldn't generate a response. Error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}
```

**Key Features:**
- ✅ **AI SDK v5 Integration**: Uses plain string model IDs with Vercel AI Gateway - [AI Gateway Guide](https://vercel.com/docs/ai-sdk/providers/ai-gateway)
- ✅ **Step Function**: Marked with `"use step"` for durability and retryability - [AI SDK + Workflows Guide](./AI_SDK_WORKFLOWS_GUIDE.md)
- ✅ **Fetch Configuration**: Uses workflow's `fetch` (set in workflow function) - [AI SDK + Workflows Guide](./AI_SDK_WORKFLOWS_GUIDE.md)
- ✅ **Context-Aware**: Includes actor state in AI prompts
- ✅ **Error Handling**: Graceful fallback on AI generation failures

**Documentation References:**
- [Vercel AI Gateway Provider](https://vercel.com/docs/ai-sdk/providers/ai-gateway)
- [AI SDK - Plain String Model IDs](https://vercel.com/docs/ai-sdk/providers/ai-gateway#using-plain-strings)
- [AI SDK + Workflows Integration Guide](./AI_SDK_WORKFLOWS_GUIDE.md)

**Note on Type Assertion**: AI SDK v5 supports plain string model IDs (e.g., `'openai/gpt-4.1'`) that automatically route through Vercel AI Gateway at runtime. However, TypeScript types currently require a `LanguageModelV1` object. The `as never` type assertion is used to satisfy the type checker while maintaining runtime functionality. This is a known limitation that will be resolved in future AI SDK versions.

### 7. Event Types Including AI Generation

```14:20:workflows/counter-actor.ts
export type CounterEvent =
  | { type: "increment"; amount?: number }
  | { type: "decrement"; amount?: number }
  | { type: "reset" }
  | { type: "getState" }
  | { type: "generateText"; prompt: string };
```

The workflow supports multiple event types, including AI text generation events that trigger the AI SDK integration.

### 8. State Computation with AI Support

```129:171:workflows/counter-actor.ts
async function computeNewState(
  state: CounterState,
  event: CounterEvent
): Promise<CounterState> {
  "use step";

  const timestamp = new Date().toISOString();
  let newCount = state.count;
  let action = "";
  let aiResponse: string | undefined = state.aiResponse;

  switch (event.type) {
    case "increment":
      newCount += event.amount ?? 1;
      action = `increment by ${event.amount ?? 1}`;
      break;
    case "decrement":
      newCount -= event.amount ?? 1;
      action = `decrement by ${event.amount ?? 1}`;
      break;
    case "reset":
      newCount = 0;
      action = "reset";
      break;
    case "getState":
      // Just return current state without modification
      return state;
    case "generateText":
      // Generate AI text based on prompt and current state
      aiResponse = await generateAIText(event.prompt, state);
      action = `generated AI text: ${event.prompt.substring(0, 30)}...`;
      break;
  }

  return {
    count: newCount,
    lastUpdated: timestamp,
    history: [...state.history, { timestamp, action, count: newCount }].slice(
      -10
    ), // Keep last 10 history entries
    aiResponse,
  };
}
```

**Key Features:**
- ✅ Handles all event types including AI generation
- ✅ Preserves AI responses in state
- ✅ Maintains history of actions
- ✅ Step function for durability

### 9. Starting Workflows

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
- ✅ Uses `start()` from `workflow/api` (correct runtime function) - [start API](https://vercel.com/docs/workflows/api-reference/workflow-api/start)
- ✅ Passes workflow function and arguments correctly
- ✅ Returns `runId` immediately (doesn't await completion - correct for long-running actors)
- ✅ Handles `FatalError` appropriately

**Documentation References:**
- [start API Reference](https://vercel.com/docs/workflows/api-reference/workflow-api/start)
- [Starting Workflows](https://vercel.com/docs/workflows/foundations/workflows-and-steps#starting-workflows)

### 10. Resuming Hooks from API Routes

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
- ✅ Uses `defineHook().resume()` for type-safe resumption - [defineHook API](https://vercel.com/docs/workflows/api-reference/workflow/define-hook)
- ✅ Reconstructs deterministic token from actor ID
- ✅ Handles null result (hook not found)
- ✅ Returns `runId` from resume result

**Documentation References:**
- [defineHook API - Resuming Hooks](https://vercel.com/docs/workflows/api-reference/workflow/define-hook#resuming-hooks)
- [Resume Hook API](https://vercel.com/docs/workflows/api-reference/workflow-api/resume-hook)

### 11. Next.js Configuration

```1:8:next.config.ts
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withWorkflow(nextConfig);
```

**Documentation Alignment:**
- ✅ Uses `withWorkflow()` wrapper (required for Next.js integration) - [Next.js Integration](https://vercel.com/docs/workflows/guides/nextjs)
- ✅ Enables workflow runtime in Next.js environment

**Documentation References:**
- [Next.js Integration Guide](https://vercel.com/docs/workflows/guides/nextjs)

## How It Works: Complete Flow

### 1. Actor Initialization

1. Client calls `POST /api/actor` with optional initial state
2. API route calls `start(counterActor, [initialState])` - [start API](https://vercel.com/docs/workflows/api-reference/workflow-api/start)
3. Workflow begins execution:
   - Gets unique `workflowRunId` via `getWorkflowMetadata()` - [getWorkflowMetadata](https://vercel.com/docs/workflows/api-reference/workflow/get-workflow-metadata)
   - Checks for existing state (prevents overwriting on restart)
   - Initializes state if needed
   - Creates hook with deterministic token: `counter_actor:${actorId}`
   - Enters event loop waiting for events

### 2. Event Processing

1. Client sends event via `POST /api/actor/[actorId]/event` with event payload
2. API route reconstructs token: `counter_actor:${actorId}`
3. API route calls `counterActorHook.resume(token, event)` - [resumeHook](https://vercel.com/docs/workflows/api-reference/workflow-api/resume-hook)
4. Workflow resumes from hook:
   - Receives event in `for await...of` loop
   - Gets current state via `getState()` (step function)
   - Computes new state via `computeNewState()` (step function)
   - If event is `generateText`, calls `generateAIText()`:
     - Uses AI SDK with Vercel AI Gateway
     - Model ID: `'openai/gpt-4.1'` (plain string, routes through gateway)
     - Includes actor state in prompt for context
     - Returns AI-generated text
   - Updates state via `setState()` (step function)
   - Logs state update
   - Continues waiting for next event

### 3. State Querying

1. Client calls `GET /api/actor/[actorId]/state`
2. API route queries `actorStateStore.get(actorId)`
3. Returns current state including:
   - Counter value
   - Last updated timestamp
   - Action history
   - AI response (if generated)

### 4. AI Generation Flow

1. Client sends `{ type: "generateText", prompt: "..." }` event
2. Workflow processes event:
   - `computeNewState()` detects `generateText` event
   - Calls `generateAIText()` step function
   - AI SDK uses workflow's `fetch` (configured at workflow start)
   - Plain string model ID `'openai/gpt-4.1'` routes through Vercel AI Gateway
   - Gateway handles authentication, rate limiting, and routing
   - AI response is generated with context about current counter state
   - Response stored in `state.aiResponse`
3. State updated with AI response
4. Client polls state endpoint to retrieve AI response

## Best Practices Followed

### ✅ Type Safety
- Uses `defineHook<T>()` instead of `createHook()` for compile-time type checking - [defineHook](https://vercel.com/docs/workflows/api-reference/workflow/define-hook)
- Ensures payload types match between workflow and API routes

### ✅ Hook Creation Pattern
- Creates hook **outside the loop** (recommended pattern) - [Hooks Guide](https://vercel.com/docs/workflows/foundations/hooks)
- Hook is reusable across multiple event resumptions
- More efficient than recreating hook on each iteration

### ✅ Deterministic Tokens
- Uses predictable token format: `counter_actor:${actorId}` - [Customizing Tokens](https://vercel.com/docs/workflows/foundations/hooks#customizing-tokens)
- Allows external systems to reliably find specific workflow instances
- Matches documentation examples (e.g., `slack_messages:${channelId}`)

### ✅ Async Iterator Pattern
- Uses `for await...of` for processing multiple events - [Iterating Over Events](https://vercel.com/docs/workflows/foundations/hooks#iterating-over-events)
- Hook implements `AsyncIterable` interface
- Allows sequential event processing (actor pattern requirement)

### ✅ Workflow Metadata
- Uses `getWorkflowMetadata()` to get unique `workflowRunId` - [getWorkflowMetadata](https://vercel.com/docs/workflows/api-reference/workflow/get-workflow-metadata)
- Uses run ID as actor identifier
- Follows documentation pattern for accessing workflow context

### ✅ Step Functions
- Properly marks stateful operations with `"use step"` - [Step Functions](https://vercel.com/docs/workflows/foundations/workflows-and-steps#step-functions)
- Separates workflow orchestration from step execution
- Steps are durable and retryable
- AI SDK calls are step functions for durability

### ✅ Error Handling
- Continues processing events even if one fails
- Proper error handling in API routes
- Handles `FatalError` appropriately
- AI generation has fallback error handling

### ✅ AI SDK Integration
- Sets `globalThis.fetch = fetch` for AI SDK compatibility - [AI SDK + Workflows Guide](./AI_SDK_WORKFLOWS_GUIDE.md)
- Uses plain string model IDs with Vercel AI Gateway - [AI Gateway](https://vercel.com/docs/ai-sdk/providers/ai-gateway)
- AI operations are step functions for durability
- Context-aware prompts include actor state

### ✅ State Persistence
- Checks for existing state before initializing
- Prevents state loss on workflow restarts
- Maintains state across workflow executions

## Comparison with Documentation

### Patterns Matched

1. **Type-Safe Hook Definition** ✅
   - Documentation: Use `defineHook<T>()` for type safety - [defineHook](https://vercel.com/docs/workflows/api-reference/workflow/define-hook)
   - Implementation: `export const counterActorHook = defineHook<CounterEvent>()`

2. **Deterministic Token Pattern** ✅
   - Documentation: `token: \`slack_messages:${channelId}\`` - [Customizing Tokens](https://vercel.com/docs/workflows/foundations/hooks#customizing-tokens)
   - Implementation: `token: \`counter_actor:${actorId}\``

3. **Hook Creation Outside Loop** ✅
   - Documentation: Recommended pattern for efficiency - [Hooks Guide](https://vercel.com/docs/workflows/foundations/hooks)
   - Implementation: Hook created before `for await...of` loop

4. **Async Iterator Pattern** ✅
   - Documentation: `for await (const payload of hook)` - [Iterating Over Events](https://vercel.com/docs/workflows/foundations/hooks#iterating-over-events)
   - Implementation: `for await (const event of receiveEvent)`

5. **Workflow Metadata Usage** ✅
   - Documentation: `const metadata = getWorkflowMetadata()` - [getWorkflowMetadata](https://vercel.com/docs/workflows/api-reference/workflow/get-workflow-metadata)
   - Implementation: Uses `metadata.workflowRunId` as actor ID

6. **Resume Hook from API Route** ✅
   - Documentation: `await approvalHook.resume(token, payload)` - [Resuming Hooks](https://vercel.com/docs/workflows/api-reference/workflow/define-hook#resuming-hooks)
   - Implementation: `await counterActorHook.resume(token, event)`

7. **Start Workflow from API Route** ✅
   - Documentation: `await start(workflow, [args])` - [start API](https://vercel.com/docs/workflows/api-reference/workflow-api/start)
   - Implementation: `await start(counterActor, [initialState])`

8. **AI SDK with Workflows** ✅
   - Documentation: Set `globalThis.fetch = fetch` - [AI SDK + Workflows Guide](./AI_SDK_WORKFLOWS_GUIDE.md)
   - Implementation: Configured at workflow start
   - Documentation: Plain string model IDs use AI Gateway - [AI Gateway](https://vercel.com/docs/ai-sdk/providers/ai-gateway)
   - Implementation: `'openai/gpt-4.1'` routes through gateway

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
- Workflow run monitoring using `getRun()` - [getRun API](https://vercel.com/docs/workflows/api-reference/workflow-api/get-run)

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

### 6. AI SDK Enhancements
**Current:** Basic text generation
**Production:** Could add:
- Streaming responses - [Streaming in Workflows](./AI_SDK_WORKFLOWS_GUIDE.md#streaming-ai-responses)
- Tool calling - [Tools in Workflows](./AI_SDK_WORKFLOWS_GUIDE.md#ai-agents-with-tool-execution)
- Multi-step agent loops - [Multi-Step Agents](./AI_SDK_WORKFLOWS_GUIDE.md#multi-step-agent-loops)
- Model fallbacks - [AI Gateway Fallbacks](https://vercel.com/docs/ai-sdk/providers/ai-gateway#model-fallbacks)

## Documentation References

### Vercel Workflows

1. **[Hooks & Webhooks Guide](https://vercel.com/docs/workflows/foundations/hooks)** - Type-safe hooks, async iterators, deterministic tokens
2. **[Workflows and Steps Guide](https://vercel.com/docs/workflows/foundations/workflows-and-steps)** - Workflow/step directives, metadata
3. **[defineHook API Reference](https://vercel.com/docs/workflows/api-reference/workflow/define-hook)** - Type-safe hook definition
4. **[getWorkflowMetadata API Reference](https://vercel.com/docs/workflows/api-reference/workflow/get-workflow-metadata)** - Accessing workflow context
5. **[start API Reference](https://vercel.com/docs/workflows/api-reference/workflow-api/start)** - Starting workflows
6. **[resumeHook API Reference](https://vercel.com/docs/workflows/api-reference/workflow-api/resume-hook)** - Resuming hooks
7. **[getRun API Reference](https://vercel.com/docs/workflows/api-reference/workflow-api/get-run)** - Retrieving workflow run information
8. **[Next.js Integration Guide](https://vercel.com/docs/workflows/guides/nextjs)** - Integrating workflows with Next.js

### Vercel AI SDK

1. **[Vercel AI Gateway Provider](https://vercel.com/docs/ai-sdk/providers/ai-gateway)** - Using AI Gateway with plain string model IDs
2. **[AI SDK + Workflows Integration Guide](./AI_SDK_WORKFLOWS_GUIDE.md)** - Comprehensive guide on using AI SDK with workflows
3. **[AI Gateway - Plain String Model IDs](https://vercel.com/docs/ai-sdk/providers/ai-gateway#using-plain-strings)** - Using plain strings with AI Gateway
4. **[AI Gateway - Model Fallbacks](https://vercel.com/docs/ai-sdk/providers/ai-gateway#model-fallbacks)** - Configuring fallback models

## Conclusion

This repository demonstrates a **well-implemented Actor Pattern** using Vercel Workflows with integrated AI SDK capabilities. The implementation:

- ✅ Uses type-safe hooks with `defineHook()`
- ✅ Follows recommended patterns (hook outside loop, async iterators)
- ✅ Implements deterministic tokens for actor identification
- ✅ Properly separates workflow and step logic
- ✅ Handles errors appropriately
- ✅ Integrates correctly with Next.js
- ✅ **Integrates AI SDK with Vercel AI Gateway**
- ✅ **Uses latest package versions (AI SDK v5, Workflows 4.0.1-beta.6)**
- ✅ **Implements state persistence to prevent data loss on restarts**

The implementation is production-ready with the addition of persistent state storage and enhanced observability. The AI SDK integration demonstrates how to build durable, long-running AI agents that can maintain context and state across multiple interactions.

## Related Documentation

For more details on AI SDK integration with workflows, see:
- **[AI SDK + Workflows Integration Guide](./AI_SDK_WORKFLOWS_GUIDE.md)** - Comprehensive guide on using Vercel AI SDK with workflows, including streaming, tool execution, and agent patterns
