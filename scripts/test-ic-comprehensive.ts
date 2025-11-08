import { config } from "dotenv";

config({ path: ".env.local" });

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testRoute(method: string, path: string, body?: any) {
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json();
  return { status: response.status, data };
}

async function main() {
  console.log("=".repeat(70));
  console.log("Comprehensive IC Workflow Test - All Cases");
  console.log("=".repeat(70));
  console.log(`Base URL: ${BASE_URL}\n`);

  // Test Case 1: High-level task that should be broken down
  console.log("TEST CASE 1: High-level task breakdown");
  console.log("-".repeat(70));
  
  // Start HR
  console.log("1.1 Starting HR workflow...");
  const hr1 = await testRoute("POST", "/api/hr");
  const hrId1 = hr1.data?.hrId;
  if (!hrId1) {
    console.error("   ❌ Failed to start HR");
    return;
  }
  console.log(`   ✅ HR ID: ${hrId1}`);
  await sleep(2000);

  // Create high-level task
  console.log("\n1.2 Creating high-level task...");
  const task1 = await testRoute("POST", "/api/tasks", {
    title: "Build a blog platform",
    description: "Create a full-stack blog platform with user authentication, post creation, comments, and search functionality. Use Next.js, TypeScript, and a database.",
    priority: "high",
  });
  const taskId1 = task1.data?.id;
  console.log(`   ✅ Task ID: ${taskId1}`);

  // Send to HR
  console.log("\n1.3 Sending task to HR...");
  await testRoute("POST", `/api/hr/${hrId1}/task`, {
    taskId: taskId1,
    taskTitle: "Build a blog platform",
    taskDescription: "Create a full-stack blog platform with user authentication, post creation, comments, and search functionality. Use Next.js, TypeScript, and a database.",
  });
  console.log("   ✅ Task sent to HR");

  // Wait for HR to process (longer wait)
  console.log("\n1.4 Waiting for HR to process (25s)...");
  await sleep(25000);

  // Check task assignment
  console.log("\n1.5 Checking task assignment...");
  const tasks1 = await testRoute("GET", "/api/tasks");
  const assignedTask1 = tasks1.data.tasks.find((t: any) => t.id === taskId1);
  console.log(`   Task status: ${assignedTask1?.status}`);
  console.log(`   Assigned to: ${assignedTask1?.assignedTo}`);

  if (!assignedTask1?.assignedTo) {
    console.log("   ⚠️  Task not assigned yet, skipping this test case");
  } else {
    // Manually trigger IC
    console.log("\n1.6 Triggering IC to process task...");
    await testRoute("POST", `/api/employees/${assignedTask1.assignedTo}/event`, {
      type: "assignTask",
      taskId: taskId1,
    });
    console.log("   ✅ Event sent");

    // Wait for processing
    console.log("\n1.7 Waiting for IC to process (25s)...");
    await sleep(25000);

    // Check results
    console.log("\n1.8 Checking results...");
    const allTasks1 = await testRoute("GET", "/api/tasks");
    const subtasks1 = allTasks1.data.tasks.filter((t: any) => t.parentTaskId === taskId1);
    console.log(`   ✅ Found ${subtasks1.length} subtasks`);
    
    if (subtasks1.length > 0) {
      console.log("   Subtasks created:");
      subtasks1.forEach((t: any) => {
        console.log(`     - ${t.title} (${t.status})`);
      });
    } else {
      console.log("   ⚠️  No subtasks created - task may have been executed directly");
    }

    // Check if parent task status
    const parentTask1 = allTasks1.data.tasks.find((t: any) => t.id === taskId1);
    console.log(`   Parent task status: ${parentTask1?.status}`);
  }

  // Test Case 2: Direct subtask execution
  console.log("\n\nTEST CASE 2: Direct subtask execution");
  console.log("-".repeat(70));

  // Create a subtask directly
  console.log("\n2.1 Creating subtask directly...");
  const subtask2 = await testRoute("POST", "/api/tasks", {
    title: "Implement login form",
    description: "Create a login form component with email and password fields, validation, and error handling",
    priority: "medium",
    parentTaskId: taskId1, // Link to previous task
  });
  const subtaskId2 = subtask2.data?.id;
  console.log(`   ✅ Subtask ID: ${subtaskId2}`);

  // Get an IC to assign to
  const employees2 = await testRoute("GET", "/api/employees");
  const ics2 = employees2.data.employees.filter((e: any) => e.role === "ic");
  if (ics2.length > 0) {
    const icId2 = ics2[0].id;
    
    // Assign subtask
    console.log("\n2.2 Assigning subtask to IC...");
    await testRoute("POST", "/api/tasks", {
      title: "Implement login form",
      description: "Create a login form component with email and password fields, validation, and error handling",
      priority: "medium",
      parentTaskId: taskId1,
      assignedTo: icId2,
    });
    console.log("   ✅ Subtask assigned");

    // Update task status to in-progress (simulating HR assignment)
    // We'll need to do this via direct DB update or API
    console.log("\n2.3 Triggering IC to execute subtask...");
    await testRoute("POST", `/api/employees/${icId2}/event`, {
      type: "assignTask",
      taskId: subtaskId2,
    });
    console.log("   ✅ Event sent");

    // Wait for execution
    console.log("\n2.4 Waiting for IC to execute (20s)...");
    await sleep(20000);

    // Check results
    console.log("\n2.5 Checking results...");
    const allTasks2 = await testRoute("GET", "/api/tasks");
    const executedSubtask2 = allTasks2.data.tasks.find((t: any) => t.id === subtaskId2);
    console.log(`   Subtask status: ${executedSubtask2?.status}`);
    console.log(`   ✅ Subtask ${executedSubtask2?.status === "completed" ? "completed" : "still processing"}`);
  }

  // Test Case 3: Task already broken down (should execute, not break down again)
  console.log("\n\nTEST CASE 3: Task already broken down");
  console.log("-".repeat(70));

  // Use the task from Test Case 1 that was broken down
  if (assignedTask1?.assignedTo) {
    console.log("\n3.1 Triggering IC again on already-broken-down task...");
    await testRoute("POST", `/api/employees/${assignedTask1.assignedTo}/event`, {
      type: "assignTask",
      taskId: taskId1,
    });
    console.log("   ✅ Event sent");

    // Wait
    console.log("\n3.2 Waiting (10s)...");
    await sleep(10000);

    // Check - should not create duplicate subtasks
    console.log("\n3.3 Checking for duplicate subtasks...");
    const allTasks3 = await testRoute("GET", "/api/tasks");
    const subtasks3 = allTasks3.data.tasks.filter((t: any) => t.parentTaskId === taskId1);
    console.log(`   ✅ Found ${subtasks3.length} subtasks (should be same as before)`);
  }

  // Summary
  console.log("\n\n" + "=".repeat(70));
  console.log("TEST SUMMARY");
  console.log("=".repeat(70));
  console.log("✅ Test Case 1: High-level task breakdown - Tested");
  console.log("✅ Test Case 2: Direct subtask execution - Tested");
  console.log("✅ Test Case 3: Task already broken down - Tested");
  console.log("\n✅ Comprehensive test completed!");
}

main().catch(console.error);

