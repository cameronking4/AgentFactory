# AI Agent Factory - Product Requirements Document (PRD)

## Executive Summary

Transform the current Actor Pattern demonstration into a fully autonomous **AI Agent Factory** - an enterprise simulation where AI agents function as employees with distinct roles, hierarchies, and capabilities. The system operates 24/7, with agents collaborating through scheduled meetings, scrums, and syncs, while a CEO interface provides oversight and control over the entire organization.

## Vision

Create a self-sustaining AI enterprise where:
- **HR Department** continuously hires and manages AI agent employees
- **Employees** are long-running, autonomous workflows with distinct roles and responsibilities
- **Collaboration** happens through scheduled meetings, scrums, and cross-functional syncs
- **Management** tracks performance, handles promotions, PIPs, and terminations
- **CEO Dashboard** provides real-time visibility and control over the entire organization

---

## 1. Architecture Overview

### 1.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CEO Dashboard (Frontend)                  │
│  - Organization Overview                                     │
│  - Employee Management                                       │
│  - Performance Analytics                                     │
│  - Meeting Scheduler                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                    API Layer (Next.js)                       │
│  - /api/hr/*          (Hiring, PIP, Promote, Fire)          │
│  - /api/employees/*   (Employee CRUD, State)                 │
│  - /api/meetings/*    (Schedule, Join, Record)               │
│  - /api/org/*         (Org structure, Reports)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│              Workflow Layer (Vercel Workflows)               │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ HR Workflow  │  │ Employee     │  │ Meeting      │      │
│  │              │  │ Workflows    │  │ Orchestrator │      │
│  │ - Hiring     │  │ - Chief of   │  │              │      │
│  │ - PIP        │  │   Staff      │  │ - Scrums     │      │
│  │ - Promote    │  │ - Director   │  │ - Syncs      │      │
│  │ - Fire       │  │ - Manager    │  │ - 1:1s       │      │
│  └──────────────┘  │ - IC         │  └──────────────┘      │
│                    └──────────────┘                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│              State & Communication Layer                     │
│  - Persistent State Store (Redis/Upstash)                    │
│  - Inter-Actor Communication (Hooks/Events)                  │
│  - Meeting Scheduler (Cron-like workflows)                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Core Principles

1. **Actor Pattern Foundation**: Each employee is a long-running workflow actor
2. **Type-Safe Communication**: Use `defineHook()` for all inter-actor communication and lookup
3. **Durable State**: All state persisted in Redis (caching) + Postgres Neon (Drizzle ORM)
4. **Autonomous Operation**: Agents operate independently with minimal CEO intervention, both proactive and reactive
5. **Hierarchical Structure**: Clear reporting lines and responsibilities with top-down task flow
6. **Performance Tracking**: Built-in metrics, evaluation system, and observability (memory, activity logs, token tracking)
7. **Real Deliverables**: Employees produce actual work outputs (text-based for now, tools/MCP servers later)
8. **24/7 Operation**: Agents work continuously, helping peers and completing tasks autonomously

---

## 2. Employee Types & Hierarchy

### 2.1 Employee Roles

#### **Chief of Staff (CoS)**
- **Level**: Executive (C-Suite)
- **Responsibilities**:
  - Strategic planning and execution
  - Cross-functional coordination
  - Direct reports: Directors
  - CEO's primary interface
- **Capabilities**:
  - High-level decision making
  - Resource allocation
  - Strategic AI reasoning 
  - Can initiate company-wide initiatives

#### **Director**
- **Level**: Senior Leadership
- **Responsibilities**:
  - Department/function leadership
  - Direct reports: Managers
  - Quarterly planning
  - Cross-department collaboration
- **Capabilities**:
  - Department-level strategy
  - Team management
  - AI reasoning (GPT-4o)
  - Can schedule department meetings
  - Can evaluate direct reports' performance

#### **Manager**
- **Level**: Middle Management
- **Responsibilities**:
  - Team leadership
  - Direct reports: ICs
  - Weekly planning
  - Daily standups
- **Capabilities**:
  - Team coordination
  - Task delegation
  - AI reasoning (GPT-4o)
  - Can schedule team meetings
  - Can evaluate direct reports' performance
  - Can work with other managers

#### **Individual Contributor (IC)**
- **Level**: Individual Contributor
- **Responsibilities**:
  - Task execution
  - No direct reports
  - Daily work
  - Serious task completion
  - Work is evaluated and persisted
  - Participation in meetings
  - Collaborative work with other ICs
- **Capabilities**:
  - Task completion with real deliverables
  - AI reasoning (GPT-4o)
  - Can request help from manager
  - Can ping/collaborate with peers
  - Can use MCP servers for tools

### 2.2 Employee State Schema

```typescript
interface EmployeeState {
  // Identity
  employeeId: string;           // workflowRunId
  name: string;
  persona?: string;             // Personality/behavior traits
  role: 'chief-of-staff' | 'director' | 'manager' | 'ic';
  department?: 'engineering' | 'sales' | string;  // Can be extended
  
  // Hierarchy
  managerId?: string;           // Reports to
  directReports: string[];      // Manages
  
  // Performance
  performanceScore: number;     // 0-100
  performanceHistory: PerformanceReview[];
  status: 'active' | 'pip' | 'on-leave' | 'terminated';
  pipStartDate?: string;
  
  // Work
  currentTasks: Task[];
  completedTasks: Task[];
  deliverables: Deliverable[];  // Real work outputs
  skills: string[];
  
  // Meetings
  scheduledMeetings: Meeting[];
  meetingHistory: Meeting[];
  asyncPings: Ping[];           // Async messages/pings from other agents
  
  // Memory & Observability
  memory: MemoryEntry[];        // Long-term memory/context
  activityLog: ActivityLogEntry[];  // All activities
  tokenUsage: {
    total: number;
    byDate: Record<string, number>;
    byTask: Record<string, number>;
  };
  
  // Tools & MCP Servers
  assignedMCPs: string[];       // MCP server IDs assigned
  discoveredMCPs: string[];     // MCP servers discovered/self-assigned
  
  // Metadata
  hireDate: string;
  lastActive: string;
  aiModel: string;              // GPT-4o for all roles
}

interface Deliverable {
  id: string;
  taskId: string;
  type: 'text' | 'document' | 'code' | 'report';
  content: string;
  createdAt: string;
  evaluatedBy?: string;         // Employee ID who evaluated
  evaluationScore?: number;
}

interface MemoryEntry {
  id: string;
  type: 'meeting' | 'task' | 'interaction' | 'learning';
  content: string;
  timestamp: string;
  importance: number;           // 0-1, for memory prioritization
}

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: 'task_start' | 'task_complete' | 'meeting' | 'ping' | 'evaluation' | 'tool_use';
  description: string;
  metadata?: Record<string, any>;
}

interface Ping {
  id: string;
  from: string;                 // Employee ID
  to: string;                   // Employee ID
  message: string;
  timestamp: string;
  responded: boolean;
}
```

---

## 3. Inter-Actor Communication

### 3.1 Communication Types

#### **Scheduled Meetings**
Formal meetings scheduled at specific times with transcripts and outcomes.

#### **Async Pings/Messages**
Informal, asynchronous communication between agents. Agents can ping each other at any time to:
- Ask for help
- Request collaboration
- Share information
- Escalate issues
- Coordinate work

Pings are stored in employee state and can be responded to when the recipient is available.

### 3.2 Meeting Types

#### **Daily Standup (Scrum)**
- **Frequency**: Daily (configurable time)
- **Participants**: Manager + all ICs in team
- **Duration**: 15 minutes (scheduled communication window)
- **Format**: Each participant shares:
  - What they did yesterday
  - What they're doing today
  - Blockers
- **Outcomes**: 
  - Meeting transcript generated
  - Action items created as tasks
  - Blockers unblocked or escalated
- **Implementation**: Scheduled workflow that triggers at set time

#### **Weekly Sync**
- **Frequency**: Weekly
- **Participants**: Manager + Direct Reports
- **Duration**: 30 minutes (scheduled communication window)
- **Format**: Review week, plan next week, discuss blockers
- **Outcomes**: 
  - Meeting transcript
  - Tasks created for next week
  - Learning/insights stored in memory

#### **1:1 Meeting**
- **Frequency**: Bi-weekly or monthly
- **Participants**: Manager + Individual Report
- **Duration**: 30 minutes (scheduled communication window)
- **Format**: Performance check-in, career development, feedback
- **Outcomes**:
  - Meeting transcript
  - Performance feedback stored
  - Development goals set as tasks

#### **Department All-Hands**
- **Frequency**: Monthly
- **Participants**: Director + all department members
- **Duration**: 60 minutes (scheduled communication window)
- **Format**: Department updates, announcements, Q&A
- **Outcomes**:
  - Meeting transcript
  - Department-wide tasks/initiatives
  - Cross-team learning shared

### 3.3 Meeting Implementation Pattern

Meetings are **scheduled communication windows** where agents communicate. They don't require calendar blocking but happen at scheduled times.

```typescript
// Meeting orchestrator workflow
export async function meetingOrchestrator(meeting: Meeting) {
  "use workflow";
  
  globalThis.fetch = fetch;
  
  // Wait until meeting time
  await sleepUntil(meeting.scheduledTime);
  
  // Notify all participants
  const participants = await getParticipants(meeting.participantIds);
  
  // Start meeting workflow for each participant
  await Promise.all(
    participants.map(participant => 
      employeeMeetingHook.resume(
        `employee:${participant.employeeId}`,
        { type: 'join-meeting', meeting }
      )
    )
  );
  
  // Conduct meeting (AI-driven discussion)
  const meetingTranscript = await conductMeeting(meeting, participants);
  
  // Generate meeting outcomes (tasks, unblocks, learnings)
  const outcomes = await generateMeetingOutcomes(meetingTranscript, meeting);
  
  // Create tasks from action items
  if (outcomes.actionItems.length > 0) {
    await Promise.all(
      outcomes.actionItems.map(item => createTaskFromActionItem(item))
    );
  }
  
  // Unblock agents if blockers resolved
  if (outcomes.unblocks.length > 0) {
    await Promise.all(
      outcomes.unblocks.map(unblock => 
        employeeTaskHook.resume(
          `employee:${unblock.employeeId}`,
          { type: 'unblock', blocker: unblock.blocker }
        )
      )
    );
  }
  
  // Save meeting transcript and outcomes
  await saveMeetingTranscript(meeting.id, meetingTranscript, outcomes);
  
  // Update all participants' state with meeting memory
  await Promise.all(
    participants.map(participant =>
      employeeMeetingHook.resume(
        `employee:${participant.employeeId}`,
        { type: 'meeting-complete', meeting, transcript: meetingTranscript, outcomes }
      )
    )
  );
}
```

### 3.4 Async Ping Implementation

```typescript
// Ping another employee
export async function pingEmployee(
  fromEmployeeId: string,
  toEmployeeId: string,
  message: string
) {
  "use step";
  
  const ping: Ping = {
    id: generateId(),
    from: fromEmployeeId,
    to: toEmployeeId,
    message,
    timestamp: new Date().toISOString(),
    responded: false,
  };
  
  // Send ping to recipient
  await employeePingHook.resume(
    `employee:${toEmployeeId}`,
    { type: 'ping', ping }
  );
  
  // Store in sender's state
  await addPingToState(fromEmployeeId, ping);
}
```

### 3.5 Inter-Employee Communication

Employees communicate via hooks:
- **Task Assignment**: Manager → IC (top-down flow)
- **Status Updates**: IC → Manager (bottom-up flow)
- **Escalation**: IC → Manager → Director → CoS
- **Collaboration**: Peer-to-peer via shared tasks and async pings
- **Proactive Help**: Employees can proactively help peers when they see blockers
- **Reactive Response**: Employees respond to pings, tasks, and meeting requests

---

## 4. Task Flow & Work Distribution

### 4.1 Top-Down Task Flow

Tasks flow from top to bottom in the hierarchy, simulating real enterprise work distribution:

1. **CEO/Chief of Staff** sets high-level objectives and strategic work
2. **Directors** break down objectives into department-level tasks and review work done
3. **Managers** optimize and delegate tasks to ICs, coordinate with other managers
4. **ICs** execute tasks, produce deliverables, and work collaboratively with other ICs

### 4.2 Task Lifecycle

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string;           // Employee ID
  assignedBy: string;           // Employee ID (manager/CEO)
  status: 'pending' | 'in-progress' | 'blocked' | 'completed' | 'reviewed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  department?: string;
  deliverables: Deliverable[];  // Real work outputs
  blockers: string[];
  createdAt: string;
  dueDate?: string;
  completedAt?: string;
  reviewedBy?: string;          // Who reviewed the work
  reviewScore?: number;         // Quality score
}
```

### 4.3 Work Review Process

- **CoS** reviews Directors' work
- **Directors** review Managers' work
- **Managers** review ICs' work
- **ICs** can review peer work for collaboration
- Review scores contribute to performance evaluation

### 4.4 Proactive & Reactive Behavior

Employees are **both proactive and reactive**:

**Proactive:**
- Take initiative on tasks
- Help peers when they see blockers
- Suggest improvements
- Create tasks for themselves based on goals
- Discover and recommend MCP servers

**Reactive:**
- Respond to task assignments
- Answer pings from peers
- Attend scheduled meetings
- Handle escalations
- Respond to manager requests

## 5. HR & Management Systems

### 5.1 HR Workflow

The HR workflow is a special actor that manages the entire employee lifecycle:

```typescript
export async function hrWorkflow(initialState: HRState) {
  "use workflow";
  
  globalThis.fetch = fetch;
  
  const metadata = getWorkflowMetadata();
  const hrId = metadata.workflowRunId;
  
  // Create hooks for HR events
  const receiveHRRequest = hrHook.create({
    token: `hr:${hrId}`,
  });
  
  // Event loop for HR operations
  for await (const request of receiveHRRequest) {
    switch (request.type) {
      case 'hire':
        await hireEmployee(request.role, request.department, request.managerId);
        break;
      case 'pip':
        await startPIP(request.employeeId, request.reason);
        break;
      case 'promote':
        await promoteEmployee(request.employeeId, request.newRole);
        break;
      case 'fire':
        await terminateEmployee(request.employeeId, request.reason);
        break;
    }
  }
}
```

### 5.2 Hiring Process

1. **CEO/HR initiates hire** via API
2. **HR workflow** creates new employee workflow
3. **Employee workflow** starts with initial state
4. **Onboarding** tasks assigned automatically
5. **Welcome meeting** scheduled with manager

### 5.3 Performance Improvement Plan (PIP)

1. **Trigger**: Performance score drops below threshold
2. **HR workflow** initiates PIP
3. **Employee state** updated to `status: 'pip'`
4. **PIP goals** set and tracked
5. **Review period** (e.g., 3 days)
6. **Outcome**: Improvement → Continue, No improvement → Termination

### 5.4 Promotion Process

**Simple Automatic Promotion:**
1. **Trigger**: Performance score > 85 for sustained period + tenure requirement
2. **HR workflow** automatically evaluates and promotes
3. **Role change** in employee state
4. **Hierarchy update** (new direct reports, new manager)
5. **Announcement** via department all-hands

### 5.5 Termination Process

1. **Trigger**: PIP failure, CEO decision, or performance threshold
2. **HR workflow** initiates termination
3. **Employee workflow** receives termination event
4. **State** updated to `status: 'terminated'`
5. **Workflow** gracefully shuts down
6. **Tasks** reassigned to other employees or manager

---

### 5.6 Performance Evaluation

Some employees (Managers, Directors) can evaluate others:
- **Managers** evaluate their direct reports (ICs)
- **Directors** evaluate their direct reports (Managers)
- **CoS** evaluates Directors
- Evaluation uses:
  - Employee state (activity log, deliverables)
  - Work quality (review scores)
  - Meeting participation
  - Token usage efficiency
  - Collaboration metrics

## 6. Departments & Organization Structure

### 6.1 Initial Departments

- **Engineering**: Technical work, development, infrastructure
- **Sales**: Sales activities, customer engagement, revenue

### 6.2 Department Creation

Departments can be created by:
- **CEO**: Direct creation via dashboard
- **HR**: Autonomous creation when needed
- **Chief of Staff**: Strategic department creation
- **Reorganization**: Departments can be split, merged, or reorganized

### 6.3 Scaling

- **Initial Size**: 25 employees
- **Autonomous Growth**: Organization can grow autonomously as needed
- **Max Limit**: CEO can set maximum employee limit
- **Hierarchy Depth**: Can go infinitely deep (CoS → Director → Manager → IC, or deeper)

## 7. CEO Dashboard

### 7.1 Dashboard Views

#### **Organization Overview**
- Org chart visualization
- Total employees by role
- Active vs. PIP vs. Terminated
- Real-time activity feed

#### **Employee Management**
- List all employees with filters
- Individual employee profiles
- Performance scores
- Quick actions: Hire, PIP, Promote, Fire

#### **Performance Analytics**
- Performance trends over time
- Department comparisons
- Top performers
- Employees at risk (low performance)

#### **Meeting Calendar**
- Upcoming meetings
- Meeting history
- Meeting notes and outcomes
- Schedule new meetings

#### **Task Board**
- All active tasks across organization
- Task assignments
- Completion rates
- Blockers

### 7.2 CEO Actions

- **Hire Employee**: Select role, department, manager
- **View Employee**: See full profile, performance, tasks
- **Start PIP**: Select employee, set goals, duration
- **Promote**: Select employee, new role
- **Terminate**: Select employee, reason
- **Schedule Meeting**: Create ad-hoc meetings
- **Send Directive**: Broadcast message to all employees

---

## 8. Technical Implementation

### 8.1 Technology Stack

- **Runtime**: Vercel Workflows (4.0.1-beta.6)
- **AI SDK**: Vercel AI SDK (^5.0.89) with GPT-4o
- **State Storage**: 
  - Redis (caching, fast lookups)
  - Postgres Neon (Drizzle ORM) for persistent data
- **Scheduling**: Vercel Cron
- **Real-time**: Vercel SSE (Server-Sent Events)
- **Webhooks**: Vercel Webhooks
- **Frontend**: Next.js 16 with React 19
- **ORM**: Drizzle for database operations

### 8.2 Workflow Structure

```
workflows/
├── hr/
│   └── hr-workflow.ts          # HR management workflow
├── employees/
│   ├── base-employee.ts        # Base employee workflow (shared logic)
│   ├── chief-of-staff.ts       # CoS-specific logic
│   ├── director.ts             # Director-specific logic
│   ├── manager.ts              # Manager-specific logic
│   └── ic.ts                   # IC-specific logic
├── meetings/
│   ├── meeting-orchestrator.ts # Coordinates meetings
│   ├── standup.ts              # Daily standup logic
│   ├── sync.ts                 # Weekly sync logic
│   └── one-on-one.ts           # 1:1 meeting logic
└── scheduling/
    └── meeting-scheduler.ts    # Schedules recurring meetings
```

### 8.3 State Management

- **Redis**: Fast caching and lookups
  - Employee state cache
  - Meeting state cache
  - Real-time activity feeds
- **Postgres Neon (Drizzle)**: Persistent storage
  - Employee records and state
  - Task history
  - Meeting transcripts
  - Deliverables
  - Performance history
  - Activity logs
  - Token usage tracking
  - Memory entries
- **Employee State**: Per-employee state in database + Redis cache
- **Organization State**: Global org structure in database
- **Meeting State**: Meeting data in database with transcripts

### 8.4 API Routes

```
app/api/
├── hr/
│   ├── route.ts                # POST: Hire employee
│   ├── pip/
│   │   └── route.ts            # POST: Start PIP
│   ├── promote/
│   │   └── route.ts            # POST: Promote employee
│   └── terminate/
│       └── route.ts            # POST: Terminate employee
├── employees/
│   ├── route.ts                # GET: List all, POST: Create
│   └── [employeeId]/
│       ├── route.ts            # GET: Employee details
│       ├── state/
│       │   └── route.ts        # GET: Employee state
│       └── event/
│           └── route.ts        # POST: Send event to employee
├── meetings/
│   ├── route.ts                # GET: List, POST: Create
│   └── [meetingId]/
│       ├── route.ts            # GET: Meeting details
│       └── notes/
│           └── route.ts        # GET: Meeting notes
└── org/
    ├── structure/
    │   └── route.ts            # GET: Org chart
    └── analytics/
        └── route.ts            # GET: Performance analytics
```

### 8.5 Frontend Structure

```
app/
├── (dashboard)/
│   ├── layout.tsx              # Dashboard layout
│   ├── page.tsx                # Organization overview
│   ├── employees/
│   │   ├── page.tsx            # Employee list
│   │   └── [id]/
│   │       └── page.tsx        # Employee profile
│   ├── meetings/
│   │   ├── page.tsx            # Meeting calendar
│   │   └── [id]/
│   │       └── page.tsx        # Meeting details
│   └── analytics/
│       └── page.tsx            # Performance analytics
└── components/
    ├── org-chart.tsx           # Org chart visualization
    ├── employee-card.tsx       # Employee card component
    ├── meeting-calendar.tsx    # Meeting calendar
    └── performance-chart.tsx   # Performance visualization
```

---

## 9. Performance & Lifecycle Management

### 9.1 Performance Scoring

Performance is calculated based on **real work output**:
- **Task Completion Rate**: % of tasks completed on time
- **Deliverable Quality**: Evaluation scores of actual work outputs
- **Meeting Participation**: Attendance and engagement
- **Activity Log**: Volume and value of activities
- **Token Efficiency**: Work quality per token used
- **Collaboration**: Peer feedback and cross-functional work
- **Initiative**: Proactive problem-solving and help
- **Accuracy**: Correctness of deliverables and decisions

### 9.2 Performance Review Cycle

- **Daily**: Automated performance score update based on activity
- **Weekly**: Manager reviews and feedback
- **Monthly**: Formal performance review by evaluators
- **Automatic**: PIP and promotion triggers based on thresholds

### 9.3 PIP Criteria (Automatic)

- Performance score < 60 for sustained period
- Multiple missed deadlines
- Low deliverable quality scores
- Low meeting participation
- **Automatic Trigger**: HR workflow automatically starts PIP

### 9.4 Promotion Criteria (Automatic)

- Performance score > 85 for sustained period
- Minimum tenure in current role
- Available position in hierarchy
- **Automatic Trigger**: HR workflow automatically promotes

---

## 10. MCP Servers & Tools

### 10.1 MCP Server Assignment

Employees can use MCP (Model Context Protocol) servers for tools:
- **Assigned at Creation**: CEO/HR can assign MCP servers when hiring
- **Self-Discovery**: Employees can find and self-assign MCP servers
- **Company Creation**: Employees can create MCP servers for company use
- **Research & Recommendation**: Researchers can find available MCP servers online and recommend them

### 10.2 MCP Server Lifecycle

1. **Discovery**: Employee discovers useful MCP server
2. **Testing**: Employee tests MCP server on tasks
3. **Recommendation**: Employee recommends to manager/department
4. **Company Adoption**: MCP server becomes available company-wide
5. **Task Creation**: "Create MCP server for X" can be a task
6. **Autonomous Usage**: Other employees start using it autonomously

### 10.3 Tool Execution

- Tools execute as step functions (durable, retryable)
- Tool usage tracked in activity log
- Token usage tracked per tool
- Tool failures handled gracefully

## 11. Observability & Memory

### 11.1 Memory System

Employees have **long-term memory**:
- Meeting transcripts and learnings
- Task outcomes and lessons
- Interactions with other employees
- Important decisions and context
- Memory prioritized by importance score

### 11.2 Activity Logging

All activities are logged:
- Task starts/completions
- Meeting participation
- Pings sent/received
- Tool usage
- Evaluations performed
- Deliverables created

### 11.3 Token Tracking

- Total token usage tracked
- Token usage by date
- Token usage by task
- Token efficiency metrics (work quality per token)

### 11.4 Observability Dashboard

CEO can view:
- Real-time activity feeds
- Token usage across organization
- Memory insights
- Performance trends
- System health

## 12. Open Questions & Decisions Needed

*Note: Most questions have been answered. This section is kept for reference and future considerations.*

**Q1: How autonomous should employees be?**
- Should they proactively take on tasks, or wait for assignments?
- Should they initiate meetings with their manager when blocked?
- Should they collaborate with peers without manager approval?

**Q2: What tasks do employees actually work on?**
- Are tasks pre-defined by CEO?
- Do employees generate their own tasks based on goals?
- Is there a task marketplace/system?

### 8.2 Meeting Dynamics

**Q3: How realistic should meetings be?**
- Should meetings have actual AI-driven conversations?
- Should meeting notes be generated by AI?
- Should meetings have action items that become tasks?

**Q4: Meeting scheduling:**
- Should meetings be automatically scheduled based on calendar?
- Should employees have availability/calendar conflicts?
- Can meetings be rescheduled or cancelled?

### 8.3 Performance & Evaluation

**Q5: How is performance actually measured?**
- Is it based on simulated work output?
- Should there be actual deliverables (documents, code, reports)?
- How do we evaluate quality of AI-generated work?

**Q6: PIP and promotion automation:**
- Should PIPs be automatically triggered by performance thresholds?
- Should promotions be automatic or require CEO approval?
- Should there be a review/approval workflow?

### 8.4 Organization Structure

**Q7: Department structure:**
- Should there be departments (Engineering, Sales, Marketing, etc.)?
- How are departments organized?
- Do departments have different goals/metrics?

**Q8: Scaling:**
- What's the maximum number of employees?
- Should there be multiple CoS or just one?
- How deep should the hierarchy go (CoS → Director → Manager → IC)?

### 8.5 CEO Interface

**Q9: CEO interaction level:**
- Should CEO be able to directly assign tasks to employees?
- Should CEO be able to join meetings?
- Should CEO receive daily/weekly reports automatically?

**Q10: Real-time vs. Batch:**
- Should updates be real-time (WebSockets/SSE)?
- Is polling acceptable for state updates?
- How often should analytics refresh?

### 8.6 Technical Decisions

**Q11: State persistence:**
- Redis vs. Upstash vs. Database?
- How to handle state migrations?
- Backup and recovery strategy?

**Q12: Meeting scheduling:**
- How to implement cron-like scheduling in Vercel Workflows?
- Should we use external scheduler or workflow-based?
- How to handle timezone differences?

**Q13: Inter-actor communication:**
- Should all communication go through hooks?
- Should there be a message bus/event system?
- How to handle communication failures?

### 8.7 AI Model Selection

**Q14: Model assignment:**
- Should model be based on role (CoS = GPT-4o, IC = GPT-4o-mini)?
- Should model be configurable per employee?
- Should we use different models for different tasks?

**Q15: AI capabilities:**
- Should employees have access to tools (web search, code execution, etc.)?
- Should there be role-specific tools?
- How to handle tool execution failures?

---

## 13. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Base employee workflow with role types
- [ ] HR workflow for hiring
- [ ] State management (Redis + Postgres Neon with Drizzle)
- [ ] CEO dashboard: Employee list and basic actions
- [ ] Basic employee state schema (identity, hierarchy, performance)
- [ ] Activity logging system

### Phase 2: Hierarchy & Communication (Week 3-4)
- [ ] Manager-IC relationships
- [ ] Basic inter-actor communication (hooks)
- [ ] Task assignment system (top-down flow)
- [ ] Org chart visualization
- [ ] Departments (Engineering, Sales)
- [ ] Async ping system

### Phase 3: Meetings & Work (Week 5-6)
- [ ] Meeting orchestrator workflow
- [ ] Daily standup implementation
- [ ] Meeting scheduling system (Vercel Cron)
- [ ] Meeting transcript generation
- [ ] Task creation from meeting outcomes
- [ ] Deliverable system (real work outputs)
- [ ] Work review process

### Phase 4: Performance & Lifecycle (Week 7-8)
- [ ] Performance scoring system (based on real deliverables)
- [ ] Employee evaluation system (managers evaluate reports)
- [ ] Automatic PIP workflow
- [ ] Automatic promotion workflow
- [ ] Termination workflow
- [ ] Memory system
- [ ] Token tracking

### Phase 5: Advanced Features (Week 9-10)
- [ ] Weekly syncs and 1:1s
- [ ] Department all-hands
- [ ] Performance analytics dashboard
- [ ] Advanced CEO actions
- [ ] Proactive behavior (helping peers, initiative)
- [ ] Personas system
- [ ] Observability dashboard

### Phase 6: MCP Servers & Tools (Week 11-12)
- [ ] MCP server assignment system
- [ ] MCP server discovery
- [ ] Tool execution as step functions
- [ ] MCP server creation tasks
- [ ] Company-wide MCP server adoption

### Phase 7: Polish & Optimization (Week 13-14)
- [ ] UI/UX improvements
- [ ] Performance optimization
- [ ] Error handling and recovery
- [ ] Documentation and testing
- [ ] Scaling to 25+ employees
- [ ] Autonomous growth features

---

## 14. Success Metrics

- **Autonomy**: Company runs for 24+ hours without CEO intervention
- **Engagement**: Employees actively participate in meetings, complete tasks, and help peers
- **Performance**: Performance scores reflect realistic work patterns based on real deliverables
- **Scalability**: System handles 25+ employees initially, can scale autonomously
- **Reliability**: 99.9% uptime for employee workflows
- **User Experience**: CEO can manage organization with < 5 clicks for common actions
- **Real Work**: Employees produce actual deliverables that are evaluated
- **Collaboration**: Employees proactively help peers and collaborate effectively
- **Memory**: Employees remember important context and learnings
- **Observability**: Full visibility into activity, token usage, and performance

---

## 15. Personas

Employees can have **personas** that influence behavior:
- **Personality Traits**: Proactive, analytical, collaborative, independent
- **Work Style**: Fast-paced, methodical, creative, detail-oriented
- **Communication Style**: Direct, diplomatic, technical, friendly
- **Decision Making**: Data-driven, intuitive, consensus-based, decisive

Personas affect:
- How employees approach tasks
- Communication patterns
- Meeting participation style
- Collaboration preferences
- Tool/MCP server preferences

---

## 16. Appendix: Example Employee Workflow

```typescript
export async function employeeWorkflow(initialState: EmployeeState) {
  "use workflow";
  
  globalThis.fetch = fetch;
  
  const metadata = getWorkflowMetadata();
  const employeeId = metadata.workflowRunId;
  
  // Initialize state
  const existingState = await getEmployeeState(employeeId);
  if (!existingState) {
    await setEmployeeState(employeeId, initialState);
  }
  
  // Create hooks for different event types
  const receiveTask = employeeTaskHook.create({
    token: `employee:${employeeId}:tasks`,
  });
  
  const receiveMeeting = employeeMeetingHook.create({
    token: `employee:${employeeId}:meetings`,
  });
  
  const receiveHR = employeeHRHook.create({
    token: `employee:${employeeId}:hr`,
  });
  
  // Main event loop - both proactive and reactive
  while (true) {
    // Reactive: Process tasks
    for await (const task of receiveTask) {
      await processTask(employeeId, task);
      await logActivity(employeeId, 'task_complete', task);
    }
    
    // Reactive: Process meetings
    for await (const meeting of receiveMeeting) {
      const transcript = await attendMeeting(employeeId, meeting);
      await saveToMemory(employeeId, transcript, 'meeting');
      await logActivity(employeeId, 'meeting', meeting);
    }
    
    // Reactive: Process pings
    for await (const ping of receivePing) {
      await respondToPing(employeeId, ping);
      await logActivity(employeeId, 'ping', ping);
    }
    
    // Reactive: Process HR events (PIP, promote, fire)
    for await (const hrEvent of receiveHR) {
      await handleHREvent(employeeId, hrEvent);
      if (hrEvent.type === 'terminate') {
        return; // Exit workflow
      }
    }
    
    // Proactive: Autonomous work
    await performAutonomousWork(employeeId);
    
    // Proactive: Help peers if they have blockers
    await checkAndHelpPeers(employeeId);
    
    // Proactive: Discover and recommend MCP servers
    await discoverMCPs(employeeId);
  }
}
```

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-XX  
**Status**: Draft - Awaiting Review

