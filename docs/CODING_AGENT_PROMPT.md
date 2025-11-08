# Coding Agent Prompt - AI Agent Factory MVP

## Project Overview

You are building an **AI Agent Factory MVP** - a system where AI agents function as employees that collaborate to execute high-level tasks end-to-end. The core flow is:

**CEO enters task → HR plans → HR hires ICs → ICs break down task → ICs collaborate → ICs execute → Managers evaluate → Complete output**

## Your Mission

Set up the foundation for this system. Start with **Day 1 tasks**: Database schema, infrastructure setup, and basic project structure.

## Technical Stack

- **Runtime**: Vercel Workflows (4.0.1-beta.6)
- **AI SDK**: Vercel AI SDK (^5.0.89) with GPT-4o
- **Database**: Postgres Neon (Drizzle ORM)
- **Cache**: Redis (Upstash/Redis Cloud)
- **Frontend**: Next.js 16 with React 19
- **Scheduling**: Vercel Cron
- **Real-time**: Vercel SSE

## Environment Variables

You have been provided with:
- `DATABASE_URL`: Postgres Neon connection string
- `REDIS_URL`: Redis connection string

Add these to `.env.local` and ensure they're in `.env.example` (without actual credentials).

## Current Project State

- Existing counter-actor example in `workflows/counter-actor.ts`
- Basic Next.js setup
- Vercel Workflows configured
- AI SDK integrated

## Your Tasks (Priority Order)

### 1. Install Dependencies

Add these packages:
```bash
npm install drizzle-orm drizzle-kit @neondatabase/serverless
npm install @upstash/redis  # or redis if using Redis Cloud
npm install zod  # for schema validation
npm install date-fns  # for date handling
```

### 2. Set Up Drizzle ORM

Create `lib/db/schema.ts` with the following tables:

**employees**
- id (string, primary key) - workflowRunId
- name (string)
- role ('ic' | 'manager')
- skills (string array)
- status ('active' | 'terminated')
- createdAt (timestamp)
- updatedAt (timestamp)

**tasks**
- id (string, primary key)
- parentTaskId (string, nullable) - for subtasks
- title (string)
- description (text)
- assignedTo (string, foreign key to employees)
- status ('pending' | 'in-progress' | 'completed' | 'reviewed')
- priority ('low' | 'medium' | 'high' | 'critical')
- createdAt (timestamp)
- completedAt (timestamp, nullable)

**deliverables**
- id (string, primary key)
- taskId (string, foreign key to tasks)
- type ('code' | 'document' | 'config' | 'text')
- content (text)
- createdBy (string, foreign key to employees)
- createdAt (timestamp)
- evaluatedBy (string, nullable, foreign key to employees)
- evaluationScore (number, nullable, 1-10)

**mcpServers**
- id (string, primary key)
- name (string)
- description (text)
- code (text) - MCP server code/configuration
- createdBy (string, foreign key to employees)
- createdAt (timestamp)
- usageCount (number, default 0)

**memories**
- id (string, primary key)
- employeeId (string, foreign key to employees)
- type ('meeting' | 'task' | 'learning' | 'interaction')
- content (text)
- importance (number, 0-1)
- createdAt (timestamp)

**meetings**
- id (string, primary key)
- type ('standup' | 'sync' | 'ping')
- participants (string array) - employee IDs
- transcript (text)
- createdAt (timestamp)

**costs**
- id (string, primary key)
- employeeId (string, nullable, foreign key to employees)
- taskId (string, nullable, foreign key to tasks)
- type ('api' | 'mcp' | 'storage')
- amount (number) - in USD
- currency (string, default 'USD')
- timestamp (timestamp)

### 3. Database Configuration

Create `lib/db/index.ts`:
- Initialize Drizzle with Neon Postgres
- Export db instance
- Export all schema tables

Create `lib/db/migrate.ts`:
- Drizzle migration setup
- Run migrations script

Create `drizzle.config.ts`:
- Drizzle configuration pointing to DATABASE_URL

### 4. Redis Setup

Create `lib/redis/index.ts`:
- Initialize Redis client (Upstash or standard Redis)
- Export helper functions for caching employee state, task state, etc.
- Use Redis for fast lookups, Postgres for persistence

### 5. Environment Setup

- Create `.env.local` with provided credentials
- Create `.env.example` with placeholder values
- Ensure `.env.local` is in `.gitignore`

### 6. Project Structure

Create the following directory structure:
```
lib/
├── db/
│   ├── index.ts
│   ├── schema.ts
│   └── migrate.ts
├── redis/
│   └── index.ts
└── types/
    └── index.ts  # Shared TypeScript types

workflows/
├── hr/
│   └── hr-workflow.ts  # (placeholder for now)
├── employees/
│   ├── ic-workflow.ts  # (placeholder for now)
│   └── manager-workflow.ts  # (placeholder for now)
└── meetings/
    └── meeting-orchestrator.ts  # (placeholder for now)

app/api/
├── tasks/
│   └── route.ts  # POST: Create high-level task
├── employees/
│   └── route.ts  # GET: List employees
└── costs/
    └── route.ts  # GET: Cost tracking
```

### 7. Type Definitions

Create `lib/types/index.ts` with TypeScript interfaces matching the database schema:
- Employee
- Task
- Deliverable
- MCPServer
- Memory
- Meeting
- Cost

### 8. Basic API Routes

Create placeholder API routes:
- `POST /api/tasks` - Create high-level task (returns task ID)
- `GET /api/employees` - List all employees
- `GET /api/costs` - Get cost breakdown

These can be minimal implementations that just interact with the database.

### 9. Migration Script

Create a script to run migrations:
- `scripts/migrate.ts` or add to `package.json` scripts
- Should run Drizzle migrations

### 10. Testing Database Connection

Create a simple test:
- `scripts/test-db.ts` - Test Postgres connection
- `scripts/test-redis.ts` - Test Redis connection
- Verify both connections work

## Key Requirements

1. **Type Safety**: Use TypeScript strictly, leverage Drizzle's inferred types
2. **Error Handling**: All database operations should have try-catch
3. **Logging**: Use console.log for now (structured logging later)
4. **Code Style**: Follow existing code patterns in the repo
5. **Documentation**: Add JSDoc comments to key functions

## Reference Documentation

- `docs/MVP_ARCHITECTURE.md` - Detailed architecture and flow
- `docs/INITIAL_COMMIT.md` - Overall project plan
- `workflows/counter-actor.ts` - Example workflow pattern
- `docs/AI_SDK_WORKFLOWS_GUIDE.md` - AI SDK integration patterns
- `docs/WORKFLOW_ANALYSIS.md` - Workflow best practices

## Important Notes

1. **Follow Vercel Workflows patterns**: Use `"use workflow"` and `"use step"` directives
2. **Use defineHook()**: For type-safe inter-actor communication
3. **State Management**: Redis for cache, Postgres for persistence
4. **AI SDK**: Always set `globalThis.fetch = fetch` in workflows
5. **Drizzle**: Use relational queries, not raw SQL

## Success Criteria

When done, you should have:
- ✅ Database schema defined and migrated
- ✅ Redis connection working
- ✅ Postgres connection working
- ✅ Basic project structure in place
- ✅ Type definitions matching schema
- ✅ Basic API routes that can read/write to database
- ✅ All dependencies installed
- ✅ Environment variables configured

## Next Steps After This

Once foundation is set, the next developer will:
- Build HR workflow
- Build IC employee workflow
- Build Manager workflow
- Implement task breakdown logic
- Build CEO dashboard

## Questions to Consider

- Should we use Drizzle's relational queries or keep it simple with basic queries?
- How should we handle database connection pooling?
- Should Redis operations be wrapped in helper functions?
- What's the best way to structure the workflow files?

## Start Here

1. Read the existing codebase to understand patterns
2. Install dependencies
3. Set up Drizzle schema
4. Test database connections
5. Create basic API routes
6. Verify everything works

Good luck! Build a solid foundation for this exciting project.

