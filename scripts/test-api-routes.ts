import { config } from "dotenv";

config({ path: ".env.local" });

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

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
      return { success: false, error: `Non-JSON response: ${contentType}` };
    }

    if (response.status === expectedStatus) {
      console.log(`✅ ${method} ${path} - Status: ${response.status}`);
      return { success: true, data };
    } else {
      console.error(
        `❌ ${method} ${path} - Expected ${expectedStatus}, got ${response.status}`
      );
      console.error("Response:", data);
      return { success: false, data };
    }
  } catch (error) {
    console.error(`❌ ${method} ${path} - Error:`, error);
    return { success: false, error };
  }
}

async function testAllRoutes() {
  console.log("Testing API Routes...\n");
  console.log(`Base URL: ${BASE_URL}\n`);

  let allPassed = true;

  // Test 1: POST /api/tasks - Create a task
  console.log("1. Testing POST /api/tasks");
  const createTaskResult = await testRoute(
    "POST",
    "/api/tasks",
    {
      title: "Test Task",
      description: "This is a test task",
      priority: "high",
    },
    201
  );
  if (!createTaskResult.success) allPassed = false;
  const taskId = createTaskResult.data?.id;
  console.log(`   Created task ID: ${taskId}\n`);

  // Test 2: GET /api/tasks - List all tasks
  console.log("2. Testing GET /api/tasks");
  const listTasksResult = await testRoute("GET", "/api/tasks", undefined, 200);
  if (!listTasksResult.success) allPassed = false;
  console.log(`   Found ${listTasksResult.data?.count || 0} tasks\n`);

  // Test 3: GET /api/tasks with filters
  console.log("3. Testing GET /api/tasks?status=pending");
  const filteredTasksResult = await testRoute(
    "GET",
    "/api/tasks?status=pending",
    undefined,
    200
  );
  if (!filteredTasksResult.success) allPassed = false;
  console.log(
    `   Found ${filteredTasksResult.data?.count || 0} pending tasks\n`
  );

  // Test 4: GET /api/employees - List employees
  console.log("4. Testing GET /api/employees");
  const listEmployeesResult = await testRoute(
    "GET",
    "/api/employees",
    undefined,
    200
  );
  if (!listEmployeesResult.success) allPassed = false;
  console.log(
    `   Found ${listEmployeesResult.data?.count || 0} employees\n`
  );

  // Test 5: GET /api/employees with filters
  console.log("5. Testing GET /api/employees?role=ic");
  const filteredEmployeesResult = await testRoute(
    "GET",
    "/api/employees?role=ic",
    undefined,
    200
  );
  if (!filteredEmployeesResult.success) allPassed = false;
  console.log(
    `   Found ${filteredEmployeesResult.data?.count || 0} IC employees\n`
  );

  // Test 6: GET /api/costs - List costs
  console.log("6. Testing GET /api/costs");
  const listCostsResult = await testRoute("GET", "/api/costs", undefined, 200);
  if (!listCostsResult.success) allPassed = false;
  console.log(`   Found ${listCostsResult.data?.count || 0} cost records`);
  console.log(
    `   Total: $${listCostsResult.data?.aggregates?.total || 0}\n`
  );

  // Test 7: POST /api/tasks - Validation error (missing required field)
  console.log("7. Testing POST /api/tasks - Validation error");
  const validationErrorResult = await testRoute(
    "POST",
    "/api/tasks",
    {
      description: "Missing title",
    },
    400
  );
  if (!validationErrorResult.success) allPassed = false;
  console.log("   Validation error handled correctly\n");

  // Test 8: GET /api/tasks - Invalid query parameter
  console.log("8. Testing GET /api/tasks?status=invalid");
  const invalidQueryResult = await testRoute(
    "GET",
    "/api/tasks?status=invalid",
    undefined,
    400
  );
  if (!invalidQueryResult.success) allPassed = false;
  console.log("   Invalid query parameter handled correctly\n");

  // Summary
  console.log("=".repeat(50));
  if (allPassed) {
    console.log("✅ All API route tests passed!");
    process.exit(0);
  } else {
    console.log("❌ Some tests failed. Check output above.");
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/tasks`);
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return true;
    } else {
      console.error(
        `\n❌ Server at ${BASE_URL} is not returning JSON responses.\n` +
          "The API routes may not be set up correctly, or the server may not be running.\n" +
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

  await testAllRoutes();
}

main();

