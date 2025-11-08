import { defineHook, getWorkflowMetadata, fetch } from "workflow";
import { generateText } from "ai";
import { actorStateStore } from "@/lib/actor-state-store";
import 'dotenv/config';

// Define the actor's state
export interface CounterState {
  count: number;
  lastUpdated: string;
  history: Array<{ timestamp: string; action: string; count: number }>;
  aiResponse?: string; // Store AI-generated text
}

// Define events that can be sent to the actor
export type CounterEvent =
  | { type: "increment"; amount?: number }
  | { type: "decrement"; amount?: number }
  | { type: "reset" }
  | { type: "getState" }
  | { type: "generateText"; prompt: string };

// Define the hook once for type safety across workflow and API routes
export const counterActorHook = defineHook<CounterEvent>();

// Initial state factory
export function createInitialState(): CounterState {
  return {
    count: 0,
    lastUpdated: new Date().toISOString(),
    history: [],
  };
}

/**
 * Actor pattern implementation using Vercel Workflows.
 *
 * The actor maintains its own state and processes events sequentially.
 * Each workflow run acts as a unique actor instance identified by its workflowRunId.
 */
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

/**
 * Retrieves the current state of the actor.
 * In a real implementation, this would fetch from a database or KV store.
 */
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

/**
 * Persists the actor's state.
 * In a real implementation, this would save to a database or KV store.
 */
async function setState(actorId: string, state: CounterState): Promise<void> {
  "use step";

  // Store state in the shared state store
  // This allows both the workflow and API routes to access it
  actorStateStore.set(actorId, state);

  // In production, you would also persist here:
  // await kv.set(`actor:${actorId}`, JSON.stringify(state));
}

/**
 * Computes the new state based on the current state and an event.
 * This implements the state transition logic for the actor.
 */
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

/**
 * Generates text using AI SDK based on a prompt and current actor state.
 * This is a step function, making it durable and retryable.
 */
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
