"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Task, Employee, Deliverable, Cost } from "../types";
import { ArrowRight } from "lucide-react";

interface OverviewTabProps {
  tasks: Task[];
  employees: Employee[];
  deliverables: Deliverable[];
  costs: Cost[];
}

export function OverviewTab({ tasks, employees, deliverables, costs }: OverviewTabProps) {
  const activeEmployees = employees.filter((e) => e.status === "active");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg">Chat to Dive Deeper</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the chat to dive deeper into the data, learn more your organization, and get insights into work in-progress.
          </p>
          <Sheet>
            <SheetTrigger asChild>
              <Button className="w-full mt-4">
                <span className="relative flex items-center">
                  <span className="mr-2">
                    <span className="animate-pulse relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border border-white opacity-40"></span>
                    </span>
                  </span>
                  Clock-in
                  <ArrowRight className="w-4 h-4 ml-2" />
                </span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-full max-w-none w-full rounded-none p-0">
              <div className="flex flex-col h-full">
                <SheetHeader>
                  <SheetTitle>Chat</SheetTitle>
                </SheetHeader>
                <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 bg-muted">
                  <div className="text-sm text-muted-foreground text-center">
                    {/* Placeholder chat UI */}
                    <div className="mb-4">
                      <span className="inline-block rounded-full bg-gray-200 px-4 py-2 text-gray-600">
                        Welcome to the Chat! Start typing to dive deeper into your data.
                      </span>
                    </div>
                    <div className="rounded border p-2 bg-white w-full max-w-md h-48 flex flex-col justify-end">
                      <div className="flex-1 flex items-end justify-center text-gray-400">
                        <span>Chat history will appear here...</span>
                      </div>
                    </div>
                    <div className="mt-4 w-full max-w-md">
                      <input
                        type="text"
                        className="w-full border rounded p-2 text-sm focus:outline-none"
                        placeholder="Type a message..."
                        disabled
                      />
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </CardContent>
      </Card>
      
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tasks Overview</CardTitle>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">In-progress</span>
                <span className="font-semibold">
                  {tasks.filter((t) => t.status === "in-progress").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Pending</span>
                <span className="font-semibold">
                  {tasks.filter((t) => t.status === "pending").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Cost Records</span>
                <span className="font-semibold">{costs.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Deliverables</span>
                <span className="font-semibold">{deliverables.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Workforce Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Employees</span>
                <span className="font-semibold">{employees.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Active</span>
                <span className="font-semibold">{activeEmployees.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Managers</span>
                <span className="font-semibold">{employees.filter((e) => e.role === "manager").length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

    </div>
  );
}

