# Autonomous Behavior & Meetings - Current State & Next Steps

## Current Flow (What's Working)

```
HR receives task
  ↓
HR ensures manager exists (creates if needed) ✅
  ↓
HR determines IC requirements
  ↓
HR hires ICs (with managerId assigned) ✅
  ↓
IC receives task (REACTIVE) ✅
  ↓
IC completes task and creates deliverable
  ↓
IC requests evaluation from assigned manager ✅
  ↓
Manager evaluates deliverable
  ↓
Task marked as reviewed
```

## Where Autonomous Behavior Should Happen

### 1. **Proactive Task Checking** ✅ (Implemented)
**Location**: IC workflow main loop
```typescript
// Proactive: Check for new tasks assigned to this IC
await checkForNewTasks(employeeId);
```
**Status**: ✅ Working - ICs proactively check for new tasks

### 2. **Proactive Peer Help** ❌ (Not Implemented)
**Location**: IC workflow main loop (currently commented out)
```typescript
// Proactive: Help peers if they have blockers (placeholder for now)
// await checkAndHelpPeers(employeeId);
```
**What it should do**:
- IC checks database for peers with blocked tasks
- IC identifies if they can help based on skills
- IC proactively offers help via ping or takes on subtask
- IC collaborates to unblock peers

**When it happens**: Continuously in the IC workflow loop

### 3. **Proactive MCP Discovery** ❌ (Not Implemented)
**Location**: IC workflow main loop (currently commented out)
```typescript
// Proactive: Discover MCP servers (placeholder for now)
// await discoverMCPs(employeeId);
```
**What it should do**:
- IC checks current task requirements
- IC searches for relevant MCP servers (web search, registry)
- IC evaluates usefulness
- IC self-assigns useful MCP servers
- IC creates new MCP servers if needed

**When it happens**: When IC has active tasks that could benefit from tools

### 4. **Proactive Task Creation** ❌ (Not Implemented)
**What it should do**:
- IC identifies improvements or optimizations
- IC creates tasks for themselves
- IC suggests tasks to manager
- IC takes initiative on related work

**When it happens**: After completing tasks, during reflection

## Where Meetings Should Happen

### 1. **Scheduled Standups** ❌ (Not Implemented)
**Location**: Separate meeting orchestrator workflow
**Frequency**: Daily (configurable)
**Participants**: Manager + all ICs in team
**What happens**:
```
Manager schedules standup
  ↓
Meeting orchestrator workflow starts
  ↓
Wait until scheduled time
  ↓
Notify all participants via meeting hooks
  ↓
ICs join meeting (REACTIVE - via receiveMeeting hook)
  ↓
AI-driven discussion:
  - Each IC shares: yesterday's work, today's plan, blockers
  ↓
Generate meeting transcript
  ↓
Create action items as tasks
  ↓
Unblock ICs if blockers resolved
  ↓
Save transcript to database
  ↓
Store in all participants' memories
```

**Current Status**: 
- ✅ Meeting hooks exist (`icMeetingHook`)
- ✅ `attendMeeting()` function exists (but is TODO)
- ❌ Meeting orchestrator workflow doesn't exist
- ❌ No meeting scheduling system

### 2. **Weekly Sync Meetings** ❌ (Not Implemented)
**Location**: Meeting orchestrator workflow
**Frequency**: Weekly
**Participants**: Manager + Direct Reports
**What happens**: Review week, plan next week, discuss blockers

### 3. **1:1 Meetings** ❌ (Not Implemented)
**Location**: Meeting orchestrator workflow
**Frequency**: Bi-weekly or monthly
**Participants**: Manager + Individual IC
**What happens**: Performance check-in, career development, feedback

### 4. **Async Pings** ⚠️ (Partially Implemented)
**Location**: IC workflow main loop
**Current Status**:
- ✅ Ping hooks exist (`icPingHook`)
- ✅ `respondToPing()` function exists (but is TODO)
- ❌ No system to send pings between ICs
- ❌ No proactive ping sending

**What it should do**:
- ICs can ping each other for help
- ICs can ping manager for escalation
- ICs respond to pings when received
- Pings stored in database and employee state

## Current Implementation Status

### ✅ Implemented
1. **Reactive Task Processing**: ICs receive and process tasks
2. **Proactive Task Checking**: ICs check for new tasks
3. **Meeting Hooks**: Infrastructure exists for meetings
4. **Ping Hooks**: Infrastructure exists for pings
5. **Memory System**: ICs save memories of work

### ⚠️ Partially Implemented
1. **Meeting Attendance**: Function exists but is TODO
2. **Ping Response**: Function exists but is TODO

### ❌ Not Implemented
1. **Proactive Peer Help**: `checkAndHelpPeers()` commented out
2. **MCP Discovery**: `discoverMCPs()` commented out
3. **Meeting Orchestrator**: No workflow to schedule/run meetings
4. **Meeting Scheduling**: No system to create scheduled meetings
5. **Ping Sending**: No way for ICs to send pings to each other
6. **Proactive Task Creation**: ICs don't create their own tasks

## Updated Flow with Autonomous Behavior & Meetings

```
HR receives task
  ↓
HR ensures manager exists (creates if needed) ✅
  ↓
HR determines IC requirements
  ↓
HR hires ICs (with managerId assigned) ✅
  ↓
IC receives task (REACTIVE) ✅
  ↓
IC proactively checks for new tasks ✅
  ↓
IC proactively discovers MCP servers (if needed) ❌
  ↓
IC breaks down task
  ↓
IC executes subtasks
  ↓
IC proactively helps peers with blockers ❌
  ↓
IC creates deliverable
  ↓
IC requests evaluation from assigned manager ✅
  ↓
Manager evaluates deliverable
  ↓
Task marked as reviewed
  ↓
[MEETINGS HAPPEN HERE] ❌
  ↓
Daily Standup: IC shares progress, blockers
  ↓
Manager creates action items from standup
  ↓
ICs get unblocked or receive new tasks
  ↓
[CONTINUOUS AUTONOMOUS BEHAVIOR] ❌
  ↓
ICs proactively help peers
  ↓
ICs discover/create MCP servers
  ↓
ICs create improvement tasks
```

## What Should Be Implemented Next

### Priority 1: Meetings (Enables Collaboration)
1. **Meeting Orchestrator Workflow**
   - Schedule meetings (standup, sync, 1:1)
   - Wait until meeting time
   - Notify participants
   - Conduct AI-driven meeting
   - Generate transcript
   - Create action items
   - Save to database

2. **Complete `attendMeeting()` Function**
   - Join meeting when notified
   - Participate in discussion
   - Share status/blockers
   - Save meeting to memory

3. **Meeting Scheduling System**
   - Manager can schedule standups
   - Automatic daily standup scheduling
   - Weekly sync scheduling

### Priority 2: Proactive Peer Help (Enables Collaboration)
1. **Implement `checkAndHelpPeers()`**
   - Query database for blocked tasks
   - Identify peers who need help
   - Evaluate if IC can help (skills match)
   - Proactively offer help or take on work

2. **Ping System**
   - Complete `respondToPing()` function
   - Add `sendPing()` function
   - ICs can ping each other for help
   - ICs can ping manager for escalation

### Priority 3: MCP Discovery (Enables Tool Usage)
1. **Implement `discoverMCPs()`**
   - Search for relevant MCP servers
   - Evaluate usefulness
   - Self-assign useful MCPs
   - Create new MCP servers if needed

## Implementation Order Recommendation

1. **Meetings First** - Enables structured collaboration and communication
2. **Ping System** - Enables ad-hoc collaboration
3. **Proactive Peer Help** - Enables autonomous collaboration
4. **MCP Discovery** - Enables tool usage and efficiency

## Files That Need Updates

1. **`workflows/meetings/meeting-orchestrator.ts`** (NEW)
   - Meeting scheduling and orchestration

2. **`workflows/employees/ic-workflow.ts`**
   - Complete `attendMeeting()` function
   - Complete `respondToPing()` function
   - Implement `checkAndHelpPeers()` function
   - Implement `discoverMCPs()` function
   - Add `sendPing()` function

3. **`app/api/meetings/route.ts`** (NEW)
   - Create/schedule meetings
   - List meetings

4. **`app/api/employees/[employeeId]/ping/route.ts`** (NEW)
   - Send pings between employees

