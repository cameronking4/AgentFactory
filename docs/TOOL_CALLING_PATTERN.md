# Tool Calling Pattern in IC Workflow

This document explains how the IC workflow uses AI SDK tool calling to enable autonomous task execution with access to external systems, databases, and collaboration tools.

## Table of Contents

1. [Overview](#overview)
2. [Tool Definition Pattern](#tool-definition-pattern)
3. [Tool Execution Flow](#tool-execution-flow)
4. [Multiple Tool Calls](#multiple-tool-calls)
5. [LLM Activity Tracing](#llm-activity-tracing)
6. [Available Tools](#available-tools)
7. [Tool Execution Lifecycle](#tool-execution-lifecycle)

---

## Overview

The IC workflow uses Vercel AI SDK's `generateText` function with tool calling capabilities. This allows the LLM to:
- **Decide when to use tools** based on the task requirements
- **Call multiple tools in parallel** for efficient information gathering
- **Use tool results** to inform its final response
- **Collaborate** with other ICs and managers through tools

The tool calling happens **within** the AI generation process, not as separate steps. The AI SDK handles the orchestration automatically.

---

## Tool Definition Pattern

Tools are defined using the AI SDK's `tool()` function with Zod schemas for input validation. All tools are created in [`../workflows/tools/ic-tools.ts`](../workflows/tools/ic-tools.ts).

### Tool Structure

Each tool follows this pattern:

```typescript
toolName: tool({
  description: "What the tool does and when to use it",
  inputSchema: z.object({
    param1: z.string().describe("Parameter description"),
    param2: z.number().optional().describe("Optional parameter"),
  }),
  execute: async ({ param1, param2 }) => {
    "use step"; // All tool executions are durable steps
    // Tool implementation
    return { success: true, data: ... };
  },
})
```

### Key Characteristics

1. **Type Safety**: Zod schemas ensure the LLM provides correctly typed inputs
2. **Durability**: All tool `execute` functions use `"use step"` for durability (see [`../workflows/tools/ic-tools.ts:25`](../workflows/tools/ic-tools.ts#L25))
3. **Error Handling**: Tools return structured responses with `success` and `error` fields
4. **Memory Integration**: Tools automatically store actions in the memory system

---

## Tool Execution Flow

The tool calling flow happens during AI text generation. Here's the complete flow:

### 1. Tool Creation

Tools are created synchronously (not in a step function) to preserve execute functions:

**Location**: [`../workflows/employees/ic-workflow.ts:813`](../workflows/employees/ic-workflow.ts#L813)

```typescript
const tools = createICTools(employeeId, state.managerId);
```

This creates all 11 tools available to the IC.

### 2. Tool Validation

Before passing to AI SDK, tools are validated:

**Location**: [`../workflows/employees/ic-workflow.ts:816-854`](../workflows/employees/ic-workflow.ts#L816-L854)

- Checks that tools object is valid
- Validates each tool has `inputSchema` or `parameters`
- Ensures schema has proper structure
- Logs warnings for debugging

### 3. AI Generation with Tools

The `generateText` call includes tools:

**Location**: [`../workflows/employees/ic-workflow.ts:955-959`](../workflows/employees/ic-workflow.ts#L955-L959)

```typescript
result = await generateText({
  model: model as never,
  prompt,
  tools: validTools,
});
```

### 4. AI SDK Tool Calling Process

When `generateText` is called with tools, the AI SDK:

1. **Sends initial prompt** to the LLM with tool definitions
2. **LLM decides** if/when to call tools based on the prompt
3. **LLM generates tool calls** (can be multiple, can be parallel)
4. **AI SDK executes tools** by calling their `execute` functions
5. **Tool results** are sent back to the LLM
6. **LLM continues generation** using tool results
7. **Final text response** is generated

This all happens **within a single `generateText` call** - it's an iterative process.

### 5. Tool Call Processing

After generation completes, tool calls are logged:

**Location**: [`../workflows/employees/ic-workflow.ts:987-1005`](../workflows/employees/ic-workflow.ts#L987-L1005)

```typescript
if (result.toolCalls && result.toolCalls.length > 0) {
  console.log(`Used ${result.toolCalls.length} tool(s):`, ...);
  // Log each tool result
}
```

### 6. Result Handling

The final result includes:
- **`result.text`**: The final text response from the LLM
- **`result.toolCalls`**: Array of all tool calls made
- **`result.toolResults`**: Array of tool execution results
- **`result.usage`**: Token usage statistics

**Location**: [`../workflows/employees/ic-workflow.ts:1018-1058`](../workflows/employees/ic-workflow.ts#L1018-L1058)

If only tools were called and no text response, a summary is created from tool results.

---

## Multiple Tool Calls

**Yes, the system supports multiple tool calls, including parallel execution.**

### Parallel Tool Calling

The AI SDK supports **parallel tool calling**, meaning the LLM can:
- Call multiple tools in a single generation step
- Execute them concurrently
- Use all results together in the next generation step

### Example Flow with Multiple Tools

```
1. LLM receives prompt: "Search for similar deliverables and ping a colleague for help"

2. LLM decides to call two tools in parallel:
   - searchDeliverables({ keyword: "authentication" })
   - findEmployee({ skills: ["security"] })

3. AI SDK executes both tools simultaneously

4. Tool results are returned:
   - searchDeliverables: { success: true, deliverables: [...] }
   - findEmployee: { success: true, employees: [...] }

5. LLM receives both results and continues generation

6. LLM may call additional tools or generate final response
```

### Tool Call Tracking

All tool calls are tracked in the result:

**Location**: [`../workflows/employees/ic-workflow.ts:987-991`](../workflows/employees/ic-workflow.ts#L987-L991)

```typescript
result.toolCalls.map((tc) => tc.toolName).join(", ")
// Example: "searchDeliverables, findEmployee, pingIC"
```

### Tool Result Processing

Each tool result is logged individually:

**Location**: [`../workflows/employees/ic-workflow.ts:994-1003`](../workflows/employees/ic-workflow.ts#L994-L1003)

```typescript
for (const tr of result.toolResults) {
  if (tr.dynamic) continue; // Skip dynamic tool calls
  const output = tr.output as { success?: boolean; error?: string };
  console.log(`Tool ${tr.toolName} result:`, output?.success ? "Success" : "Failed");
}
```

---

## LLM Activity Tracing

**Yes, LLM activity is comprehensively traced** through multiple mechanisms:

### 1. Cost Tracking

Every AI operation tracks costs and token usage:

**Location**: [`../workflows/employees/ic-workflow.ts:1008-1013`](../workflows/employees/ic-workflow.ts#L1008-L1013)

```typescript
await trackAICost(result, {
  employeeId,
  taskId: task.id,
  model: model,
  operation: "task_execution",
});
```

**Implementation**: [`lib/ai/cost-tracking.ts:39-95`](lib/ai/cost-tracking.ts#L39-L95)

The `trackAICost` function:
- Extracts token usage from AI SDK result (`inputTokens`, `outputTokens`, `totalTokens`)
- Estimates cost based on model pricing
- Stores cost record in database with:
  - Employee ID
  - Task ID
  - Operation type
  - Token counts
  - Estimated cost in USD

### 2. Tool Call Logging

All tool calls are logged with details:

**Location**: [`../workflows/employees/ic-workflow.ts:987-1005`](../workflows/employees/ic-workflow.ts#L987-L1005)

- Number of tools called
- Tool names
- Success/failure status
- Tool output summaries

### 3. Memory Storage

Tool actions are automatically stored in memory:

**Example - pingIC tool**: [`../workflows/tools/ic-tools.ts:60-65`](../workflows/tools/ic-tools.ts#L60-L65)

```typescript
await db.insert(memories).values({
  employeeId: employeeId,
  type: "interaction",
  content: `Sent ping to IC ${targetIC.name} (${icId}): ${message}`,
  importance: "0.6",
});
```

Each tool stores relevant actions:
- **pingIC/pingManager**: Stores interaction memories
- **simpleFetch/executeRestAPI**: Stores API call memories
- **searchDeliverables/getDeliverable**: Implicitly tracked through task completion
- **addMemory**: Explicitly stores memories

### 4. Console Logging

Detailed logging throughout the process:

**Tool Structure Logging**: [`../workflows/employees/ic-workflow.ts:937-951`](../workflows/employees/ic-workflow.ts#L937-L951)

Logs tool structure before passing to AI SDK:
- Tool names
- Schema validation status
- Execute function presence

**Error Logging**: [`../workflows/employees/ic-workflow.ts:961-983`](../workflows/employees/ic-workflow.ts#L961-L983)

Comprehensive error logging with:
- Error messages
- Stack traces
- Tool structure details

### 5. Database Records

All AI operations create database records:

**Cost Records**: Stored in `costs` table with:
- Employee ID
- Task ID
- Operation type
- Token usage
- Cost amount

**Memory Records**: Stored in `memories` table with:
- Employee ID
- Memory type (task, interaction, learning, meeting)
- Content describing the action
- Importance score

**Deliverable Records**: Created after task execution with:
- Task ID
- Deliverable type
- Content
- Creator ID

### 6. Workflow Step Tracking

Since all tool executions use `"use step"`, they are:
- **Logged** by Vercel Workflows
- **Trackable** in workflow execution history
- **Observable** through workflow monitoring tools

---

## Available Tools

The IC workflow provides 11 tools for autonomous operation:

### Collaboration Tools

1. **pingIC** ([`../workflows/tools/ic-tools.ts:18-80`](../workflows/tools/ic-tools.ts#L18-L80))
   - Ping another IC under the same manager
   - Sends message via hook system
   - Validates IC exists and is under same manager

2. **pingManager** ([`../workflows/tools/ic-tools.ts:83-132`](../workflows/tools/ic-tools.ts#L83-L132))
   - Ping manager for questions or updates
   - Sends message via manager evaluation hook

### External API Tools

3. **simpleFetch** ([`../workflows/tools/ic-tools.ts:135-184`](../workflows/tools/ic-tools.ts#L135-L184))
   - Simple HTTP GET request
   - Handles JSON and text responses
   - Stores fetch in memory

4. **executeRestAPI** ([`../workflows/tools/ic-tools.ts:187-256`](../workflows/tools/ic-tools.ts#L187-L256))
   - Full REST API support (GET, POST, PUT, DELETE, PATCH)
   - Custom headers and body support
   - JSON stringification for objects

### Information Retrieval Tools

5. **searchDeliverables** ([`../workflows/tools/ic-tools.ts:259-337`](../../workflows/tools/ic-tools.ts#L259-L337))
   - Search deliverables by keyword
   - Filter by creator, type
   - Returns task context and evaluation scores

6. **getDeliverable** ([`../workflows/tools/ic-tools.ts:340-409`](../workflows/tools/ic-tools.ts#L340-L409))
   - Get full deliverable content by ID
   - Includes task and creator information
   - Includes evaluation feedback

7. **searchTasks** ([`../workflows/tools/ic-tools.ts:602-686`](../workflows/tools/ic-tools.ts#L602-L686))
   - Search tasks by keyword in title/description
   - Filter by status, assignee, priority
   - Returns assignee information

8. **getTask** ([`../workflows/tools/ic-tools.ts:689-780`](../workflows/tools/ic-tools.ts#L689-L780))
   - Get detailed task information
   - Includes subtasks and deliverables
   - Full task hierarchy

9. **findEmployee** ([`../workflows/tools/ic-tools.ts:412-497`](../workflows/tools/ic-tools.ts#L412-L497))
   - Find employees by name, role, skills
   - Filter by manager, status
   - Returns manager information

### Memory Tools

10. **fetchMemories** ([`../workflows/tools/ic-tools.ts:500-558`](../workflows/tools/ic-tools.ts#L500-L558))
    - Retrieve past memories
    - Filter by type, keyword, importance
    - Useful for recalling past learnings

11. **addMemory** ([`../workflows/tools/ic-tools.ts:561-599`](../workflows/tools/ic-tools.ts#L561-L599))
    - Store new memories
    - Set importance score
    - Persist learnings for future

---

## Tool Execution Lifecycle

Here's the complete lifecycle of a tool call:

```
┌─────────────────────────────────────────────────────────────┐
│              Tool Execution Lifecycle                        │
└─────────────────────────────────────────────────────────────┘

1. AI Generation Starts
   └─► generateText() called with tools array
       └─► Prompt sent to LLM with tool definitions

2. LLM Decision Phase
   └─► LLM analyzes prompt and task requirements
       └─► LLM decides which tools to call (if any)
           └─► LLM generates tool call(s) with parameters

3. Tool Execution Phase (Parallel if Multiple)
   └─► AI SDK receives tool calls from LLM
       └─► For each tool call:
           ├─► Validates parameters against Zod schema
           ├─► Calls tool.execute() function
           │   └─► "use step" makes it durable
           │   └─► Tool performs action (DB query, API call, etc.)
           │   └─► Tool returns result { success, data, error }
           └─► Result stored in toolResults array

4. LLM Continuation Phase
   └─► Tool results sent back to LLM
       └─► LLM processes tool results
           └─► LLM may:
               ├─► Call additional tools (iterative)
               └─► Generate final text response

5. Result Processing
   └─► generateText() returns result object
       ├─► result.text: Final LLM response
       ├─► result.toolCalls: All tool calls made
       ├─► result.toolResults: All tool execution results
       └─► result.usage: Token usage statistics

6. Post-Processing
   └─► Tool calls logged (../workflows/employees/ic-workflow.ts:987-1005)
   └─► Cost tracked (../workflows/employees/ic-workflow.ts:1008-1013)
   └─► Result parsed and deliverable created
   └─► Memory stored (by individual tools)
```

### Iterative Tool Calling

The LLM can call tools **iteratively** - using results from one tool to decide to call another:

```
Example:
1. LLM calls searchDeliverables("authentication")
2. Gets results showing similar work
3. LLM calls getDeliverable(deliverableId) to see full content
4. LLM calls findEmployee({ skills: ["security"] }) to find expert
5. LLM calls pingIC(icId, "Can you review this?")
6. LLM generates final deliverable using all gathered information
```

All of this happens **within a single `generateText` call** - the AI SDK handles the orchestration automatically.

---

## Key Design Decisions

### 1. Why "use step" in Tool Execute Functions?

**Location**: All tool execute functions use `"use step"` (e.g., [`../workflows/tools/ic-tools.ts:25`](../workflows/tools/ic-tools.ts#L25))

**Reason**: Tool executions are durable operations that should:
- Survive workflow restarts
- Be retryable on failure
- Be observable in workflow logs
- Maintain consistency

### 2. Why Synchronous Tool Creation?

**Location**: [`../workflows/employees/ic-workflow.ts:813`](../workflows/employees/ic-workflow.ts#L813)

**Reason**: Tools must be created synchronously (not in a step function) to preserve the `execute` function closures. Step functions serialize/deserialize, which would break function references.

### 3. Why Structured Tool Responses?

All tools return `{ success: boolean, ... }` format:

**Example**: [`../workflows/tools/ic-tools.ts:67-71`](../workflows/tools/ic-tools.ts#L67-L71)

**Reason**: 
- Consistent error handling
- LLM can understand success/failure
- Easy to log and trace
- Type-safe responses

### 4. Why Memory Integration?

Tools automatically store actions in memory:

**Example**: [`../workflows/tools/ic-tools.ts:60-65`](../workflows/tools/ic-tools.ts#L60-L65)

**Reason**:
- Creates audit trail
- Enables future context retrieval
- Supports learning and reflection
- Tracks collaboration history

---

## Tracing and Observability

### What Gets Traced

1. **Every AI Call**:
   - Token usage (input, output, total)
   - Cost estimation
   - Model used
   - Operation type
   - Employee and task context

2. **Every Tool Call**:
   - Tool name
   - Input parameters
   - Execution result (success/failure)
   - Output data summary

3. **Every Tool Action**:
   - Stored in memory system
   - Includes context (who, what, when)
   - Importance scoring

4. **Workflow Steps**:
   - All tool executions are workflow steps
   - Tracked in Vercel Workflows execution history
   - Observable through workflow monitoring

### Where to Find Traces

1. **Database**:
   - `costs` table: All AI costs and token usage
   - `memories` table: All tool actions and interactions

2. **Console Logs**:
   - Tool call summaries
   - Tool result status
   - Error details
   - Cost tracking logs

3. **Workflow Execution History**:
   - Vercel Workflows dashboard
   - Step-by-step execution trace
   - Tool execution timing

---

## Example: Complete Tool Calling Session

Here's what happens during a typical task execution:

```
Task: "Create authentication system for API"

1. AI receives prompt with task description and context

2. AI decides to gather information first:
   ├─► Calls searchDeliverables("authentication")
   │   └─► Returns 5 similar deliverables
   │   └─► Stored in memory: "Searched for authentication deliverables"
   │
   ├─► Calls getDeliverable(deliverableId)
   │   └─► Gets full code example
   │
   └─► Calls findEmployee({ skills: ["security", "authentication"] })
       └─► Finds security expert IC
       └─► Stored in memory: "Found security expert"

3. AI uses gathered information to generate code

4. AI decides to get feedback:
   └─► Calls pingIC(securityExpertId, "Can you review this auth code?")
       └─► Sends ping via hook
       └─► Stored in memory: "Sent ping to security expert"

5. AI generates final deliverable with code and documentation

6. Result processing:
   ├─► Logs: "Used 4 tool(s): searchDeliverables, getDeliverable, findEmployee, pingIC"
   ├─► Tracks cost: $0.0234 (1,234 prompt tokens + 567 completion tokens)
   ├─► Creates deliverable in database
   └─► Stores completion memory

All of this happens in a single generateText() call!
```

---

## References

- **Tool Definitions**: [`../workflows/tools/ic-tools.ts`](../workflows/tools/ic-tools.ts)
- **Tool Usage**: [`../workflows/employees/ic-workflow.ts:729-1140`](../workflows/employees/ic-workflow.ts#L729-L1140)
- **Cost Tracking**: [`lib/ai/cost-tracking.ts`](lib/ai/cost-tracking.ts)
- **AI SDK Documentation**: [Vercel AI SDK - Tools](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling)

