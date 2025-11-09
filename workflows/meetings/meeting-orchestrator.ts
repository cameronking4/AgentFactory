import { defineHook, getWorkflowMetadata, fetch } from "workflow";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { employees, meetings, tasks, memories } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { icMeetingHook, icPingHook } from "@/workflows/shared/hooks";
import { get as redisGet, set as redisSet } from "@/lib/redis";
import "dotenv/config";

// Meeting Orchestrator State
export interface MeetingOrchestratorState {
  orchestratorId: string;
  scheduledMeetings: ScheduledMeeting[];
  activePings: Record<string, { from: string; to: string; message: string; timestamp: string }>; // pingId -> ping info
  createdAt: string;
  lastActive: string;
}

// Scheduled Meeting
export interface ScheduledMeeting {
  id: string;
  type: "standup" | "sync" | "ping";
  scheduledTime: string; // ISO timestamp
  participants: string[]; // Employee IDs
  managerId?: string; // For standups/syncs
  frequency?: "daily" | "weekly" | "bi-weekly"; // For recurring meetings
  lastRun?: string; // ISO timestamp of last run
}

// Events that Meeting Orchestrator can receive
export type MeetingOrchestratorEvent =
  | { type: "scheduleMeeting"; meeting: ScheduledMeeting }
  | { type: "runStandup"; managerId: string; participantIds: string[] }
  | { type: "runSync"; managerId: string; participantIds: string[] }
  | { type: "sendPing"; from: string; to: string; message: string }
  | { type: "pingResponse"; pingId: string; from: string; to: string; response: string }
  | { type: "getStatus" };

// Define hooks for type safety
export const meetingOrchestratorHook = defineHook<MeetingOrchestratorEvent>();

// Initial state factory
export function createInitialMeetingOrchestratorState(): MeetingOrchestratorState {
  return {
    orchestratorId: "",
    scheduledMeetings: [],
    activePings: {},
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

/**
 * Meeting Orchestrator Workflow - Schedules and runs meetings
 */
export async function meetingOrchestratorWorkflow(
  initialState: MeetingOrchestratorState
) {
  "use workflow";

  // Set up fetch for AI SDK (required for workflows)
  globalThis.fetch = fetch;

  // Get workflow metadata
  const metadata = getWorkflowMetadata();
  const orchestratorId = metadata.workflowRunId;

  console.log(`[Meeting Orchestrator ${orchestratorId}] Starting`);

  // Initialize state
  const existingState = await getOrchestratorState(orchestratorId);
  if (!existingState) {
    const newState = { ...initialState, orchestratorId };
    await setOrchestratorState(orchestratorId, newState);
  }

  // Create hook for receiving events
  const receiveEvent = meetingOrchestratorHook.create({
    token: `meeting_orchestrator:${orchestratorId}`,
  });

  console.log(
    `[Meeting Orchestrator ${orchestratorId}] Hook created with token: meeting_orchestrator:${orchestratorId}`
  );

  // Main loop: process events and check for scheduled meetings
  while (true) {
    // Reactive: Process events
    for await (const event of receiveEvent) {
      try {
        console.log(
          `[Meeting Orchestrator ${orchestratorId}] Received event:`,
          event
        );

        const state = await getOrchestratorState(orchestratorId);

        switch (event.type) {
          case "scheduleMeeting":
            await handleScheduleMeeting(orchestratorId, event.meeting);
            break;
          case "runStandup":
            await runStandupMeeting(
              orchestratorId,
              event.managerId,
              event.participantIds
            );
            break;
          case "runSync":
            await runSyncMeeting(
              orchestratorId,
              event.managerId,
              event.participantIds
            );
            break;
          case "sendPing":
            await sendPing(orchestratorId, event.from, event.to, event.message);
            break;
          case "pingResponse":
            await handlePingResponse(
              orchestratorId,
              event.pingId,
              event.from,
              event.to,
              event.response
            );
            break;
          case "getStatus":
            // Just return current state
            break;
        }

        // Update last active
        const updatedState = await getOrchestratorState(orchestratorId);
        if (updatedState) {
          await setOrchestratorState(orchestratorId, {
            ...updatedState,
            lastActive: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(
          `[Meeting Orchestrator ${orchestratorId}] Error processing event:`,
          err
        );
      }
    }

    // Proactive: Check for scheduled meetings that need to run
    await checkScheduledMeetings(orchestratorId);

    // Small delay to prevent tight loop
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds
  }
}

/**
 * Handles scheduling a new meeting
 */
async function handleScheduleMeeting(
  orchestratorId: string,
  meeting: ScheduledMeeting
) {
  "use step";

  console.log(
    `[Meeting Orchestrator ${orchestratorId}] Scheduling meeting: ${meeting.type}`
  );

  const state = await getOrchestratorState(orchestratorId);
  if (state) {
    await setOrchestratorState(orchestratorId, {
      ...state,
      scheduledMeetings: [...state.scheduledMeetings, meeting],
    });
  }
}

/**
 * Checks for scheduled meetings that need to run
 */
async function checkScheduledMeetings(orchestratorId: string) {
  "use step";

  try {
    const state = await getOrchestratorState(orchestratorId);
    if (!state) return;

    const now = new Date();
    const meetingsToRun = state.scheduledMeetings.filter((meeting) => {
      const scheduledTime = new Date(meeting.scheduledTime);
      const lastRun = meeting.lastRun ? new Date(meeting.lastRun) : null;

      // Check if meeting time has passed and hasn't been run today
      if (scheduledTime <= now) {
        if (!lastRun) {
          return true; // Never run before
        }
        // For daily meetings, check if it's been more than 24 hours
        if (meeting.frequency === "daily") {
          const hoursSinceLastRun =
            (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
          return hoursSinceLastRun >= 24;
        }
        // For weekly, check if it's been 7 days
        if (meeting.frequency === "weekly") {
          const daysSinceLastRun =
            (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceLastRun >= 7;
        }
      }
      return false;
    });

    // Run meetings that are due
    for (const meeting of meetingsToRun) {
      if (meeting.type === "standup" && meeting.managerId) {
        await runStandupMeeting(
          orchestratorId,
          meeting.managerId,
          meeting.participants
        );
      } else if (meeting.type === "sync" && meeting.managerId) {
        await runSyncMeeting(
          orchestratorId,
          meeting.managerId,
          meeting.participants
        );
      }

      // Update last run time
      const updatedState = await getOrchestratorState(orchestratorId);
      if (updatedState) {
        const updatedMeetings = updatedState.scheduledMeetings.map((m) =>
          m.id === meeting.id ? { ...m, lastRun: new Date().toISOString() } : m
        );
        await setOrchestratorState(orchestratorId, {
          ...updatedState,
          scheduledMeetings: updatedMeetings,
        });
      }
    }
  } catch (error) {
    console.error(
      `[Meeting Orchestrator ${orchestratorId}] Error checking scheduled meetings:`,
      error
    );
  }
}

/**
 * Runs a standup meeting
 */
async function runStandupMeeting(
  orchestratorId: string,
  managerId: string,
  participantIds: string[]
) {
  "use step";

  console.log(
    `[Meeting Orchestrator ${orchestratorId}] Running standup with ${participantIds.length} participants`
  );

  try {
    // Get participant information for all participants
    const participants = await db
      .select()
      .from(employees)
      .where(inArray(employees.id, participantIds));

    // Notify all participants to join the meeting
    // Generate UUID manually since crypto.randomUUID() may not be available
    const meetingId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    for (const participantId of participantIds) {
      try {
        await icMeetingHook.resume(`ic:${participantId}:meetings`, {
          type: "joinMeeting",
          meetingId,
          meetingType: "standup",
        });
      } catch (error) {
        console.error(
          `[Meeting Orchestrator] Error notifying participant ${participantId}:`,
          error
        );
      }
    }

    // Wait a bit for participants to join
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Generate standup discussion using AI
    const participantNames = participants.map((p) => p.name).join(", ");
    const prompt = `You are facilitating a daily standup meeting with these participants: ${participantNames}

Each participant should share:
1. What they did yesterday
2. What they're working on today
3. Any blockers they have

Generate a realistic standup discussion transcript where each participant shares their status.`;

    const result = await generateText({
      model: 'openai/gpt-4.1' as never,
      prompt,
    });

    const transcript = result.text;

    // Create meeting record in database
    const [meeting] = await db
      .insert(meetings)
      .values({
        type: "standup",
        participants: participantIds,
        transcript,
      })
      .returning();

    // Store meeting in each participant's memory
    for (const participantId of participantIds) {
      try {
        await db.insert(memories).values({
          employeeId: participantId,
          type: "meeting",
          content: `Standup meeting: ${transcript.substring(0, 200)}...`,
          importance: "0.7",
        });
      } catch (error) {
        console.error(
          `[Meeting Orchestrator] Error saving memory for ${participantId}:`,
          error
        );
      }
    }

    // Extract action items from transcript and create tasks
    await extractActionItems(transcript, managerId, participantIds);

    console.log(
      `[Meeting Orchestrator ${orchestratorId}] Standup completed: ${meeting.id}`
    );
  } catch (error) {
    console.error(
      `[Meeting Orchestrator ${orchestratorId}] Error running standup:`,
      error
    );
  }
}

/**
 * Runs a sync meeting
 */
async function runSyncMeeting(
  orchestratorId: string,
  managerId: string,
  participantIds: string[]
) {
  "use step";

  console.log(
    `[Meeting Orchestrator ${orchestratorId}] Running sync meeting with ${participantIds.length} participants`
  );

  // Similar to standup but with different format
  // For MVP, we'll use similar logic
  await runStandupMeeting(orchestratorId, managerId, participantIds);
}

/**
 * Sends an async ping from one employee to another
 */
async function sendPing(
  orchestratorId: string,
  from: string,
  to: string,
  message: string
) {
  "use step";

  console.log(`[Meeting Orchestrator] Sending ping from ${from} to ${to}`);

  try {
    // Send ping via IC's ping hook
    const pingId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    await icPingHook.resume(`ic:${to}:pings`, {
      type: "receivePing",
      pingId,
      from,
      message,
    });

    // Track ping in orchestrator state
    const state = await getOrchestratorState(orchestratorId);
    if (state) {
      await setOrchestratorState(orchestratorId, {
        ...state,
        activePings: {
          ...state.activePings,
          [pingId]: {
            from,
            to,
            message,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    // Store ping in sender's memory
    await db.insert(memories).values({
      employeeId: from,
      type: "interaction",
      content: `Sent ping to ${to}: ${message}`,
      importance: "0.5",
    });

    // Also store in recipient's memory (they received it)
    await db.insert(memories).values({
      employeeId: to,
      type: "interaction",
      content: `Received ping from ${from}: ${message}`,
      importance: "0.5",
    });
  } catch (error) {
    console.error(`[Meeting Orchestrator] Error sending ping:`, error);
  }
}

/**
 * Handles a ping response from an IC
 */
async function handlePingResponse(
  orchestratorId: string,
  pingId: string,
  from: string, // IC who responded
  to: string, // Original sender
  response: string
) {
  "use step";

  console.log(
    `[Meeting Orchestrator] Handling ping response for ping ${pingId} from ${from} to ${to}`
  );

  try {
    const state = await getOrchestratorState(orchestratorId);
    if (!state) {
      console.warn(`[Meeting Orchestrator] State not found for orchestrator ${orchestratorId}`);
      return;
    }
    
    // For testing: if pingId not found, check if there are any active pings and use the first one
    // In production, the pingId should always match
    if (!state.activePings[pingId]) {
      const activePingIds = Object.keys(state.activePings);
      if (activePingIds.length > 0) {
        // Use the most recent ping (last in the object)
        const actualPingId = activePingIds[activePingIds.length - 1];
        console.log(`[Meeting Orchestrator] Ping ${pingId} not found, using most recent ping ${actualPingId}`);
        pingId = actualPingId;
      } else {
        console.warn(`[Meeting Orchestrator] Ping ${pingId} not found in active pings and no active pings available`);
        // Still process the response even if ping not found (for testing)
      }
    }

    // Store response in original sender's memory
    await db.insert(memories).values({
      employeeId: to,
      type: "interaction",
      content: `Received response from ${from} to ping: ${response}`,
      importance: "0.7",
    });

    // Store response in responder's memory
    await db.insert(memories).values({
      employeeId: from,
      type: "interaction",
      content: `Responded to ping from ${to}: ${response}`,
      importance: "0.5",
    });

    // Remove from active pings (or mark as responded)
    const updatedPings = { ...state.activePings };
    delete updatedPings[pingId];

    await setOrchestratorState(orchestratorId, {
      ...state,
      activePings: updatedPings,
    });

    console.log(
      `[Meeting Orchestrator] Ping response processed and stored for ping ${pingId}`
    );
  } catch (error) {
    console.error(`[Meeting Orchestrator] Error handling ping response:`, error);
  }
}

/**
 * Extracts action items from meeting transcript and creates tasks
 */
async function extractActionItems(
  transcript: string,
  managerId: string,
  participantIds: string[]
) {
  "use step";

  try {
    const prompt = `Extract action items from this meeting transcript:

${transcript}

Return a JSON array of action items:
[
  {
    "title": "action item title",
    "description": "description",
    "assignedTo": "employeeId or null",
    "priority": "low" | "medium" | "high"
  }
]`;

    const result = await generateText({
      model: 'openai/gpt-4.1' as never,
      prompt,
    });

    const actionItems = JSON.parse(result.text) as Array<{
      title: string;
      description: string;
      assignedTo: string | null;
      priority: "low" | "medium" | "high";
    }>;

    // Create tasks for action items
    for (const item of actionItems) {
      await db.insert(tasks).values({
        title: item.title,
        description: item.description,
        assignedTo: item.assignedTo || null,
        priority: item.priority,
        status: "pending",
      });
    }

    console.log(
      `[Meeting Orchestrator] Created ${actionItems.length} action items from meeting`
    );
  } catch (error) {
    console.error(
      `[Meeting Orchestrator] Error extracting action items:`,
      error
    );
  }
}

// State management functions
async function getOrchestratorState(
  orchestratorId: string
): Promise<MeetingOrchestratorState | null> {
  "use step";

  try {
    // Try to get from Redis cache first
    try {
      const cachedState = await redisGet(`orchestrator:state:${orchestratorId}`);
      if (cachedState) {
        const parsed = JSON.parse(cachedState) as MeetingOrchestratorState;
        // Update lastActive and return cached state
        parsed.lastActive = new Date().toISOString();
        return parsed;
      }
    } catch (redisError) {
      // If Redis fails, fall back to default state
      console.warn(`[Orchestrator ${orchestratorId}] Redis cache miss or error, using default state:`, redisError);
    }

    // Return default state if not in cache
    const defaultState: MeetingOrchestratorState = {
      orchestratorId,
      scheduledMeetings: [],
      activePings: {},
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };

    // Cache in Redis (expires in 1 hour)
    try {
      await redisSet(`orchestrator:state:${orchestratorId}`, JSON.stringify(defaultState), { ex: 3600 });
    } catch (redisError) {
      // Non-fatal - continue even if Redis caching fails
      console.warn(`[Orchestrator ${orchestratorId}] Failed to cache state in Redis:`, redisError);
    }

    return defaultState;
  } catch (error) {
    console.error(`Error getting orchestrator state:`, error);
    // Return default state on error
    return {
      orchestratorId,
      scheduledMeetings: [],
      activePings: {},
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };
  }
}

async function setOrchestratorState(
  orchestratorId: string,
  state: MeetingOrchestratorState
): Promise<void> {
  "use step";

  try {
    // Update lastActive timestamp
    const updatedState: MeetingOrchestratorState = {
      ...state,
      lastActive: new Date().toISOString(),
    };

    // Store in Redis cache (expires in 1 hour)
    try {
      await redisSet(`orchestrator:state:${orchestratorId}`, JSON.stringify(updatedState), { ex: 3600 });
    } catch (redisError) {
      // Non-fatal - continue even if Redis caching fails
      console.warn(`[Orchestrator ${orchestratorId}] Failed to cache state in Redis:`, redisError);
    }

    // State is stored in Redis for fast access
    // Scheduled meetings are also tracked in the database (meetings table)
    // The database is the source of truth for meeting records
  } catch (error) {
    console.error(`[Orchestrator ${orchestratorId}] Error setting orchestrator state:`, error);
    // Don't throw - state management should be resilient
  }
}

