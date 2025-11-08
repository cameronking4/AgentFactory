# AI Agent Factory - Initial Commit Plan

## Vision Statement

Build a **fully autonomous AI enterprise** where AI agents function as employees in a realistic organizational structure. The company runs 24/7, with agents collaborating, producing real work, and managing themselves through a complete HR lifecycle. The CEO (you) can observe, guide, and intervene, but the organization operates independently.

**Core Philosophy**: This is not a simulation—it's a real company with real work, real deliverables, and real performance metrics. Agents are autonomous employees, not just chatbots.

---

## Priorities

### Phase 1: MVP (Weeks 1-4) - "End-to-End Task Execution"

**Goal**: Prove the concept - HR creates ICs that collaborate to break down and execute a high-level task end-to-end (e.g., "Build a Next.js app that does XYZ").

#### Must-Have Features:
1. **HR System**
   - HR workflow that plans employee creation based on high-level task
   - Creates IC employees with appropriate skills
   - Manages employee lifecycle

2. **IC Employee System**
   - IC workflows that can collaborate
   - Task breakdown and execution
   - Real deliverables (code, documents, etc.)
   - Memory system (learns and remembers)
   - MCP server discovery and creation
   - Can use tools via MCP servers

3. **Manager System** (Lightweight)
   - Manager workflows for QA and evaluation
   - Scores deliverables
   - Reviews work quality

4. **Task Execution Flow**
   - CEO enters high-level task
   - HR creates plan and hires ICs
   - ICs break down task into subtasks
   - ICs collaborate to execute end-to-end
   - Managers evaluate deliverables

5. **Communication**
   - Scheduled meetings (standups, syncs)
   - Async pings between employees
   - Meeting transcripts stored in memory

6. **CEO Dashboard**
   - Enter high-level task
   - View employee list and status
   - View task progress
   - View deliverables
   - Track costs (token usage, API calls)
   - Real-time updates

#### Success Criteria:
- ✅ CEO can enter "Build a Next.js app that does XYZ"
- ✅ HR creates plan and hires appropriate ICs
- ✅ ICs break down task and execute end-to-end
- ✅ ICs collaborate via meetings and async pings
- ✅ ICs discover/create MCP servers for tools
- ✅ ICs remember context and learnings
- ✅ Managers evaluate deliverables with scores
- ✅ CEO can view progress and costs
- ✅ Complete task produces real, working output

### Phase 2: Meetings & Collaboration (Weeks 5-6) - "The Team"

**Goal**: Add scheduled meetings and peer collaboration.

#### Must-Have Features:
1. **Meeting System**
   - Daily standups (Manager + ICs)
   - Meeting orchestrator workflow
   - Meeting transcript generation
   - Task creation from meeting outcomes

2. **Enhanced Collaboration**
   - Async pings between employees
   - Proactive peer help
   - Blocker resolution

#### Success Criteria:
- ✅ Daily standups happen automatically
- ✅ Meeting transcripts are generated
- ✅ Action items become tasks
- ✅ Employees can ping each other
- ✅ Blockers get resolved through collaboration

### Phase 3: Performance & Lifecycle (Weeks 7-8) - "The System"

**Goal**: Complete HR lifecycle with automatic performance management.

#### Must-Have Features:
1. **Performance System**
   - Automatic performance scoring
   - Employee evaluation (managers evaluate reports)
   - Performance history tracking

2. **HR Lifecycle**
   - Automatic PIP workflow
   - Automatic promotion workflow
   - Termination with task reassignment

3. **Observability**
   - Activity logging
   - Token tracking
   - Basic memory system

#### Success Criteria:
- ✅ Performance scores update automatically
- ✅ PIPs trigger automatically for low performers
- ✅ Promotions happen automatically for high performers
- ✅ Activity logs track all employee actions
- ✅ Token usage is tracked per employee

### Phase 4: Scale & Polish (Weeks 9-12) - "The Enterprise"

**Goal**: Scale to 25 employees and add advanced features.

#### Must-Have Features:
1. **Advanced Meetings**
   - Weekly syncs
   - 1:1 meetings
   - Department all-hands

2. **Memory & Intelligence**
   - Long-term memory system
   - Memory prioritization
   - Learning from past work

3. **MCP Servers** (if time permits)
   - MCP server assignment
   - Tool execution
   - Basic discovery

#### Success Criteria:
- ✅ Organization scales to 25 employees
- ✅ All meeting types work
- ✅ Employees remember important context
- ✅ System handles autonomous growth

---

## Technical Priorities

### Critical Path Items (Do First):

1. **Database Schema** (Day 1)
   - Drizzle schema for employees, tasks, deliverables, meetings, MCP servers, memory
   - Redis caching strategy
   - Migration setup
   - Cost tracking tables

2. **HR Workflow** (Days 2-3)
   - Receives high-level task from CEO
   - Plans employee creation (what ICs needed, what skills)
   - Creates IC employee workflows
   - Manages employee lifecycle

3. **IC Employee Workflow** (Days 4-6)
   - Base IC workflow with memory system
   - Task breakdown capability
   - Task execution with deliverables
   - MCP server discovery and creation
   - Tool usage via MCP servers
   - Collaboration hooks (meetings, pings)

4. **Manager Workflow** (Day 7)
   - Lightweight manager for QA
   - Deliverable evaluation
   - Scoring system

5. **Meeting System** (Days 8-9)
   - Meeting orchestrator
   - Scheduled meetings (standups)
   - Async pings
   - Transcript generation
   - Memory storage

6. **Task Execution Flow** (Days 10-12)
   - Task breakdown logic
   - Subtask assignment
   - Collaboration between ICs
   - End-to-end execution

7. **CEO Dashboard** (Days 13-14)
   - High-level task input
   - Employee list and status
   - Task progress view
   - Deliverables view
   - Cost tracking dashboard
   - Real-time updates (SSE)

### Nice-to-Have (Can Defer):

- Performance thresholds (PIP, promotions)
- Directors and CoS roles
- Advanced analytics
- Complex meeting types (1:1s, all-hands)
- Personas system
- Advanced memory prioritization
- Department structure

---

## Success Metrics

### MVP Success (Phase 1):
- [ ] CEO can enter high-level task (e.g., "Build a Next.js app")
- [ ] HR creates plan and hires appropriate ICs
- [ ] ICs break down task into executable subtasks
- [ ] ICs collaborate via meetings and async pings
- [ ] ICs discover/create MCP servers for tools
- [ ] ICs use tools to complete work
- [ ] ICs remember context and learnings (memory system)
- [ ] Managers evaluate deliverables with scores
- [ ] Complete task produces real, working output
- [ ] CEO can view progress, deliverables, and costs
- [ ] End-to-end execution works autonomously

### Full System Success (Phase 4):
- [ ] 25 employees operating autonomously
- [ ] Daily standups happening automatically
- [ ] PIPs and promotions happening automatically
- [ ] Employees helping peers proactively
- [ ] Full observability (logs, tokens, memory)
- [ ] Organization can grow autonomously

### Technical Success:
- [ ] < 2s API response times
- [ ] 99.9% workflow uptime
- [ ] < 5 clicks for common CEO actions
- [ ] Real-time updates (< 1s latency)
- [ ] Scales to 50+ employees

---

## Architecture Decisions

### State Management
- **Redis**: Fast caching, real-time lookups
- **Postgres Neon**: Persistent storage, complex queries
- **Drizzle ORM**: Type-safe database operations

### Communication
- **Hooks**: All inter-actor communication via `defineHook()`
- **SSE**: Real-time updates to CEO dashboard
- **Polling**: Fallback for state updates

### Scheduling
- **Vercel Cron**: Meeting scheduling
- **Workflow-based**: Task scheduling and reminders

### AI
- **Model**: GPT-4o for all employees (consistent quality)
- **Tools**: MCP servers (MVP - employees can discover/create)
- **Token Tracking**: Per employee, per task, per MCP server call
- **Cost Tracking**: Track all API costs from day 1

---

## Risk Mitigation

### Technical Risks:
1. **State Consistency**: Use transactions for critical updates
2. **Workflow Failures**: Implement retry logic and error recovery
3. **Performance**: Cache aggressively, optimize queries
4. **Scaling**: Design for horizontal scaling from day 1

### Product Risks:
1. **Complexity**: Start simple, add features incrementally
2. **Autonomy**: Test autonomous behavior early and often
3. **Performance Metrics**: Ensure metrics reflect real work quality
4. **User Experience**: Get CEO dashboard working early for feedback

---

## Development Principles

1. **Real Work First**: Focus on actual deliverables before polish
2. **Autonomy Over Control**: Prefer autonomous behavior over manual intervention
3. **Observability**: Log everything, track everything
4. **Type Safety**: Use TypeScript strictly, leverage Drizzle types
5. **Incremental**: Ship working features, iterate based on usage

---

## Next Steps

1. **Set up infrastructure** (Day 1)
   - Postgres Neon database
   - Redis instance
   - Drizzle schema setup (employees, tasks, deliverables, meetings, MCP servers, memory, costs)
   - Environment variables
   - Cost tracking setup

2. **Build HR workflow** (Days 2-3)
   - Receives high-level task
   - Plans employee creation (AI-powered planning)
   - Creates IC workflows
   - Test hiring process

3. **Build IC employee workflow** (Days 4-6)
   - Base workflow with memory system
   - Task breakdown capability
   - Task execution with deliverables
   - MCP server discovery (web search or registry)
   - MCP server creation capability
   - Tool usage via MCP servers
   - Test end-to-end task execution

4. **Build Manager workflow** (Day 7)
   - Deliverable evaluation
   - Scoring system
   - QA process
   - Test evaluation flow

5. **Build meeting system** (Days 8-9)
   - Meeting orchestrator
   - Scheduled standups
   - Async ping system
   - Transcript generation
   - Memory storage
   - Test collaboration

6. **Build CEO dashboard** (Days 10-12)
   - High-level task input
   - Employee list and status
   - Task progress view
   - Deliverables view
   - Cost tracking dashboard
   - Real-time updates (SSE)

7. **Test end-to-end** (Days 13-14)
   - CEO enters "Build a Next.js app that does XYZ"
   - HR creates plan and hires ICs
   - ICs break down and execute
   - ICs collaborate via meetings
   - ICs discover/create MCP servers
   - Managers evaluate deliverables
   - Verify complete, working output
   - Check cost tracking

---

## Questions to Answer During Development

1. **Task Breakdown**: How detailed should ICs break down high-level tasks? (AI decides? Template-based?)
2. **MCP Server Discovery**: How do ICs discover MCP servers? (Web search? Registry? Pre-configured list?)
3. **MCP Server Creation**: What's the process for creating a new MCP server? (Task? Autonomous? Approval?)
4. **Memory System**: How much context should be stored? (All meetings? Filtered? Importance-based?)
5. **Meeting Frequency**: How often should standups happen? (Real-time? Accelerated time?)
6. **Deliverable Evaluation**: What's the scoring rubric? (1-10? Pass/fail? Multiple criteria?)
7. **Cost Tracking**: What costs to track? (Tokens? API calls? MCP server usage? Storage?)
8. **Task Completion**: What defines "complete"? (All subtasks done? Manager approval? Working output?)

---

## Definition of Done

A feature is "done" when:
- ✅ It works end-to-end
- ✅ State persists correctly
- ✅ Errors are handled gracefully
- ✅ It's observable (logged/tracked)
- ✅ CEO can interact with it (if applicable)
- ✅ It operates autonomously (if applicable)

---

**Document Version**: 1.0  
**Created**: 2024-01-XX  
**Status**: Ready for Implementation

