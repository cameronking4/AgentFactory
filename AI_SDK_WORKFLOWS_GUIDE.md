# AI SDK + Vercel Workflows Integration Guide

## Overview

This guide covers best practices for integrating the **Vercel AI SDK** with **Vercel Workflows** to build durable, long-running AI agents that can survive timeouts, handle errors gracefully, and maintain state across multiple interactions.

## Key Benefits

- ✅ **Durability**: Workflows survive timeouts and server restarts
- ✅ **Automatic Retries**: Retryable errors are handled automatically
- ✅ **Error Handling**: Fatal errors can be caught and handled gracefully
- ✅ **State Management**: Maintain conversation state across long-running sessions
- ✅ **Streaming Support**: Stream AI responses to clients in real-time
- ✅ **Tool Execution**: Tools automatically become durable step functions

## 1. Basic Setup: Fetch Configuration

**Critical**: The AI SDK requires `fetch` to make HTTP requests. In workflows, you must use the workflow's `fetch` function.

```typescript
import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { fetch } from 'workflow'; // [!code highlight]

export async function aiWorkflow(userMessage: string) {
  "use workflow";

  globalThis.fetch = fetch; // [!code highlight] - Required!

  // Now AI SDK functions work correctly
  const response = await generateText({
    model: openai('gpt-4'),
    prompt: userMessage,
  });

  return response.text;
}
```

**Why this is needed**: Workflows run in a sandboxed environment. The workflow's `fetch` is automatically hoisted to step functions, making HTTP requests durable and retryable.

## 2. AI Agents with Tool Execution

### Pattern: Tools as Step Functions

The most powerful pattern is to define tools as **step functions**. This makes tool execution:
- ✅ Durable (survives restarts)
- ✅ Retryable (automatic retry on transient failures)
- ✅ Observable (tracked in workflow history)

```typescript
import { generateText, stepCountIs } from 'ai';
import { FatalError } from 'workflow';
import z from 'zod';

// Tool function marked as step
async function getWeatherInformation({ city }: { city: string }) {
  'use step'; // [!code highlight] - Makes tool execution durable

  console.log('Getting the weather for city:', city);

  // Retryable errors are automatically handled
  if (Math.random() < 0.5) {
    throw new Error('Retryable error'); // Will be retried automatically
  }

  // Fatal errors allow the agent to handle them
  if (Math.random() < 0.1) {
    throw new FatalError(
      `Try asking for the weather for Muscat instead`
    ); // Agent can catch and handle
  }

  const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
  return weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
}

export async function agent(prompt: string) {
  'use workflow';

  globalThis.fetch = fetch; // Required for AI SDK

  console.log('Agent workflow started');

  // AI SDK generateText works natively - fetches are hoisted to steps
  const { text } = await generateText({
    model: 'anthropic/claude-4-opus-20250514',
    prompt,
    tools: {
      getWeatherInformation: {
        description: 'show the weather in a given city to the user',
        inputSchema: z.object({ city: z.string() }),
        execute: getWeatherInformation, // Step function as tool
      },
    },
    // No timeout restrictions on agent loops
    stopWhen: stepCountIs(10), // Stop after 10 steps
  });

  console.log(`Agent workflow completed. Result: ${text}`);
  return text;
}
```

### Key Points:

1. **Tool functions must be step functions**: Mark with `'use step'` to make them durable
2. **Automatic retry**: Regular `Error` exceptions are retried automatically
3. **Fatal errors**: Use `FatalError` for non-retryable errors that the agent should handle
4. **No timeout limits**: Agent loops can run indefinitely (controlled by `stopWhen`)

## 3. Streaming AI Responses

### Pattern: Streaming with Writable Streams

For real-time UI updates, use `getWritable()` to stream AI responses:

```typescript
import { getWritable } from 'workflow';
import { generateId, streamText, type UIMessageChunk } from 'ai';
import { fetch } from 'workflow';

export async function chat(messages: UIMessage[]) {
  'use workflow';

  globalThis.fetch = fetch; // Required

  // Get typed writable stream for UI message chunks
  const writable = getWritable<UIMessageChunk>(); // [!code highlight]

  // Start the stream
  await startStream(writable);

  let currentMessages = [...messages];

  // Process messages in steps (multi-turn conversation)
  for (let i = 0; i < MAX_STEPS; i++) {
    const result = await streamTextStep(currentMessages, writable);
    currentMessages.push(result.messages);

    if (result.finishReason !== 'tool-calls') {
      break;
    }
  }

  // End the stream
  await endStream(writable);
}

async function startStream(writable: WritableStream<UIMessageChunk>) {
  'use step';

  const writer = writable.getWriter();

  // Send start message
  writer.write({
    type: 'start',
    messageMetadata: {
      createdAt: Date.now(),
      messageId: generateId(),
    },
  });

  writer.releaseLock();
}

async function streamTextStep(
  messages: UIMessage[],
  writable: WritableStream<UIMessageChunk>
) {
  'use step';

  const writer = writable.getWriter();

  // Call streamText from the AI SDK
  const result = streamText({
    model: 'gpt-4',
    messages,
    /* other options */
  });

  // Pipe the AI stream into the writable stream
  const reader = result
    .toUIMessageStream({ sendStart: false, sendFinish: false })
    .getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await writer.write(value);
  }

  reader.releaseLock();
  writer.close();
  writer.releaseLock();

  return result;
}

async function endStream(writable: WritableStream<UIMessageChunk>) {
  'use step';

  const writer = writable.getWriter();
  writer.close();
  writer.releaseLock();
}
```

### Consuming the Stream (from API route):

```typescript
import { getRun } from 'workflow/api';

// Get the workflow run
const run = getRun(runId);

// Get the readable stream
const stream = run.getReadable<UIMessageChunk>();

// Stream to client
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});
```

## 4. Error Handling Patterns

### Retryable vs Fatal Errors

```typescript
import { FatalError } from 'workflow';

async function apiCall() {
  'use step';

  try {
    const response = await fetch('https://api.example.com/data');
    
    if (!response.ok) {
      // Transient error - will be retried automatically
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      // Permanent error - agent should handle
      if (response.status === 404) {
        throw new FatalError('Resource not found');
      }
    }
    
    return await response.json();
  } catch (error) {
    // Network errors are automatically retried
    if (error instanceof TypeError) {
      throw error; // Will be retried
    }
    
    // Re-throw fatal errors
    if (error instanceof FatalError) {
      throw error;
    }
    
    // Other errors are retried by default
    throw error;
  }
}
```

## 5. Multi-Step Agent Loops

### Pattern: Controlled Agent Execution

```typescript
import { generateText, stepCountIs } from 'ai';
import { fetch } from 'workflow';

export async function multiStepAgent(prompt: string) {
  'use workflow';

  globalThis.fetch = fetch;

  const result = await generateText({
    model: openai('gpt-4'),
    prompt,
    tools: {
      searchWeb: { /* ... */ },
      analyzeData: { /* ... */ },
      generateReport: { /* ... */ },
    },
    // Control agent execution
    stopWhen: stepCountIs(10), // Max 10 steps
    // Or use custom logic:
    // stopWhen: async ({ steps }) => {
    //   return steps.length >= 10 || 
    //          steps.at(-1)?.finishReason === 'stop';
    // },
  });

  return result.text;
}
```

## 6. Integration with Actor Pattern

### Combining Actors with AI Agents

You can combine the actor pattern (from this repo) with AI agents:

```typescript
import { defineHook, getWorkflowMetadata } from 'workflow';
import { generateText, stepCountIs } from 'ai';
import { fetch } from 'workflow';
import { openai } from '@ai-sdk/openai';

export const aiAgentHook = defineHook<{ message: string }>();

export async function aiActorAgent(initialPrompt: string) {
  'use workflow';

  globalThis.fetch = fetch;

  const metadata = getWorkflowMetadata();
  const actorId = metadata.workflowRunId;

  // Initialize conversation state
  let conversationHistory = [
    { role: 'user' as const, content: initialPrompt }
  ];

  // Create hook for receiving messages
  const receiveMessage = aiAgentHook.create({
    token: `ai_agent:${actorId}`,
  });

  // Event loop: process messages sequentially
  for await (const event of receiveMessage) {
    try {
      // Add user message to history
      conversationHistory.push({
        role: 'user' as const,
        content: event.message,
      });

      // Generate AI response
      const result = await generateText({
        model: openai('gpt-4'),
        messages: conversationHistory,
        tools: {
          // Define tools as step functions
          getWeather: {
            description: 'Get weather information',
            inputSchema: z.object({ city: z.string() }),
            execute: async ({ city }) => {
              'use step';
              // Tool implementation
            },
          },
        },
        stopWhen: stepCountIs(5),
      });

      // Add AI response to history
      conversationHistory.push({
        role: 'assistant' as const,
        content: result.text,
      });

      // Store updated state
      await saveConversationState(actorId, conversationHistory);
    } catch (err) {
      console.error(`[Agent ${actorId}] Error:`, err);
      // Continue processing even if one message fails
    }
  }
}
```

## 7. Best Practices Summary

### ✅ DO:

1. **Always set `globalThis.fetch = fetch`** at the start of workflow functions using AI SDK
2. **Mark tool functions as step functions** with `'use step'` for durability
3. **Use `FatalError`** for non-retryable errors that agents should handle
4. **Use `stopWhen`** to control agent execution limits
5. **Stream responses** using `getWritable<UIMessageChunk>()` for real-time UI updates
6. **Combine with actor pattern** for stateful, long-running agents

### ❌ DON'T:

1. **Don't use regular `fetch`** - always use workflow's `fetch`
2. **Don't mark tool functions as workflow functions** - they should be step functions
3. **Don't forget error handling** - distinguish between retryable and fatal errors
4. **Don't run agents indefinitely** - use `stopWhen` to set limits
5. **Don't read streams in workflow functions** - delegate to step functions

## 8. Complete Example: Durable Chat Agent

```typescript
import { defineHook, getWorkflowMetadata, fetch } from 'workflow';
import { generateText, streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getWritable } from 'workflow';
import type { UIMessageChunk } from 'ai';
import z from 'zod';

export const chatHook = defineHook<{ message: string }>();

export async function durableChatAgent(initialMessage: string) {
  'use workflow';

  globalThis.fetch = fetch; // Required!

  const metadata = getWorkflowMetadata();
  const agentId = metadata.workflowRunId;

  // Initialize conversation
  let messages = [
    { role: 'user' as const, content: initialMessage }
  ];

  // Create stream for real-time updates
  const writable = getWritable<UIMessageChunk>();

  // Create hook for receiving messages
  const receiveMessage = chatHook.create({
    token: `chat_agent:${agentId}`,
  });

  // Start streaming
  await startStream(writable, agentId);

  // Event loop
  for await (const event of receiveMessage) {
    try {
      // Add user message
      messages.push({
        role: 'user' as const,
        content: event.message,
      });

      // Stream AI response
      await streamResponse(messages, writable);

      // Update messages with AI response
      // (In real implementation, extract from stream)
    } catch (err) {
      console.error(`[Agent ${agentId}] Error:`, err);
    }
  }

  // End stream
  await endStream(writable);
}

async function startStream(
  writable: WritableStream<UIMessageChunk>,
  agentId: string
) {
  'use step';
  const writer = writable.getWriter();
  writer.write({
    type: 'start',
    messageMetadata: {
      createdAt: Date.now(),
      messageId: `msg_${agentId}`,
    },
  });
  writer.releaseLock();
}

async function streamResponse(
  messages: any[],
  writable: WritableStream<UIMessageChunk>
) {
  'use step';

  const result = streamText({
    model: openai('gpt-4'),
    messages,
    tools: {
      getWeather: {
        description: 'Get weather information',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          'use step';
          // Tool implementation
          return `Weather in ${city}: Sunny, 72°F`;
        },
      },
    },
    stopWhen: stepCountIs(5),
  });

  const writer = writable.getWriter();
  const reader = result
    .toUIMessageStream({ sendStart: false, sendFinish: false })
    .getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await writer.write(value);
  }

  reader.releaseLock();
  writer.releaseLock();
}

async function endStream(writable: WritableStream<UIMessageChunk>) {
  'use step';
  const writer = writable.getWriter();
  writer.close();
  writer.releaseLock();
}
```

## 9. API Route Integration

### Starting an AI Agent Workflow

```typescript
// app/api/chat/route.ts
import { start } from 'workflow/api';
import { durableChatAgent } from '@/workflows/durable-chat-agent';

export async function POST(request: Request) {
  const { message } = await request.json();

  // Start the agent workflow
  const run = await start(durableChatAgent, [message]);

  return Response.json({
    agentId: run.runId,
    message: 'Agent started',
  });
}
```

### Sending Messages to Agent

```typescript
// app/api/chat/[agentId]/message/route.ts
import { chatHook } from '@/workflows/durable-chat-agent';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { message } = await request.json();

  // Resume the agent with new message
  const result = await chatHook.resume(`chat_agent:${agentId}`, {
    message,
  });

  if (!result) {
    return Response.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  return Response.json({ success: true });
}
```

### Streaming Agent Responses

```typescript
// app/api/chat/[agentId]/stream/route.ts
import { getRun } from 'workflow/api';
import type { UIMessageChunk } from 'ai';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const run = getRun(agentId);
  const stream = run.getReadable<UIMessageChunk>();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

## 10. Comparison with Current Implementation

### Current Actor Pattern (Counter)
- ✅ Uses hooks for event-driven communication
- ✅ Maintains state between events
- ✅ Processes events sequentially

### Enhanced with AI SDK
- ✅ Add AI capabilities to actors
- ✅ Stream responses in real-time
- ✅ Execute tools durably
- ✅ Handle errors gracefully
- ✅ Support multi-turn conversations

## References

- [Vercel Workflows Documentation](https://vercel.com/docs/workflows)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Workflows + AI SDK Integration](https://github.com/vercel/workflow/blob/main/docs/content/docs/errors/fetch-in-workflow.mdx)

