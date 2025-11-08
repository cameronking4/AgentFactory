# MVP Architecture - End-to-End Task Execution

## Overview

The MVP focuses on proving the core concept: **HR creates ICs that collaborate to break down and execute a high-level task end-to-end**.

## Core Flow

```
CEO enters task → HR plans → HR hires ICs → ICs break down task → 
ICs collaborate → ICs execute → Managers evaluate → Complete output
```

## Detailed Flow

### 1. CEO Input
- CEO enters high-level task: "Build a Next.js app that does XYZ"
- Task stored in database
- HR workflow receives task via hook

### 2. HR Planning
- HR workflow analyzes task
- Determines:
  - How many ICs needed
  - What skills each IC should have
  - What MCP servers might be useful
- Creates hiring plan

### 3. HR Hiring
- HR creates IC employee workflows
- Each IC initialized with:
  - Skills/role
  - Assigned MCP servers (if any)
  - Initial memory
  - Persona (optional)

### 4. Task Breakdown
- ICs collaborate to break down high-level task
- Create subtasks:
  - Frontend setup
  - Backend API
  - Database schema
  - Deployment
  - Testing
- Subtasks assigned to ICs based on skills

### 5. Execution & Collaboration
- ICs work on subtasks
- Use MCP servers for tools (code execution, file operations, etc.)
- Discover new MCP servers if needed
- Create new MCP servers if needed
- Meet in scheduled standups
- Ping each other async for help
- Store learnings in memory

### 6. Deliverables
- Each subtask produces deliverables:
  - Code files
  - Documentation
  - Configuration
  - Tests
- Deliverables stored in database
- Linked to tasks

### 7. Manager Evaluation
- Managers review deliverables
- Score quality (1-10)
- Provide feedback
- Approve or request changes

### 8. Completion
- All subtasks complete
- All deliverables approved
- Final output assembled
- CEO can view complete result

## Key Components

### HR Workflow

```typescript
export async function hrWorkflow(initialState: HRState) {
  "use workflow";
  
  globalThis.fetch = fetch;
  
  const receiveTask = hrTaskHook.create({
    token: `hr:${hrId}`,
  });
  
  for await (const task of receiveTask) {
    // 1. Analyze task
    const plan = await analyzeTask(task);
    
    // 2. Determine ICs needed
    const icRequirements = await determineICRequirements(plan);
    
    // 3. Hire ICs
    for (const requirement of icRequirements) {
      await hireIC(requirement);
    }
    
    // 4. Assign task to ICs
    await assignTaskToICs(task, hiredICs);
  }
}
```

### IC Employee Workflow

```typescript
export async function icEmployeeWorkflow(initialState: ICState) {
  "use workflow";
  
  globalThis.fetch = fetch;
  
  // Hooks for different event types
  const receiveTask = icTaskHook.create({ token: `ic:${icId}:tasks` });
  const receiveMeeting = icMeetingHook.create({ token: `ic:${icId}:meetings` });
  const receivePing = icPingHook.create({ token: `ic:${icId}:pings` });
  
  // Main loop
  while (true) {
    // Reactive: Process tasks
    for await (const task of receiveTask) {
      await executeTask(icId, task);
    }
    
    // Reactive: Attend meetings
    for await (const meeting of receiveMeeting) {
      await attendMeeting(icId, meeting);
    }
    
    // Reactive: Respond to pings
    for await (const ping of receivePing) {
      await respondToPing(icId, ping);
    }
    
    // Proactive: Help peers
    await checkAndHelpPeers(icId);
    
    // Proactive: Discover MCP servers
    await discoverMCPs(icId);
  }
}
```

### Task Breakdown Process

```typescript
async function breakDownTask(
  highLevelTask: string,
  ics: IC[]
): Promise<SubTask[]> {
  "use step";
  
  // ICs collaborate to break down task
  const breakdown = await generateText({
    model: 'openai/gpt-4o',
    prompt: `You are a team of developers. Break down this task into subtasks:
    
    Task: ${highLevelTask}
    
    Team members: ${ics.map(ic => ic.name).join(', ')}
    
    Create a detailed breakdown with:
    - Subtask name
    - Description
    - Dependencies
    - Assigned IC
    - Estimated complexity`,
  });
  
  // Parse breakdown into subtasks
  const subtasks = parseBreakdown(breakdown.text);
  
  return subtasks;
}
```

### MCP Server Discovery

```typescript
async function discoverMCPs(icId: string): Promise<void> {
  "use step";
  
  const state = await getICState(icId);
  const currentTask = state.currentTasks[0];
  
  if (!currentTask) return;
  
  // Search for relevant MCP servers
  const searchQuery = `MCP servers for ${currentTask.type}`;
  const results = await searchMCPRegistry(searchQuery);
  
  // Evaluate and recommend
  for (const mcp of results) {
    const useful = await evaluateMCPUsefulness(mcp, currentTask);
    if (useful) {
      await recommendMCP(icId, mcp);
    }
  }
}
```

### MCP Server Creation

```typescript
async function createMCPServer(
  icId: string,
  purpose: string
): Promise<string> {
  "use step";
  
  // Generate MCP server code
  const mcpCode = await generateText({
    model: 'openai/gpt-4o',
    prompt: `Create an MCP server that ${purpose}`,
  });
  
  // Save MCP server
  const mcpId = await saveMCPServer({
    name: purpose,
    code: mcpCode.text,
    createdBy: icId,
    createdAt: new Date().toISOString(),
  });
  
  // Make available to company
  await registerMCPServer(mcpId);
  
  return mcpId;
}
```

### Memory System

```typescript
async function saveToMemory(
  icId: string,
  content: string,
  type: 'meeting' | 'task' | 'learning' | 'interaction',
  importance: number = 0.5
): Promise<void> {
  "use step";
  
  const memory: MemoryEntry = {
    id: generateId(),
    type,
    content,
    timestamp: new Date().toISOString(),
    importance,
  };
  
  // Save to database
  await db.insert(memories).values({
    icId,
    ...memory,
  });
  
  // Update Redis cache
  await redis.lpush(`memory:${icId}`, JSON.stringify(memory));
  
  // Trim if too many (keep most important)
  await trimMemory(icId, 100); // Keep top 100
}
```

### Meeting System

```typescript
// Scheduled standup
export async function standupMeeting(participants: string[]) {
  "use workflow";
  
  globalThis.fetch = fetch;
  
  // Wait until meeting time
  await sleepUntil(meetingTime);
  
  // Notify participants
  await Promise.all(
    participants.map(icId =>
      icMeetingHook.resume(`ic:${icId}:meetings`, {
        type: 'standup',
        participants,
      })
    )
  );
  
  // Conduct meeting (AI-driven)
  const transcript = await conductStandup(participants);
  
  // Extract action items
  const actionItems = await extractActionItems(transcript);
  
  // Create tasks from action items
  for (const item of actionItems) {
    await createTask(item);
  }
  
  // Save transcript to memory
  await Promise.all(
    participants.map(icId =>
      saveToMemory(icId, transcript, 'meeting', 0.7)
    )
  );
}
```

### Manager Evaluation

```typescript
async function evaluateDeliverable(
  managerId: string,
  deliverableId: string
): Promise<Evaluation> {
  "use step";
  
  const deliverable = await getDeliverable(deliverableId);
  const task = await getTask(deliverable.taskId);
  
  // Evaluate quality
  const evaluation = await generateText({
    model: 'openai/gpt-4o',
    prompt: `Evaluate this deliverable:
    
    Task: ${task.description}
    Deliverable: ${deliverable.content}
    
    Score 1-10 and provide feedback.`,
  });
  
  const score = extractScore(evaluation.text);
  const feedback = extractFeedback(evaluation.text);
  
  // Save evaluation
  await db.insert(evaluations).values({
    deliverableId,
    managerId,
    score,
    feedback,
    evaluatedAt: new Date().toISOString(),
  });
  
  return { score, feedback };
}
```

## Database Schema (Key Tables)

```typescript
// Employees
employees {
  id: string (workflowRunId)
  name: string
  role: 'ic' | 'manager'
  skills: string[]
  status: 'active' | 'terminated'
  createdAt: timestamp
}

// Tasks
tasks {
  id: string
  parentTaskId?: string (for subtasks)
  title: string
  description: string
  assignedTo: string (employeeId)
  status: 'pending' | 'in-progress' | 'completed' | 'reviewed'
  createdAt: timestamp
  completedAt?: timestamp
}

// Deliverables
deliverables {
  id: string
  taskId: string
  type: 'code' | 'document' | 'config'
  content: string
  createdBy: string (employeeId)
  createdAt: timestamp
  evaluatedBy?: string (managerId)
  evaluationScore?: number
}

// MCP Servers
mcpServers {
  id: string
  name: string
  description: string
  code: string
  createdBy: string (employeeId)
  createdAt: timestamp
  usageCount: number
}

// Memory
memories {
  id: string
  employeeId: string
  type: 'meeting' | 'task' | 'learning' | 'interaction'
  content: string
  importance: number
  createdAt: timestamp
}

// Meetings
meetings {
  id: string
  type: 'standup' | 'sync' | 'ping'
  participants: string[] (employeeIds)
  transcript: string
  createdAt: timestamp
}

// Costs
costs {
  id: string
  employeeId?: string
  taskId?: string
  type: 'api' | 'mcp' | 'storage'
  amount: number
  currency: 'USD'
  timestamp: timestamp
}
```

## API Endpoints

```
POST /api/tasks
  - CEO creates high-level task
  - Triggers HR workflow

GET /api/employees
  - List all employees

GET /api/employees/[id]
  - Employee details
  - Memory
  - Activity log

GET /api/tasks
  - List all tasks

GET /api/tasks/[id]
  - Task details
  - Subtasks
  - Deliverables

GET /api/deliverables
  - List all deliverables

GET /api/costs
  - Cost breakdown
  - By employee
  - By task
  - Total

GET /api/mcp-servers
  - List all MCP servers
  - Usage stats
```

## CEO Dashboard Views

1. **Task Input**
   - Text area for high-level task
   - Submit button
   - Task status

2. **Employee View**
   - List of ICs
   - Current tasks
   - Status (working, blocked, etc.)

3. **Task Progress**
   - High-level task
   - Subtasks breakdown
   - Progress bars
   - Blockers

4. **Deliverables**
   - List of deliverables
   - Evaluation scores
   - Download/view

5. **Costs**
   - Total cost
   - Cost by employee
   - Cost by task
   - Cost trends

6. **MCP Servers**
   - List of discovered/created servers
   - Usage stats
   - Created by

## Success Criteria

- ✅ CEO enters "Build a Next.js app that does XYZ"
- ✅ HR creates plan and hires 3-5 ICs
- ✅ ICs break down task into 10+ subtasks
- ✅ ICs collaborate via 2+ standups
- ✅ ICs discover/create 1+ MCP servers
- ✅ ICs use MCP servers to complete work
- ✅ ICs remember context across tasks
- ✅ Managers evaluate all deliverables
- ✅ Complete, working Next.js app produced
- ✅ All costs tracked and visible

---

**Document Version**: 1.0  
**Created**: 2024-01-XX  
**Status**: MVP Architecture

