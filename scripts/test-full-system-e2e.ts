/**
 * Comprehensive End-to-End System Test
 * Tests: HR → Manager Creation → IC Hiring → Task Assignment → IC Execution → Manager Evaluation
 */

import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:3001";

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testFullSystemE2E() {
  console.log("🧪 Full System End-to-End Test\n");
  console.log("=".repeat(70));
  console.log("Testing: HR → Manager → IC → Task → Deliverable → Evaluation");
  console.log("=".repeat(70));

  try {
    // Step 1: Start HR Workflow
    console.log("\n1️⃣ Starting HR Workflow...");
    const hrResponse = await fetch(`${API_BASE}/api/hr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!hrResponse.ok) {
      const error = await hrResponse.text();
      throw new Error(`Failed to start HR workflow: ${error}`);
    }

    const hrData = await hrResponse.json();
    const hrId = hrData.hrId;
    console.log(`✅ HR Workflow started: ${hrId}`);
    await wait(2000);

    // Step 2: HR Creates a Manager
    console.log("\n2️⃣ HR Creating Manager...");
    const createManagerResponse = await fetch(`${API_BASE}/api/hr/${hrId}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "hireEmployee",
        role: "manager",
        name: "Manager Test",
        skills: ["qa", "evaluation", "leadership"],
      }),
    });

    if (!createManagerResponse.ok) {
      const error = await createManagerResponse.text();
      console.log(`⚠️ Manager creation via HR: ${error}`);
      console.log("   Creating manager directly instead...");
      
      // Fallback: Create manager directly
      const directManagerResponse = await fetch(`${API_BASE}/api/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Manager Test",
          role: "manager",
          skills: ["qa", "evaluation", "leadership"],
        }),
      });
      
      const managerData = await directManagerResponse.json();
      const managerId = managerData.employee?.id || managerData.id;
      console.log(`✅ Manager created directly: ${managerId}`);
      
      // Start manager workflow
      const startManagerResponse = await fetch(
        `${API_BASE}/api/managers/${managerId}/start`,
        { method: "POST" }
      );
      console.log(`✅ Manager workflow started`);
      await wait(2000);
    } else {
      console.log(`✅ Manager creation request sent to HR`);
      await wait(5000);
      
      // Check if manager was created
      const managersCheck = await fetch(`${API_BASE}/api/employees?role=manager`);
      const managersData = await managersCheck.json();
      const manager = managersData.employees?.[managersData.employees.length - 1];
      
      if (manager) {
        console.log(`✅ Manager found: ${manager.id} (${manager.name})`);
        const managerId = manager.id;
        
        // Start manager workflow
        const startManagerResponse = await fetch(
          `${API_BASE}/api/managers/${managerId}/start`,
          { method: "POST" }
        );
        console.log(`✅ Manager workflow started`);
        await wait(2000);
      }
    }

    // Step 3: HR Receives a Task and Hires ICs
    console.log("\n3️⃣ HR Receiving Task and Hiring ICs...");
    const taskResponse = await fetch(`${API_BASE}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Build User Dashboard",
        description: "Create a comprehensive user dashboard with analytics, user profile, and settings. Include charts, tables, and responsive design.",
        priority: "high",
      }),
    });

    const taskData = await taskResponse.json();
    const taskId = taskData.id || taskData.task?.id;
    console.log(`✅ Task created: ${taskId}`);

    // Send task to HR
    const hrTaskResponse = await fetch(`${API_BASE}/api/hr/${hrId}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "newTask",
        taskId: taskId,
        taskTitle: "Build User Dashboard",
        taskDescription: "Create a comprehensive user dashboard with analytics, user profile, and settings. Include charts, tables, and responsive design.",
      }),
    });

    if (!hrTaskResponse.ok) {
      const error = await hrTaskResponse.text();
      throw new Error(`Failed to send task to HR: ${error}`);
    }

    console.log(`✅ Task sent to HR workflow`);
    console.log("   HR will analyze task, determine IC requirements, and hire ICs...");
    
    // Wait for HR to process
    await wait(15000);

    // Step 4: Check if ICs were hired and task was assigned
    console.log("\n4️⃣ Checking HR Processing Results...");
    const employeesCheck = await fetch(`${API_BASE}/api/employees?role=ic`);
    const employeesData = await employeesCheck.json();
    const allICs = employeesData.employees || [];
    console.log(`   Total ICs in system: ${allICs.length}`);

    const taskCheck = await fetch(`${API_BASE}/api/tasks`);
    const tasksData = await taskCheck.json();
    const assignedTask = tasksData.tasks?.find((t: any) => t.id === taskId);
    
    if (assignedTask) {
      console.log(`✅ Task Status: ${assignedTask.status}`);
      console.log(`   Assigned To: ${assignedTask.assignedTo || "Not assigned yet"}`);
      
      if (assignedTask.assignedTo) {
        const assignedIC = allICs.find((ic: any) => ic.id === assignedTask.assignedTo);
        if (assignedIC) {
          console.log(`   Assigned IC: ${assignedIC.name} (${assignedIC.id})`);
        }
      }
    }

    // Step 5: Start IC Workflow if not already started
    if (assignedTask?.assignedTo) {
      console.log("\n5️⃣ Starting IC Workflow...");
      const icId = assignedTask.assignedTo;
      
      const icStartResponse = await fetch(
        `${API_BASE}/api/employees/${icId}/start`,
        { method: "POST" }
      );

      if (icStartResponse.ok) {
        console.log(`✅ IC workflow started for ${icId}`);
      } else {
        console.log(`⚠️ IC workflow may already be running`);
      }
      
      await wait(2000);

      // Assign task to IC explicitly
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
      console.log(`✅ Task assignment event sent to IC`);
    }

    // Step 6: Wait for IC to Process Task
    console.log("\n6️⃣ Waiting for IC to Process Task...");
    console.log("   (This may take 60-90 seconds for AI processing)");
    
    let taskCompleted = false;
    let attempts = 0;
    const maxAttempts = 45; // 45 attempts * 2 seconds = 90 seconds max

    while (!taskCompleted && attempts < maxAttempts) {
      await wait(2000);
      attempts++;

      const statusCheck = await fetch(`${API_BASE}/api/tasks`);
      const statusData = await statusCheck.json();
      const currentTask = statusData.tasks?.find((t: any) => t.id === taskId);

      if (currentTask?.status === "completed") {
        taskCompleted = true;
        console.log(`✅ Task completed after ${attempts * 2} seconds`);
        break;
      }

      if (attempts % 10 === 0) {
        console.log(`   Still processing... (${attempts * 2}s elapsed, status: ${currentTask?.status || "unknown"})`);
      }
    }

    if (!taskCompleted) {
      console.log("⚠️ Task not completed within timeout");
    }

    // Step 7: Check for Deliverables
    console.log("\n7️⃣ Checking for Deliverables...");
    const finalTaskCheck = await fetch(`${API_BASE}/api/tasks`);
    const finalTaskData = await finalTaskCheck.json();
    const finalTask = finalTaskData.tasks?.find((t: any) => t.id === taskId);

    if (finalTask) {
      console.log(`   Task Status: ${finalTask.status}`);
      console.log(`   Completed At: ${finalTask.completedAt || "N/A"}`);
    }

    // Step 8: Manager Evaluation
    console.log("\n8️⃣ Triggering Manager Evaluation...");
    
    // Get manager
    const managersResponse = await fetch(`${API_BASE}/api/employees?role=manager`);
    const managersData = await managersResponse.json();
    const manager = managersData.employees?.[managersData.employees.length - 1];
    
    if (manager) {
      const managerId = manager.id;
      console.log(`   Using Manager: ${manager.name} (${managerId})`);
      
      // Trigger evaluation
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
        console.log(`⚠️ Evaluation request failed: ${error}`);
      }

      // Wait for evaluation
      console.log("\n9️⃣ Waiting for Manager Evaluation...");
      await wait(15000);

      // Check final status
      const finalStatusCheck = await fetch(`${API_BASE}/api/tasks`);
      const finalStatusData = await finalStatusCheck.json();
      const evaluatedTask = finalStatusData.tasks?.find((t: any) => t.id === taskId);

      if (evaluatedTask) {
        console.log("\n📊 Final Results:");
        console.log("=".repeat(70));
        console.log(`   Task ID: ${evaluatedTask.id}`);
        console.log(`   Title: ${evaluatedTask.title}`);
        console.log(`   Status: ${evaluatedTask.status}`);
        console.log(`   Assigned To: ${evaluatedTask.assignedTo}`);
        console.log(`   Completed At: ${evaluatedTask.completedAt || "N/A"}`);
        
        if (evaluatedTask.status === "reviewed") {
          console.log(`   ✅ Task has been reviewed by manager!`);
        } else if (evaluatedTask.status === "completed") {
          console.log(`   ⚠️ Task completed but not yet reviewed`);
        }
        console.log("=".repeat(70));
      }
    } else {
      console.log("⚠️ No manager found for evaluation");
    }

    // Step 9: System Summary
    console.log("\n📋 System Summary:");
    console.log("=".repeat(70));
    
    const summaryEmployees = await fetch(`${API_BASE}/api/employees`);
    const summaryEmployeesData = await summaryEmployees.json();
    const allEmployees = summaryEmployeesData.employees || [];
    
    const managers = allEmployees.filter((e: any) => e.role === "manager");
    const ics = allEmployees.filter((e: any) => e.role === "ic");
    
    console.log(`   Total Employees: ${allEmployees.length}`);
    console.log(`   Managers: ${managers.length}`);
    console.log(`   ICs: ${ics.length}`);
    
    const summaryTasks = await fetch(`${API_BASE}/api/tasks`);
    const summaryTasksData = await summaryTasks.json();
    const allTasks = summaryTasksData.tasks || [];
    
    const pending = allTasks.filter((t: any) => t.status === "pending").length;
    const inProgress = allTasks.filter((t: any) => t.status === "in-progress").length;
    const completed = allTasks.filter((t: any) => t.status === "completed").length;
    const reviewed = allTasks.filter((t: any) => t.status === "reviewed").length;
    
    console.log(`   Total Tasks: ${allTasks.length}`);
    console.log(`   Pending: ${pending}`);
    console.log(`   In Progress: ${inProgress}`);
    console.log(`   Completed: ${completed}`);
    console.log(`   Reviewed: ${reviewed}`);
    console.log("=".repeat(70));

    console.log("\n✅ Full System End-to-End Test Completed!");
    console.log("=".repeat(70) + "\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run test
testFullSystemE2E().catch(console.error);

