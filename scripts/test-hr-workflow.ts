/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE_URL = process.env.VERCEL_PUBLIC_URL || "http://localhost:3001";

async function testRoute(
  method: string,
  path: string,
  body?: any,
  expectedStatus: number = 200
) {
  try {
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, options);
    const contentType = response.headers.get("content-type");

    let data;
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error(`   ⚠️  Got non-JSON response (${contentType}):`, text.substring(0, 200));
      return { success: false, error: `Non-JSON response: ${contentType}`, status: response.status };
    }

    if (response.status === expectedStatus) {
      console.log(`✅ ${method} ${path} - Status: ${response.status}`);
      return { success: true, data, status: response.status };
    } else {
      console.error(
        `❌ ${method} ${path} - Expected ${expectedStatus}, got ${response.status}`
      );
      console.error("Response:", data);
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    console.error(`❌ ${method} ${path} - Error:`, error);
    return { success: false, error };
  }
}

async function testHRWorkflow() {
  console.log("Testing HR Workflow...\n");
  console.log(`Base URL: ${BASE_URL}\n`);

  let allPassed = true;

  // Test 1: Start HR workflow
  console.log("1. Testing POST /api/hr - Start HR workflow");
  const startHRResult = await testRoute("POST", "/api/hr", {}, 200);
  if (!startHRResult.success) allPassed = false;
  const hrId = startHRResult.data?.hrId;
  console.log(`   HR Workflow ID: ${hrId}\n`);

  if (!hrId) {
    console.error("❌ Cannot continue without HR ID");
    return;
  }

  // Wait a bit for workflow to initialize
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test 2: Create a high-level task
  console.log("2. Testing POST /api/tasks - Create high-level task");
  const createTaskResult = await testRoute(
    "POST",
    "/api/tasks",
    {
      title: "Build a Next.js app with user authentication",
      description: "Create a full-stack Next.js application with user authentication, database integration, and a modern UI",
      priority: "high",
    },
    201
  );
  if (!createTaskResult.success) allPassed = false;
  const taskId = createTaskResult.data?.id;
  console.log(`   Created task ID: ${taskId}\n`);

  if (!taskId) {
    console.error("❌ Cannot continue without task ID");
    return;
  }

  // Test 3: Send task to HR workflow
  console.log("3. Testing POST /api/hr/[hrId]/task - Send task to HR");
  const sendTaskResult = await testRoute(
    "POST",
    `/api/hr/${hrId}/task`,
    {
      taskId: taskId,
      taskTitle: "Build a Next.js app with user authentication",
      taskDescription: "Create a full-stack Next.js application with user authentication, database integration, and a modern UI",
    },
    200
  );
  if (!sendTaskResult.success) allPassed = false;
  console.log(`   Task sent to HR workflow\n`);

  // Wait for HR to process (AI analysis and hiring takes time)
  console.log("4. Waiting for HR to process task (analyze, hire ICs)...");
  await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds for AI processing

  // Test 4: Check if employees were created
  console.log("5. Testing GET /api/employees - Check if ICs were hired");
  const employeesResult = await testRoute("GET", "/api/employees", undefined, 200);
  if (!employeesResult.success) allPassed = false;
  const employeeCount = employeesResult.data?.count || 0;
  console.log(`   Found ${employeeCount} employees`);
  if (employeeCount > 0) {
    console.log(`   Employees:`, employeesResult.data?.employees?.map((e: any) => `${e.name} (${e.role})`).join(", "));
  }
  console.log();

  // Test 5: Check if task was assigned
  console.log("6. Testing GET /api/tasks/[taskId] - Check task assignment");
  const taskResult = await testRoute("GET", `/api/tasks?assignedTo=${employeesResult.data?.employees?.[0]?.id || ""}`, undefined, 200);
  if (!taskResult.success) allPassed = false;
  console.log(`   Tasks assigned: ${taskResult.data?.count || 0}\n`);

  // Test 6: Check task status
  console.log("7. Testing GET /api/tasks - Check task status");
  const allTasksResult = await testRoute("GET", "/api/tasks", undefined, 200);
  if (!allTasksResult.success) allPassed = false;
  const ourTask = allTasksResult.data?.tasks?.find((t: any) => t.id === taskId);
  if (ourTask) {
    console.log(`   Task status: ${ourTask.status}`);
    console.log(`   Task assigned to: ${ourTask.assignedTo || "none"}`);
  }
  console.log();

  // Summary
  console.log("=".repeat(50));
  if (allPassed) {
    console.log("✅ All HR workflow tests passed!");
    process.exit(0);
  } else {
    console.log("❌ Some tests failed. Check output above.");
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/hr`);
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return true;
    } else {
      console.error(
        `\n❌ Server at ${BASE_URL} is not returning JSON responses.\n` +
          "Please make sure the Next.js dev server is running:\n" +
          "  pnpm dev\n"
      );
      return false;
    }
  } catch (error) {
    console.error(
      `\n❌ Cannot connect to server at ${BASE_URL}\n` +
        "Please make sure the Next.js dev server is running:\n" +
        "  pnpm dev\n\n" +
        "Error:",
      error
    );
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }

  await testHRWorkflow();
}

main();

