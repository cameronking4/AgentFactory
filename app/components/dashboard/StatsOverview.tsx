"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Users, FileText, DollarSign } from "lucide-react";
import type { Task, Employee, Deliverable, Cost } from "./types";

interface StatsOverviewProps {
  tasks: Task[];
  employees: Employee[];
  deliverables: Deliverable[];
  costs: Cost[];
}

export function StatsOverview({ tasks, employees, deliverables, costs }: StatsOverviewProps) {
  const highLevelTasks = tasks.filter((t) => !t.parentTaskId);
  const subtasks = tasks.filter((t) => t.parentTaskId);
  const ics = employees.filter((e) => e.role === "ic");
  const managers = employees.filter((e) => e.role === "manager");
  const totalCost = costs.reduce((sum, cost) => sum + parseFloat(cost.amount || "0"), 0);

  const stats = [
    {
      title: "Total Tasks",
      subtitle: "All tasks",
      mainValue: tasks.length,
      badge: (
        <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 px-2 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-none">
          <CheckSquare className="w-3 h-3 text-blue-500" />
          {highLevelTasks.length} high-level
        </Badge>
      ),
      secondary: (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{subtasks.length}</span> subtasks
        </div>
      ),
    },
    {
      title: "Employees",
      subtitle: "Active workforce",
      mainValue: employees.length,
      badge: (
        <Badge className="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400 px-2 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-none">
          <Users className="w-3 h-3 text-purple-500" />
          {ics.length} ICs
        </Badge>
      ),
      secondary: (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{managers.length}</span> managers
        </div>
      ),
    },
    {
      title: "Deliverables",
      subtitle: "Completed work",
      mainValue: deliverables.length,
      badge: (
        <Badge className="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400 px-2 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-none">
          <FileText className="w-3 h-3 text-green-500" />
          Total
        </Badge>
      ),
      secondary: (
        <div className="text-sm text-muted-foreground">All completed deliverables</div>
      ),
    },
    {
      title: "Total Cost",
      subtitle: "All time",
      mainValue: `$${totalCost.toFixed(2)}`,
      badge: (
        <Badge className="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 px-2 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-none">
          <DollarSign className="w-3 h-3 text-orange-500" />
          USD
        </Badge>
      ),
      secondary: (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{costs.length}</span> cost records
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 bg-background overflow-hidden rounded-xl border border-border mb-8">
      {stats.map((stat) => (
        <Card
          key={stat.title}
          className="border-0 shadow-none rounded-none border-y md:border-x md:border-y-0 border-border first:border-t-0 md:first:border-l-0 md:first:border-t last:border-0"
        >
          <CardContent className="flex flex-col h-full space-y-2 justify-between">
            <div className="space-y-0.5">
              <div className="text-lg font-semibold text-foreground">{stat.title}</div>
              <div className="text-sm text-muted-foreground">{stat.subtitle}</div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5 justify-between grow">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold tracking-tight">{stat.mainValue}</span>
                {stat.badge}
              </div>
              {stat.secondary}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

