/**
 * Comprehensive End-to-End Test for Manager Workflow
 * Tests: Full cycle from IC task completion to manager evaluation
 */

import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:3001";

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testManagerE2E() {
  console.log("🧪 End-to-End Manager Workflow Test\n");
  console.log("=" .repeat(60));

  try {
    // Step 1: Create a manager employee
    console.log("\n1️⃣ Creating manager employee...");
    const managerResponse = await fetch(`${API_BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Manager Sarah",
        role: "manager",
        skills: ["qa", "evaluation", "leadership"],
      }),
    });

    if (!managerResponse.ok) {
      const error = await managerResponse.text();
      throw new Error(`Failed to create manager: ${error}`);
    }

    const managerData = await managerResponse.json();
    const managerId = managerData.employee?.id || managerData.id;
    console.log(`✅ Manager created: ${managerId}`);

    // Step 2: Start manager workflow
    console.log("\n2️⃣ Starting manager workflow...");
    const startResponse = await fetch(
      `${API_BASE}/api/managers/${managerId}/start`,
      {
        method: "POST",
      }
    );

    if (!startResponse.ok) {
      const error = await startResponse.text();
      throw new Error(`Failed to start manager workflow: ${error}`);
    }

    const startData = await startResponse.json();
    console.log(`✅ Manager workflow started: ${startData.managerId}`);

    // Wait for workflow to initialize
    await wait(2000);

    // Step 3: Create an IC employee
    console.log("\n3️⃣ Creating IC employee...");
    const icResponse = await fetch(`${API_BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "IC Developer",
        role: "ic",
        skills: ["frontend", "react", "typescript"],
      }),
    });

    const icData = await icResponse.json();
    const icId = icData.employee?.id || icData.id;
    console.log(`✅ IC created: ${icId}`);

    // Step 4: Start IC workflow
    console.log("\n4️⃣ Starting IC workflow...");
    const icStartResponse = await fetch(
      `${API_BASE}/api/employees/${icId}/start`,
      {
        method: "POST",
      }
    );

    if (!icStartResponse.ok) {
      const error = await icStartResponse.text();
      throw new Error(`Failed to start IC workflow: ${error}`);
    }

    console.log(`✅ IC workflow started`);
    await wait(2000);

    // Step 5: Create a task and assign to IC
    console.log("\n5️⃣ Creating and assigning task to IC...");
    const taskResponse = await fetch(`${API_BASE}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Build Login Form Component",
        description: "Create a reusable login form component with email and password fields, validation, and TypeScript types",
        assignedTo: icId,
        priority: "high",
      }),
    });

    const taskData = await taskResponse.json();
    const taskId = taskData.id || taskData.task?.id;
    console.log(`✅ Task created: ${taskId}`);

    // Assign task to IC
    const assignResponse = await fetch(
      `${API_BASE}/api/employees/${icId}/event`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assignTask",
          taskId: taskId,
        }),
      }
    );

    console.log(`✅ Task assigned to IC`);

    // Step 6: Wait for IC to process task and create deliverable
    console.log("\n6️⃣ Waiting for IC to complete task...");
    console.log("   (This may take 30-60 seconds for AI processing)");
    
    let taskCompleted = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max

    while (!taskCompleted && attempts < maxAttempts) {
      await wait(2000);
      attempts++;

      const checkResponse = await fetch(`${API_BASE}/api/tasks`);
      const tasksData = await checkResponse.json();
      const task = tasksData.tasks?.find((t: any) => t.id === taskId);

      if (task?.status === "completed") {
        taskCompleted = true;
        console.log(`✅ Task completed after ${attempts * 2} seconds`);
        break;
      }

      if (attempts % 5 === 0) {
        console.log(`   Still processing... (${attempts * 2}s elapsed)`);
      }
    }

    if (!taskCompleted) {
      console.log("⚠️ Task not completed within timeout, checking current status...");
    }

    // Step 7: Check for deliverables
    console.log("\n7️⃣ Checking for deliverables...");
    const deliverablesCheck = await fetch(`${API_BASE}/api/tasks`);
    const allTasks = await deliverablesCheck.json();
    const completedTask = allTasks.tasks?.find((t: any) => t.id === taskId);

    if (completedTask?.status === "completed") {
      console.log(`✅ Task is completed`);
      console.log(`   Status: ${completedTask.status}`);
    } else {
      console.log(`⚠️ Task status: ${completedTask?.status || "unknown"}`);
    }

    // Step 8: Wait for manager evaluation (if deliverable was created)
    console.log("\n8️⃣ Waiting for manager evaluation...");
    await wait(10000); // Give manager time to evaluate

    // Step 9: Check evaluation results
    console.log("\n9️⃣ Checking evaluation results...");
    const finalCheck = await fetch(`${API_BASE}/api/tasks`);
    const finalTasks = await finalCheck.json();
    const evaluatedTask = finalTasks.tasks?.find((t: any) => t.id === taskId);

    if (evaluatedTask) {
      console.log("\n📊 Final Task Status:");
      console.log(`   ID: ${evaluatedTask.id}`);
      console.log(`   Title: ${evaluatedTask.title}`);
      console.log(`   Status: ${evaluatedTask.status}`);
      console.log(`   Assigned To: ${evaluatedTask.assignedTo}`);
      console.log(`   Completed At: ${evaluatedTask.completedAt || "N/A"}`);
    }

    // Step 10: Manually trigger evaluation if needed
    console.log("\n🔟 Manually triggering evaluation...");
    const evalResponse = await fetch(
      `${API_BASE}/api/managers/${managerId}/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "evaluateTask",
          taskId: taskId,
        }),
      }
    );

    if (evalResponse.ok) {
      const evalData = await evalResponse.json();
      console.log(`✅ Evaluation request sent`);
      console.log(`   Run ID: ${evalData.runId}`);
    } else {
      const error = await evalResponse.text();
      console.log(`⚠️ Evaluation request: ${error}`);
    }

    // Wait for evaluation to complete
    console.log("\n⏳ Waiting for evaluation to complete...");
    await wait(15000);

    // Final check
    console.log("\n📋 Final Status Check:");
    const finalStatus = await fetch(`${API_BASE}/api/tasks`);
    const finalStatusData = await finalStatus.json();
    const finalTask = finalStatusData.tasks?.find((t: any) => t.id === taskId);

    if (finalTask) {
      console.log(`   Task Status: ${finalTask.status}`);
      if (finalTask.status === "reviewed") {
        console.log(`   ✅ Task has been reviewed by manager!`);
      } else if (finalTask.status === "completed") {
        console.log(`   ⚠️ Task completed but not yet reviewed`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ End-to-End Manager Workflow Test Completed!");
    console.log("=".repeat(60) + "\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run test
testManagerE2E().catch(console.error);

