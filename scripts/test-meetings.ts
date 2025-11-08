import { config } from "dotenv";

config({ path: ".env.local" });

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      console.error(`   ⚠️  Got non-JSON response:`, text.substring(0, 200));
      return { success: false, error: `Non-JSON response` };
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

async function testMeetingSystem() {
  console.log("=".repeat(60));
  console.log("Testing Meeting System");
  console.log("=".repeat(60));
  console.log(`Base URL: ${BASE_URL}\n`);

  let allPassed = true;

  // Step 1: Get some employees to use as participants
  console.log("Step 1: Getting employees for meeting...");
  const employeesResult = await testRoute("GET", "/api/employees", undefined, 200);
  if (!employeesResult.success) {
    console.error("❌ Failed to get employees");
    return;
  }
  const employees = employeesResult.data?.employees || [];
  const ics = employees.filter((e: any) => e.role === "ic");
  const managers = employees.filter((e: any) => e.role === "manager");

  if (ics.length < 2) {
    console.error("❌ Need at least 2 IC employees for testing");
    return;
  }

  const participantIds = ics.slice(0, 2).map((e: any) => e.id);
  const managerId = managers[0]?.id || participantIds[0]; // Use first IC as manager if no manager

  console.log(`   Using ${participantIds.length} ICs as participants`);
  console.log(`   Participants: ${participantIds.join(", ")}\n`);

  // Step 2: Start meeting orchestrator
  console.log("Step 2: Starting meeting orchestrator...");
  const orchestratorResult = await testRoute("POST", "/api/meetings", {}, 200);
  if (!orchestratorResult.success || !orchestratorResult.data?.orchestratorId) {
    console.error("❌ Failed to start meeting orchestrator");
    return;
  }
  const orchestratorId = orchestratorResult.data.orchestratorId;
  console.log(`   Orchestrator ID: ${orchestratorId}\n`);

  await sleep(2000);

  // Step 3: Schedule a meeting
  console.log("Step 3: Scheduling a meeting...");
  const scheduleResult = await testRoute(
    "POST",
    "/api/meetings",
    {
      orchestratorId,
      type: "standup",
      scheduledTime: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
      participants: participantIds,
      managerId: managerId,
      frequency: "daily",
    },
    200
  );
  if (!scheduleResult.success) {
    console.error("❌ Failed to schedule meeting");
    allPassed = false;
  } else {
    console.log(`   Meeting scheduled: ${scheduleResult.data?.meetingId}\n`);
  }

  // Step 4: Trigger a standup meeting manually
  console.log("Step 4: Triggering standup meeting...");
  const standupResult = await testRoute(
    "POST",
    `/api/meetings/orchestrator/${orchestratorId}/standup`,
    {
      managerId: managerId,
      participantIds: participantIds,
    },
    200
  );
  if (!standupResult.success) {
    console.error("❌ Failed to trigger standup");
    allPassed = false;
  } else {
    console.log("   Standup triggered\n");
  }

  // Wait for meeting to process
  console.log("Waiting for meeting to process (15s)...");
  await sleep(15000);

  // Step 5: Check if meeting was created
  console.log("\nStep 5: Checking if meeting was created...");
  const meetingsResult = await testRoute("GET", "/api/meetings", undefined, 200);
  if (!meetingsResult.success) {
    console.error("❌ Failed to get meetings");
    allPassed = false;
  } else {
    const meetings = meetingsResult.data?.meetings || [];
    const standups = meetings.filter((m: any) => m.type === "standup");
    console.log(`   Found ${standups.length} standup meetings`);
    if (standups.length > 0) {
      console.log(`   Latest standup:`);
      const latest = standups[standups.length - 1];
      console.log(`     ID: ${latest.id}`);
      console.log(`     Participants: ${latest.participants?.length || 0}`);
      console.log(`     Transcript length: ${latest.transcript?.length || 0} chars`);
    }
  }

  // Step 6: Send a ping
  console.log("\nStep 6: Sending async ping...");
  let pingResult: any = null;
  let pingId: string | null = null;
  if (participantIds.length >= 2) {
    pingResult = await testRoute(
      "POST",
      `/api/meetings/orchestrator/${orchestratorId}/ping`,
      {
        from: participantIds[0],
        to: participantIds[1],
        message: "Hey, can you help me with this task?",
      },
      200
    );
    if (!pingResult.success) {
      console.error("❌ Failed to send ping");
      allPassed = false;
    } else {
      console.log("   Ping sent successfully");
      // Generate a pingId for testing (in real scenario, this would come from the orchestrator)
      pingId = `test-ping-${Date.now()}`;
      console.log(`   Test pingId: ${pingId}\n`);
    }
  }

  // Wait for ping to be processed
  await sleep(2000);

  // Step 6b: Check if IC 2 received the ping
  console.log("Step 6b: Checking if IC 2 received the ping...");
  const ic2MemoriesResult = await testRoute(
    "GET",
    `/api/employees/${participantIds[1]}/memories`,
    undefined,
    200
  );
  if (ic2MemoriesResult.success) {
    const ic2Memories = ic2MemoriesResult.data?.memories || [];
    const receivedPing = ic2Memories.find((m: any) =>
      m.content?.includes("Received ping from")
    );
    if (receivedPing) {
      console.log("   ✅ IC 2 received the ping");
      console.log(`   Content: ${receivedPing.content.substring(0, 100)}...`);
      // Extract pingId from memory if possible, or use test pingId
      pingId = pingId || `extracted-${Date.now()}`;
    } else {
      console.log("   ⚠️  IC 2 did not receive ping in memory (IC workflow may not be running)");
    }
  } else {
    console.log("   ⚠️  Could not check IC 2 memories");
  }

  // Step 6c: Simulate IC 2 responding to the ping
  console.log("\nStep 6c: Simulating IC 2 response to ping...");
  if (pingId && participantIds.length >= 2) {
    const responseResult = await testRoute(
      "POST",
      `/api/meetings/orchestrator/${orchestratorId}/ping/response`,
      {
        pingId: pingId,
        from: participantIds[1], // IC 2 responding
        to: participantIds[0], // Original sender (IC 1)
        response: "Sure, I can help! What do you need?",
      },
      200
    );
    if (!responseResult.success) {
      console.error("   ❌ Failed to send ping response");
      allPassed = false;
    } else {
      console.log("   ✅ Ping response sent successfully\n");
    }
  } else {
    console.log("   ⚠️  Skipping response test (no pingId or participants)");
  }

  // Wait for response to be processed
  await sleep(2000);

  // Step 6d: Check if IC 1 received the response
  console.log("Step 6d: Checking if IC 1 received the response...");
  const ic1MemoriesResult = await testRoute(
    "GET",
    `/api/employees/${participantIds[0]}/memories`,
    undefined,
    200
  );
  if (ic1MemoriesResult.success) {
    const ic1Memories = ic1MemoriesResult.data?.memories || [];
    const receivedResponse = ic1Memories.find((m: any) =>
      m.content?.includes("Received response from")
    );
    if (receivedResponse) {
      console.log("   ✅ IC 1 received the response");
      console.log(`   Content: ${receivedResponse.content.substring(0, 100)}...`);
    } else {
      console.log("   ⚠️  IC 1 did not receive response in memory");
      allPassed = false;
    }
  } else {
    console.log("   ⚠️  Could not check IC 1 memories");
  }

  // Step 7: Check meetings list
  console.log("\nStep 7: Listing all meetings...");
  const allMeetingsResult = await testRoute("GET", "/api/meetings", undefined, 200);
  if (!allMeetingsResult.success) {
    console.error("❌ Failed to list meetings");
    allPassed = false;
  } else {
    const allMeetings = allMeetingsResult.data?.meetings || [];
    console.log(`   Total meetings: ${allMeetings.length}`);
    if (allMeetings.length > 0) {
      console.log(`   Meeting types: ${[...new Set(allMeetings.map((m: any) => m.type))].join(", ")}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Meeting System Test Summary");
  console.log("=".repeat(60));
  console.log(`Orchestrator Started: ${orchestratorResult.success ? "✅" : "❌"}`);
  console.log(`Meeting Scheduled: ${scheduleResult.success ? "✅" : "❌"}`);
  console.log(`Standup Triggered: ${standupResult.success ? "✅" : "❌"}`);
  console.log(`Meetings Created: ${meetingsResult.data?.meetings?.length || 0}`);
  console.log(`Ping Sent: ${participantIds.length >= 2 && pingResult?.success ? "✅" : "⚠️"}`);
  
  // Check ping response status
  if (participantIds.length >= 2) {
    const ic1Memories = await testRoute(
      "GET",
      `/api/employees/${participantIds[0]}/memories`,
      undefined,
      200
    );
    const ic2Memories = await testRoute(
      "GET",
      `/api/employees/${participantIds[1]}/memories`,
      undefined,
      200
    );
    const ic1HasResponse = ic1Memories.data?.memories?.some((m: any) =>
      m.content?.includes("Received response from")
    );
    const ic2HasPing = ic2Memories.data?.memories?.some((m: any) =>
      m.content?.includes("Received ping from")
    );
    console.log(`IC 2 Received Ping: ${ic2HasPing ? "✅" : "⚠️"}`);
    console.log(`IC 1 Received Response: ${ic1HasResponse ? "✅" : "⚠️"}`);
  }

  if (allPassed) {
    console.log("\n✅ Meeting system test completed!");
  } else {
    console.log("\n❌ Some tests failed. Check output above.");
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/meetings`);
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
        "  pnpm dev\n"
    );
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }

  await testMeetingSystem();
}

main();

