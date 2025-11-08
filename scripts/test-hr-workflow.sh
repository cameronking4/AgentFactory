#!/bin/bash

BASE_URL="http://localhost:3001"

echo "=== Full HR Workflow Test ==="
echo ""

echo "1. Starting HR workflow..."
HR_RESPONSE=$(curl -s -X POST "$BASE_URL/api/hr" -H "Content-Type: application/json" -d '{}')
HR_ID=$(echo "$HR_RESPONSE" | grep -o '"hrId":"[^"]*"' | cut -d'"' -f4)
echo "   HR ID: $HR_ID"
sleep 3
echo ""

echo "2. Creating high-level task..."
TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Create a REST API with authentication",
    "description": "Build a RESTful API with JWT authentication, user management, and CRUD operations for a todo app",
    "priority": "high"
  }')
TASK_ID=$(echo "$TASK_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "   Task ID: $TASK_ID"
echo ""

echo "3. Sending task to HR..."
SEND_TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/hr/$HR_ID/task" \
  -H "Content-Type: application/json" \
  -d "{
    \"taskId\": \"$TASK_ID\",
    \"taskTitle\": \"Create a REST API with authentication\",
    \"taskDescription\": \"Build a RESTful API with JWT authentication, user management, and CRUD operations for a todo app\"
  }")
echo "$SEND_TASK_RESPONSE" | jq .
echo ""

echo "4. Waiting for HR to process (15 seconds)..."
sleep 15
echo ""

echo "5. Checking employees..."
curl -s "$BASE_URL/api/employees" | jq '{count: .count, employees: [.employees[] | {id, name, role, skills}]}'
echo ""

echo "6. Checking task assignment..."
curl -s "$BASE_URL/api/tasks" | jq ".tasks[] | select(.id == \"$TASK_ID\") | {id, title, status, assignedTo}"

