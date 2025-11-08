/**
 * Test Manager-IC Assignment
 * Tests: HR creates managers, assigns ICs to managers, ICs use assigned managers
 */

import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:3001";

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testManagerAssignment() {
  console.log("🧪 Testing Manager-IC Assignment\n");
  console.log("=".repeat(70));

  try {
    // Step 1: Start HR Workflow
    console.log("\n1️⃣ Starting HR Workflow...");
    const hrResponse = await fetch(`${API_BASE}/api/hr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const hrData = await hrResponse.json();
    const hrId = hrData.hrId;
    console.log(`✅ HR Workflow started: ${hrId}`);
    await wait(2000);

    // Step 2: Check initial state (should have no managers)
    console.log("\n2️⃣ Checking initial state...");
    const initialManagers = await fetch(`${API_BASE}/api/employees?role=manager`);
    const initialManagersData = await initialManagers.json();
    const initialManagerCount = initialManagersData.employees?.length || 0;
    console.log(`   Initial managers: ${initialManagerCount}`);

    // Step 3: HR receives a task (should create manager automatically)
    console.log("\n3️⃣ HR Receiving Task (should auto-create manager)...");
    const taskResponse = await fetch(`${API_BASE}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Manager Assignment",
        description: "Simple test task to verify manager creation and IC assignment",
        priority: "medium",
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
        taskTitle: "Test Manager Assignment",
        taskDescription: "Simple test task to verify manager creation and IC assignment",
      }),
    });

    console.log(`✅ Task sent to HR workflow`);
    console.log("   HR should create a manager if none exist...");
    await wait(10000);

    // Step 4: Check if manager was created
    console.log("\n4️⃣ Checking if manager was created...");
    const managersCheck = await fetch(`${API_BASE}/api/employees?role=manager`);
    const managersData = await managersCheck.json();
    const managers = managersData.employees || [];
    console.log(`   Total managers now: ${managers.length}`);

    if (managers.length > initialManagerCount) {
      console.log(`✅ Manager was created!`);
      const newManager = managers[managers.length - 1];
      console.log(`   Manager ID: ${newManager.id}`);
      console.log(`   Manager Name: ${newManager.name}`);
    } else {
      console.log(`⚠️ No new manager created (may already exist)`);
    }

    // Step 5: Check if ICs were hired and assigned to manager
    console.log("\n5️⃣ Checking IC assignments...");
    const icsCheck = await fetch(`${API_BASE}/api/employees?role=ic`);
    const icsData = await icsCheck.json();
    const allICs = icsData.employees || [];
    
    // Get ICs with managers
    const icsWithManagers = allICs.filter((ic: any) => ic.managerId);
    console.log(`   Total ICs: ${allICs.length}`);
    console.log(`   ICs with managers: ${icsWithManagers.length}`);

    if (icsWithManagers.length > 0) {
      console.log(`✅ ICs are assigned to managers!`);
      icsWithManagers.slice(0, 3).forEach((ic: any) => {
        console.log(`   - ${ic.name} (${ic.id}) → Manager: ${ic.managerId}`);
      });
    } else {
      console.log(`⚠️ No ICs have managers assigned yet`);
    }

    // Step 6: Check task assignment
    console.log("\n6️⃣ Checking task assignment...");
    const taskCheck = await fetch(`${API_BASE}/api/tasks`);
    const tasksData = await taskCheck.json();
    const assignedTask = tasksData.tasks?.find((t: any) => t.id === taskId);

    if (assignedTask) {
      console.log(`   Task Status: ${assignedTask.status}`);
      console.log(`   Assigned To: ${assignedTask.assignedTo || "Not assigned"}`);
      
      if (assignedTask.assignedTo) {
        const assignedIC = allICs.find((ic: any) => ic.id === assignedTask.assignedTo);
        if (assignedIC) {
          console.log(`   Assigned IC: ${assignedIC.name}`);
          console.log(`   IC's Manager: ${assignedIC.managerId || "None"}`);
          
          if (assignedIC.managerId) {
            console.log(`✅ IC has assigned manager!`);
          }
        }
      }
    }

    // Step 7: Test manual manager creation via HR
    console.log("\n7️⃣ Testing manual manager creation via HR...");
    const hireManagerResponse = await fetch(`${API_BASE}/api/hr/${hrId}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "hireEmployee",
        role: "manager",
        name: "Test Manager 2",
        skills: ["qa", "evaluation"],
      }),
    });

    if (hireManagerResponse.ok) {
      console.log(`✅ Manager hire request sent to HR`);
      await wait(5000);
      
      const finalManagersCheck = await fetch(`${API_BASE}/api/employees?role=manager`);
      const finalManagersData = await finalManagersCheck.json();
      const finalManagers = finalManagersData.employees || [];
      console.log(`   Total managers now: ${finalManagers.length}`);
    } else {
      const error = await hireManagerResponse.text();
      console.log(`⚠️ Manager hire request: ${error}`);
    }

    // Step 8: Summary
    console.log("\n📊 Summary:");
    console.log("=".repeat(70));
    
    const finalEmployees = await fetch(`${API_BASE}/api/employees`);
    const finalEmployeesData = await finalEmployees.json();
    const allEmployees = finalEmployeesData.employees || [];
    
    const finalManagers = allEmployees.filter((e: any) => e.role === "manager");
    const finalICs = allEmployees.filter((e: any) => e.role === "ic");
    const icsWithManagersFinal = finalICs.filter((ic: any) => ic.managerId);
    
    console.log(`   Total Employees: ${allEmployees.length}`);
    console.log(`   Managers: ${finalManagers.length}`);
    console.log(`   ICs: ${finalICs.length}`);
    console.log(`   ICs with Managers: ${icsWithManagersFinal.length}`);
    console.log(`   Manager Assignment Rate: ${((icsWithManagersFinal.length / finalICs.length) * 100).toFixed(1)}%`);
    console.log("=".repeat(70));

    console.log("\n✅ Manager-IC Assignment Test Completed!\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run test
testManagerAssignment().catch(console.error);

