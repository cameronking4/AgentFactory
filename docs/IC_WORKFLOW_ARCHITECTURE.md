# IC Workflow Architecture Documentation

This document provides a comprehensive breakdown of the Individual Contributor (IC) workflow system, explaining its architecture, execution patterns, and design principles.

## Table of Contents

1. [Workflow Function Structure](#1-workflow-function-structure)
2. [Type-Safe Hooks Pattern](#2-type-safe-hooks-pattern)
3. [Step Functions for Durability](#3-step-functions-for-durability)
4. [AI-Powered Task Execution](#4-ai-powered-task-execution)
5. [Autonomous Behaviors](#5-autonomous-behaviors)
6. [State Management with Redis Caching](#6-state-management-with-redis-caching)
7. [Architecture Diagrams](#architecture-diagrams)
8. [Key Design Patterns](#key-design-patterns)

---

## 1. Workflow Function Structure

The IC workflow is built as a durable, long-running process using Vercel Workflows. The main workflow function is defined at [`workflows/employees/ic-workflow.ts:83-210`](workflows/employees/ic-workflow.ts#L83-L210).

### Key Characteristics

- **Durability**: The workflow uses the `"use workflow"` directive, making it durable and able to survive restarts
- **Fetch Setup**: Critical for AI SDK integration - sets `globalThis.fetch = fetch` at the start (see [`workflows/employees/ic-workflow.ts:87`](workflows/employees/ic-workflow.ts#L87))
- **State Initialization**: Always rebuilds state from the database on startup for consistency (see [`workflows/employees/ic-workflow.ts:99-108`](workflows/employees/ic-workflow.ts#L99-L108))
- **Hybrid Execution Model**: Combines proactive autonomous behaviors with reactive event handling

### Main Loop Architecture

The workflow runs an infinite loop that:

1. **Updates Activity Timestamp**: Maintains `lastActive` to indicate the workflow is running (see [`workflows/employees/ic-workflow.ts:126-132`](workflows/employees/ic-workflow.ts#L126-L132))
2. **Proactive Behaviors**: Executes autonomous actions like checking for tasks, executing work, helping peers (see [`workflows/employees/ic-workflow.ts:134-151`](workflows/employees/ic-workflow.ts#L134-L151))
3. **Reactive Events**: Uses `Promise.race()` to handle incoming events with a 5-second timeout (see [`workflows/employees/ic-workflow.ts:155-188`](workflows/employees/ic-workflow.ts#L155-L188))
4. **Event Processing**: Handles task events, meetings, and pings as they arrive (see [`workflows/employees/ic-workflow.ts:191-208`](workflows/employees/ic-workflow.ts#L191-L208))

This design ensures the IC is both autonomous (proactively working) and responsive (reacting to external events).

---

## 2. Type-Safe Hooks Pattern

The workflow uses Vercel Workflows' type-safe hook system for external communication. Hooks are defined at [`workflows/employees/ic-workflow.ts:55`](workflows/employees/ic-workflow.ts#L55).

### Hook Definition

The `icTaskHook` is defined using `defineHook<ICEvent>()`, which provides:
- **Type Safety**: TypeScript ensures event payloads match the expected structure
- **Reusability**: The same hook definition is used in both workflow and API routes
- **Event Types**: Supports multiple event types via discriminated unions (see [`workflows/employees/ic-workflow.ts:48-53`](workflows/employees/ic-workflow.ts#L48-L53))

### Hook Creation

Hooks are created with deterministic tokens in the workflow (see [`workflows/employees/ic-workflow.ts:111-119`](workflows/employees/ic-workflow.ts#L111-L119)):

- **Task Hook**: `ic:${employeeId}:tasks` - Receives task assignments and revision requests
- **Meeting Hook**: `ic:${employeeId}:meetings` - Receives meeting invitations
- **Ping Hook**: `ic:${employeeId}:pings` - Receives collaboration pings from peers

### Hook Usage Pattern

The workflow uses async iterators to wait for events:

```typescript
for await (const event of receiveTask) {
  return event; // Return first event
}
```

This pattern allows the workflow to pause execution until an external system resumes the hook with data. External systems (like managers or other ICs) can resume hooks using:

```typescript
await icTaskHook.resume(`ic:${employeeId}:tasks`, eventData);
```

This creates a decoupled, event-driven architecture where workflows can communicate without direct dependencies.

---

## 3. Step Functions for Durability

All stateful operations in the IC workflow are marked with `"use step"`, making them durable and automatically retryable. This is a core principle of Vercel Workflows.

### Step Function Examples

- **Task Handling**: [`handleNewTask`](workflows/employees/ic-workflow.ts#L215-L263) - Processes new task assignments
- **Revision Handling**: [`handleRevisionRequest`](workflows/employees/ic-workflow.ts#L268-L316) - Handles manager feedback
- **Task Breakdown**: [`breakDownTask`](workflows/employees/ic-workflow.ts#L321-L534) - Uses AI to decompose high-level tasks
- **Task Execution**: [`executeTask`](workflows/employees/ic-workflow.ts#L729-L1140) - Executes tasks with AI assistance
- **State Management**: [`getICState`](workflows/employees/ic-workflow.ts#L1557-L1662) and [`setICState`](workflows/employees/ic-workflow.ts#L1664-L1698) - Manages workflow state

### Durability Benefits

1. **Automatic Retries**: Step functions automatically retry on transient failures
2. **State Persistence**: Step execution is logged, allowing workflows to resume from the last successful step
3. **Observability**: Each step is tracked, providing visibility into workflow execution
4. **Error Handling**: Errors in steps can be retryable (default) or fatal (using `FatalError`)

### Error Handling Strategy

The workflow implements resilient error handling:

- **Task Execution Errors**: Logged but don't stop the workflow (see [`workflows/employees/ic-workflow.ts:709-715`](workflows/employees/ic-workflow.ts#L709-L715))
- **State Management Errors**: Non-fatal, workflow continues (see [`workflows/employees/ic-workflow.ts:1694-1697`](workflows/employees/ic-workflow.ts#L1694-L1697))
- **Hook Errors**: Warnings logged, proactive checks will pick up missed events (see [`workflows/employees/ic-workflow.ts:634-637`](workflows/employees/ic-workflow.ts#L634-L637))

---

## 4. AI-Powered Task Execution

The IC workflow uses Vercel AI SDK's `generateText` function to execute tasks autonomously. The core execution logic is in [`executeTask`](workflows/employees/ic-workflow.ts#L729-L1140).

### AI Execution Flow

1. **Context Gathering**: 
   - Retrieves employee persona (see [`workflows/employees/ic-workflow.ts:742-748`](workflows/employees/ic-workflow.ts#L742-L748))
   - Loads relevant memories (see [`workflows/employees/ic-workflow.ts:751-761`](workflows/employees/ic-workflow.ts#L751-L761))
   - Gets parent task context if applicable (see [`workflows/employees/ic-workflow.ts:764-774`](workflows/employees/ic-workflow.ts#L764-L774))
   - Checks for revision feedback (see [`workflows/employees/ic-workflow.ts:777-791`](workflows/employees/ic-workflow.ts#L777-L791))

2. **Tool Creation**: 
   - Creates IC-specific tools using [`createICTools`](workflows/employees/ic-workflow.ts#L813) (imported from `@/workflows/tools/ic-tools`)
   - Validates tool structure (see [`workflows/employees/ic-workflow.ts:816-854`](workflows/employees/ic-workflow.ts#L816-L854))
   - Tools include: `pingIC`, `pingManager`, `simpleFetch`, `executeRestAPI`, `searchDeliverables`, `getDeliverable`, `findEmployee`, `fetchMemories`, `addMemory`, `searchTasks`, `getTask`

3. **AI Generation**:
   - Builds comprehensive prompt with context (see [`workflows/employees/ic-workflow.ts:857-903`](workflows/employees/ic-workflow.ts#L857-L903))
   - Calls `generateText` with tools (see [`workflows/employees/ic-workflow.ts:955-959`](workflows/employees/ic-workflow.ts#L955-L959))
   - Model can call tools during execution to gather information or collaborate

4. **Result Processing**:
   - Handles tool calls and results (see [`workflows/employees/ic-workflow.ts:987-1005`](workflows/employees/ic-workflow.ts#L987-L1005))
   - Parses JSON response (see [`workflows/employees/ic-workflow.ts:1018-1058`](workflows/employees/ic-workflow.ts#L1018-L1058))
   - Creates deliverable in database (see [`workflows/employees/ic-workflow.ts#L1061-L1069`](workflows/employees/ic-workflow.ts#L1061-L1069))
   - Updates state and learns skills (see [`workflows/employees/ic-workflow.ts#L1085-L1104`](workflows/employees/ic-workflow.ts#L1085-L1104))

5. **Cost Tracking**: 
   - Tracks AI usage costs (see [`workflows/employees/ic-workflow.ts#L1008-L1013`](workflows/employees/ic-workflow.ts#L1008-L1013))

### Tool Integration

The AI SDK's tool calling feature allows the model to:
- **Collaborate**: Ping other ICs or managers for help
- **Gather Information**: Search deliverables, tasks, and memories
- **Interact with APIs**: Make HTTP requests to external systems
- **Store Knowledge**: Add memories for future reference

This creates a powerful autonomous agent that can reason, gather information, and collaborate to complete complex tasks.

---

## 5. Autonomous Behaviors

The IC workflow implements several proactive behaviors that run autonomously, making the agent self-directed and capable of continuous improvement.

### Behavior Overview

1. **Check for New Tasks** ([`checkForNewTasks`](workflows/employees/ic-workflow.ts#L541-L595))
   - Runs every loop iteration
   - Queries database for pending/in-progress tasks assigned to the IC
   - Ensures tasks are picked up even if notifications were missed
   - Removes completed tasks from `currentTasks` list

2. **Execute Current Tasks** ([`executeCurrentTasks`](workflows/employees/ic-workflow.ts#L646-L721))
   - Processes all tasks in `currentTasks`
   - Handles task breakdown for high-level tasks
   - Executes subtasks autonomously
   - Continues processing even if one task fails

3. **Request Work from Manager** ([`requestWorkFromManager`](workflows/employees/ic-workflow.ts#L600-L641))
   - Runs with 5% probability per loop
   - Only triggers when IC has no current tasks
   - Sends request via `managerEvaluationHook`
   - Demonstrates proactive work-seeking behavior

4. **Help Peers** ([`checkAndHelpPeers`](workflows/employees/ic-workflow.ts#L1145-L1220))
   - Identifies blocked tasks (in-progress for >1 hour)
   - Checks skill overlap with peer ICs
   - Offers help via ping mechanism
   - Records collaboration in history

5. **Reflect on Work** ([`reflectOnWork`](workflows/employees/ic-workflow.ts#L1225-L1361))
   - Processes recently completed tasks
   - Uses AI to extract insights and learnings
   - Updates `learnedSkills` and `reflectionInsights`
   - Stores reflections in memory for future reference

6. **Identify Improvements** ([`identifyImprovements`](workflows/employees/ic-workflow.ts#L1366-L1475))
   - Runs with 10% probability per loop
   - Analyzes reflection insights
   - Uses AI to generate improvement tasks
   - Creates self-assigned tasks for continuous improvement

### Autonomous Loop Pattern

The main loop (see [`workflows/employees/ic-workflow.ts#L124-209`](workflows/employees/ic-workflow.ts#L124-L209)) executes these behaviors in sequence, then waits for reactive events with a timeout. This creates a balance between:
- **Proactive Work**: IC actively seeks and completes work
- **Reactive Response**: IC responds to external events (assignments, meetings, pings)
- **Continuous Learning**: IC improves through reflection and self-directed improvement

---

## 6. State Management with Redis Caching

The IC workflow uses a two-tier state management system: Redis for fast access and the database as the source of truth.

### State Structure

The `ICState` interface (see [`workflows/employees/ic-workflow.ts#L16-29`](workflows/employees/ic-workflow.ts#L16-L29)) includes:
- **Identity**: `employeeId`, `name`, `role`
- **Capabilities**: `skills`, `learnedSkills`
- **Work Tracking**: `currentTasks`, `completedTasks`
- **Learning**: `reflectionInsights`, `collaborationHistory`
- **Metadata**: `createdAt`, `lastActive`

### State Retrieval (`getICState`)

The state retrieval function (see [`workflows/employees/ic-workflow.ts#L1557-L1662`]) implements:

1. **Redis Cache Check**: First attempts to retrieve from Redis (see [`workflows/employees/ic-workflow.ts#L1562-1578`](workflows/employees/ic-workflow.ts#L1562-L1578))
2. **Database Fallback**: If cache miss or error, rebuilds from database (see [`workflows/employees/ic-workflow.ts#L1584-1647`](workflows/employees/ic-workflow.ts#L1584-L1647))
3. **State Reconstruction**: 
   - Queries employee record
   - Gets current and completed tasks
   - Extracts learned skills from memories
   - Builds complete state object
4. **Cache Update**: Stores in Redis with 1-hour expiration (see [`workflows/employees/ic-workflow.ts#L1650-L1655`](workflows/employees/ic-workflow.ts#L1650-L1655))

### State Updates (`setICState`)

The state update function (see [`workflows/employees/ic-workflow.ts#L1664-L1698`]) implements:

1. **Update Timestamp**: Always updates `lastActive` (see [`workflows/employees/ic-workflow.ts#L1669-L1672`](workflows/employees/ic-workflow.ts#L1669-L1672))
2. **Redis Cache**: Updates cache with 1-hour expiration (see [`workflows/employees/ic-workflow.ts#L1675-1680`](workflows/employees/ic-workflow.ts#L1675-L1680))
3. **Database Update**: Updates employee's `updatedAt` timestamp (see [`workflows/employees/ic-workflow.ts#L1684-L1689`](workflows/employees/ic-workflow.ts#L1684-L1689))
4. **Source of Truth**: Database remains authoritative; Redis is for performance

### Resilience Features

- **Cache Failures**: Non-fatal; workflow continues with database (see [`workflows/employees/ic-workflow.ts#L1579-1582`](workflows/employees/ic-workflow.ts#L1579-L1582))
- **State Rebuild**: Always possible from database, ensuring durability
- **Activity Tracking**: `lastActive` timestamp enables self-healing detection by HR workflow

---

## Architecture Diagrams

### 1. Overall Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    IC Workflow System                            │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Database   │    │    Redis     │    │  AI Gateway  │
│  (Postgres)  │    │   (Cache)    │    │   (Models)   │
│              │    │              │    │              │
│ - Employees  │    │ - State      │    │ - GPT-4      │
│ - Tasks      │    │   Cache      │    │ - Tool Calls │
│ - Deliverables│   │ - Fast Access│    │ - Cost Track │
│ - Memories   │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  IC Workflow    │
                    │  (Durable)      │
                    └─────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Manager    │    │  Other ICs   │    │  HR System   │
│  Workflow    │    │  (Peers)     │    │              │
│              │    │              │    │              │
│ - Evaluates  │    │ - Collaboration│   │ - Monitors   │
│ - Assigns    │    │ - Help       │    │ - Self-Heal  │
│ - Reviews    │    │ - Pings      │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
```

### 2. Workflow Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│              IC Workflow Main Loop                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Initialize     │
                    │  - Get State    │
                    │  - Create Hooks │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  WHILE (true)   │
                    └─────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PROACTIVE   │    │   REACTIVE   │    │   STATE      │
│  BEHAVIORS   │    │   EVENTS     │    │   UPDATE     │
│              │    │              │    │              │
│ 1. Check     │    │ - Task Event │    │ - Update     │
│    New Tasks │    │ - Meeting    │    │   lastActive │
│              │    │ - Ping       │    │ - Sync Cache │
│ 2. Execute   │    │              │    │              │
│    Tasks     │    │ - Timeout    │    │              │
│              │    │   (5s)       │    │              │
│ 3. Request   │    │              │    │              │
│    Work      │    │              │    │              │
│              │    │              │    │              │
│ 4. Help      │    │              │    │              │
│    Peers     │    │              │    │              │
│              │    │              │    │              │
│ 5. Reflect   │    │              │    │              │
│    on Work   │    │              │    │              │
│              │    │              │    │              │
│ 6. Identify  │    │              │    │              │
│    Improvements│   │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Loop Continues │
                    └─────────────────┘
```

### 3. Task Execution Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    Task Execution Flow                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Task Discovered│
                    │  (Proactive or  │
                    │   Reactive)     │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Is High-Level? │
                    │  (No Parent)    │
                    └─────────────────┘
                    │           │
            YES     │           │ NO
                    ▼           ▼
        ┌──────────────┐  ┌──────────────┐
        │ Break Down   │  │ Execute Task │
        │ into Subtasks│  │              │
        └──────────────┘  └──────────────┘
                    │           │
                    └─────┬─────┘
                          ▼
                ┌─────────────────┐
                │  Gather Context │
                │  - Memories     │
                │  - Skills       │
                │  - Persona      │
                │  - Parent Task  │
                └─────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │  Create Tools   │
                │  - pingIC       │
                │  - pingManager  │
                │  - fetch        │
                │  - search       │
                │  - etc.         │
                └─────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │  AI Execution   │
                │  (generateText) │
                │                 │
                │  - Model decides│
                │  - Calls tools  │
                │  - Produces     │
                │    deliverable  │
                └─────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │  Create         │
                │  Deliverable    │
                │  (in Database)  │
                └─────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │  Update State   │
                │  - Mark Complete│
                │  - Learn Skills │
                │  - Store Memory │
                └─────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │  Request Manager│
                │  Evaluation     │
                │  (via Hook)     │
                └─────────────────┘
```

### 4. Event Handling System

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Flow Architecture                   │
└─────────────────────────────────────────────────────────────┘

External System                    IC Workflow
     │                                  │
     │  ┌──────────────────────────┐   │
     │  │  Manager Workflow        │   │
     │  │  - Assigns Task          │   │
     │  │  - Requests Revision     │   │
     │  └──────────────────────────┘   │
     │           │                      │
     │           │ resumeHook()         │
     │           ├─────────────────────►│
     │           │                      │
     │           │                      │  ┌──────────────┐
     │           │                      │  │ icTaskHook   │
     │           │                      │  │ (token)      │
     │           │                      │  └──────────────┘
     │           │                      │         │
     │           │                      │         ▼
     │           │                      │  ┌──────────────┐
     │           │                      │  │ Event Loop   │
     │           │                      │  │ Processes    │
     │           │                      │  └──────────────┘
     │           │                      │
     │  ┌──────────────────────────┐   │
     │  │  Meeting Orchestrator    │   │
     │  │  - Schedules Meeting     │   │
     │  └──────────────────────────┘   │
     │           │                      │
     │           │ resumeHook()         │
     │           ├─────────────────────►│
     │           │                      │
     │           │                      │  ┌──────────────┐
     │           │                      │  │ icMeetingHook│
     │           │                      │  │ (token)      │
     │           │                      │  └──────────────┘
     │           │                      │
     │  ┌──────────────────────────┐   │
     │  │  Other ICs               │   │
     │  │  - Send Pings            │   │
     │  │  - Request Help          │   │
     │  └──────────────────────────┘   │
     │           │                      │
     │           │ resumeHook()         │
     │           ├─────────────────────►│
     │           │                      │
     │           │                      │  ┌──────────────┐
     │           │                      │  │ icPingHook   │
     │           │                      │  │ (token)      │
     │           │                      │  └──────────────┘
     │           │                      │
     │           │                      │
     │           │                      │  ┌──────────────┐
     │           │                      │  │ Promise.race │
     │           │                      │  │ - Task Event │
     │           │                      │  │ - Meeting    │
     │           │                      │  │ - Ping       │
     │           │                      │  │ - Timeout    │
     │           │                      │  └──────────────┘
```

### 5. State Management Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    State Management Flow                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ICState Structure                        │
├─────────────────────────────────────────────────────────────┤
│  - employeeId: string                                       │
│  - name: string                                             │
│  - role: "ic"                                               │
│  - skills: string[]                                         │
│  - managerId: string | null                                 │
│  - currentTasks: string[]                                   │
│  - completedTasks: string[]                                 │
│  - learnedSkills: string[]                                  │
│  - collaborationHistory: CollaborationEvent[]               │
│  - reflectionInsights: ReflectionInsight[]                  │
│  - createdAt: string                                        │
│  - lastActive: string                                       │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   getICState │    │  setICState  │    │   Database   │
│              │    │              │    │              │
│ 1. Check     │    │ 1. Update    │    │ - Employees  │
│    Redis     │    │    Redis     │    │ - Tasks      │
│              │    │              │    │ - Memories   │
│ 2. If miss,  │    │ 2. Update DB │    │              │
│    Query DB  │    │    (source   │    │              │
│              │    │    of truth) │    │              │
│ 3. Rebuild   │    │              │    │              │
│    State     │    │ 3. Update    │    │              │
│              │    │    lastActive│    │              │
│ 4. Cache in  │    │              │    │              │
│    Redis     │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  State Sync     │
                    │  - Always from  │
                    │    DB on start  │
                    │  - Redis for    │
                    │    performance  │
                    └─────────────────┘
```

### 6. Autonomous Behavior Matrix

```
┌──────────────────┬──────────────┬──────────────┬─────────────┐
│   Behavior       │  Frequency   │  Trigger     │  Purpose    │
├──────────────────┼──────────────┼──────────────┼─────────────┤
│ Check New Tasks  │ Every Loop   │ Always       │ Discover    │
│                  │              │              │ work        │
├──────────────────┼──────────────┼──────────────┼─────────────┤
│ Execute Tasks    │ Every Loop   │ Has Tasks    │ Complete    │
│                  │              │              │ work        │
├──────────────────┼──────────────┼──────────────┼─────────────┤
│ Request Work     │ 5% chance    │ No Tasks     │ Get work    │
│                  │ per loop     │              │             │
├──────────────────┼──────────────┼──────────────┼─────────────┤
│ Help Peers       │ Every Loop   │ Blocked      │ Collaborate │
│                  │              │ tasks found  │             │
├──────────────────┼──────────────┼──────────────┼─────────────┤
│ Reflect on Work  │ Every Loop   │ Completed    │ Learn       │
│                  │              │ tasks        │             │
├──────────────────┼──────────────┼──────────────┼─────────────┤
│ Identify         │ 10% chance   │ Has          │ Improve     │
│ Improvements     │ per loop     │ reflections  │             │
└──────────────────┴──────────────┴──────────────┴─────────────┘
```

### 7. AI Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    AI SDK Integration                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Task Execution AI Flow                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │ Build Prompt │                                           │
│  │ - Persona    │                                           │
│  │ - Skills     │                                           │
│  │ - Context    │                                           │
│  │ - Task Info  │                                           │
│  └──────────────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Create Tools │                                           │
│  │ - pingIC     │                                           │
│  │ - pingManager│                                           │
│  │ - fetch      │                                           │
│  │ - search     │                                           │
│  │ - memory     │                                           │
│  └──────────────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ generateText │                                           │
│  │ (AI Gateway) │                                           │
│  └──────────────┘                                           │
│         │                                                    │
│         ├─────────────────────────────────────┐             │
│         │                                     │             │
│         ▼                                     ▼             │
│  ┌──────────────┐                  ┌──────────────┐        │
│  │ Tool Calls   │                  │ Text Output  │        │
│  │ - Execute    │                  │ - Deliverable│        │
│  │ - Get Result │                  │ - Summary    │        │
│  │ - Continue   │                  │ - Skills     │        │
│  └──────────────┘                  └──────────────┘        │
│         │                                     │             │
│         └─────────────────┬───────────────────┘             │
│                           ▼                                 │
│                  ┌──────────────┐                           │
│                  │ Parse Result │                           │
│                  │ - JSON       │                           │
│                  │ - Extract    │                           │
│                  └──────────────┘                           │
│                           │                                 │
│                           ▼                                 │
│                  ┌──────────────┐                           │
│                  │ Track Cost   │                           │
│                  │ - Tokens     │                           │
│                  │ - Model      │                           │
│                  │ - Operation  │                           │
│                  └──────────────┘                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Reflection AI Flow                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │ Completed    │                                           │
│  │ Task Data    │                                           │
│  └──────────────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Build Prompt │                                           │
│  │ - Task Info  │                                           │
│  │ - Evaluation │                                           │
│  │ - Skills     │                                           │
│  │ - Insights   │                                           │
│  └──────────────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ generateText │                                           │
│  │ (No Tools)   │                                           │
│  └──────────────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Extract      │                                           │
│  │ - Insights   │                                           │
│  │ - Skills     │                                           │
│  │ - Improvements│                                          │
│  └──────────────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Update State │                                           │
│  │ - Add Insight│                                           │
│  │ - Learn Skill│                                           │
│  │ - Store Memory│                                          │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8. Hook Token Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Hook Token System                        │
└─────────────────────────────────────────────────────────────┘

Token Format: `{hookType}:{employeeId}:{eventType}`

Examples:
  - ic:emp-123:tasks      → Task events for IC emp-123
  - ic:emp-123:meetings   → Meeting events for IC emp-123
  - ic:emp-123:pings      → Ping events for IC emp-123
  - manager:mg-456:events → Events for manager mg-456

┌─────────────────────────────────────────────────────────────┐
│  Hook Lifecycle                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Define Hook (Type-Safe)                                 │
│     defineHook<ICEvent>()                                   │
│                                                              │
│  2. Create Hook in Workflow                                 │
│     hook.create({ token: "ic:123:tasks" })                  │
│                                                              │
│  3. Wait for Event (Async Iterator)                         │
│     for await (const event of hook)                         │
│                                                              │
│  4. External System Resumes                                 │
│     hook.resume(token, eventData)                           │
│                                                              │
│  5. Workflow Receives Event                                 │
│     Process event and continue                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9. Learning & Improvement Cycle

```
┌─────────────────────────────────────────────────────────────┐
│              Learning & Improvement Cycle                    │
└─────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │ Complete Task│
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Store Memory │
    │ - Task Info  │
    │ - Summary    │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Reflect      │
    │ (AI-Powered) │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Extract      │
    │ - Insights   │
    │ - Skills     │
    │ - Improvements│
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Update State │
    │ - Add Insight│
    │ - Learn Skill│
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Identify     │
    │ Improvements │
    │ (AI-Powered) │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Create       │
    │ Improvement  │
    │ Tasks        │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Apply to     │
    │ Future Tasks │
    └──────────────┘
           │
           └──────────────┐
                          │
                          ▼
                  ┌──────────────┐
                  │ Cycle Repeats│
                  └──────────────┘
```

### 10. Error Handling & Resilience

```
┌─────────────────────────────────────────────────────────────┐
│              Error Handling Strategy                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Step Function Errors                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Error Type: Retryable                                      │
│  ┌────────────────────────────────────────┐                │
│  │ - Network failures                     │                │
│  │ - Temporary DB issues                  │                │
│  │ - AI API rate limits                   │                │
│  │                                        │                │
│  │ Action: Auto-retry by Workflow        │                │
│  │         Continue processing           │                │
│  └────────────────────────────────────────┘                │
│                                                              │
│  Error Type: Fatal                                          │
│  ┌────────────────────────────────────────┐                │
│  │ - Invalid data                         │                │
│  │ - Missing required resources           │                │
│  │                                        │                │
│  │ Action: Log error                      │                │
│  │         Skip task                      │                │
│  │         Continue workflow              │                │
│  └────────────────────────────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  State Management Errors                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Redis Failure:                                             │
│  ┌────────────────────────────────────────┐                │
│  │ - Fall back to database                │                │
│  │ - Log warning                          │                │
│  │ - Continue operation                   │                │
│  └────────────────────────────────────────┘                │
│                                                              │
│  Database Failure:                                          │
│  ┌────────────────────────────────────────┐                │
│  │ - Log error                            │                │
│  │ - Return null/empty state              │                │
│  │ - Workflow continues (will retry)      │                │
│  └────────────────────────────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Hook Errors                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Hook Resume Failure:                                       │
│  ┌────────────────────────────────────────┐                │
│  │ - Log warning                          │                │
│  │ - Continue processing                  │                │
│  │ - Event will be retried or picked up   │                │
│  │   by proactive checks                  │                │
│  └────────────────────────────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Patterns

### 1. Durability Pattern

All I/O operations use `"use step"` directives, making them:
- **Automatically Retryable**: Transient failures are retried automatically
- **Observable**: Each step is logged and tracked
- **Resumable**: Workflows can resume from the last successful step after restarts

### 2. Type Safety Pattern

Uses `defineHook<T>()` for type-safe event handling:
- **Compile-time Safety**: TypeScript ensures event payloads match expected structure
- **Reusability**: Same hook definition used in workflow and API routes
- **Maintainability**: Changes to event types are caught at compile time

### 3. Autonomous Behavior Pattern

Combines proactive and reactive behaviors:
- **Proactive**: IC actively seeks work, executes tasks, helps peers, learns
- **Reactive**: IC responds to external events (assignments, meetings, pings)
- **Balanced**: Uses `Promise.race()` with timeout to balance both modes

### 4. State Resilience Pattern

Two-tier state management:
- **Database as Source of Truth**: Always authoritative, can rebuild state
- **Redis for Performance**: Fast access with automatic fallback
- **Self-Healing**: State can always be reconstructed from database

### 5. AI Integration Pattern

Uses AI SDK with tools for autonomous task execution:
- **Context-Aware**: Builds comprehensive context from memories and history
- **Tool-Enabled**: Model can call tools to gather information and collaborate
- **Cost-Tracked**: All AI operations are tracked for monitoring
- **Error-Resilient**: AI failures don't crash the workflow

### 6. Learning Pattern

Implements continuous improvement:
- **Reflection**: AI-powered reflection on completed work
- **Skill Learning**: Extracts and stores learned skills
- **Self-Improvement**: Creates improvement tasks autonomously
- **Memory**: Stores insights for future reference

---

## References

- **Main Workflow File**: [`workflows/employees/ic-workflow.ts`](workflows/employees/ic-workflow.ts)
- **State Interface**: [`workflows/employees/ic-workflow.ts:16-29`](workflows/employees/ic-workflow.ts#L16-L29)
- **Event Types**: [`workflows/employees/ic-workflow.ts:48-53`](workflows/employees/ic-workflow.ts#L48-L53)
- **Hook Definition**: [`workflows/employees/ic-workflow.ts:55`](workflows/employees/ic-workflow.ts#L55)
- **Workflow Function**: [`workflows/employees/ic-workflow.ts:83-210`](workflows/employees/ic-workflow.ts#L83-L210)

---

## Related Documentation

- [Vercel Workflows Documentation](https://vercel.com/docs/workflows)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [AI SDK + Workflows Guide](./AI_SDK_WORKFLOWS_GUIDE.md)
- [Workflow Analysis](./WORKFLOW_ANALYSIS.md)

