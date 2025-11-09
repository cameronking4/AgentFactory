"use client";

import type { Cost, CostAggregates, Task, Employee } from "../types";

interface CostsTabProps {
  costs: Cost[];
  costAggregates: CostAggregates | null;
  tasks: Task[];
  employees: Employee[];
}

export function CostsTab({ costs, costAggregates, tasks, employees }: CostsTabProps) {
  return (
    <div className="rounded-lg border shadow p-6">
      <h2 className="text-2xl font-semibold mb-6">Cost Breakdown</h2>

      {costAggregates && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border p-4">
              <div className="text-sm mb-1">Total Cost</div>
              <div className="text-2xl font-bold">${costAggregates.total?.toFixed(2) || "0.00"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm mb-1">Total Records</div>
              <div className="text-2xl font-bold">{costs.length}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm mb-1">Avg per Record</div>
              <div className="text-2xl font-bold">
                ${costs.length > 0 ? (costAggregates.total / costs.length).toFixed(4) : "0.00"}
              </div>
            </div>
          </div>

          {/* By Type */}
          {costAggregates.byType && Object.keys(costAggregates.byType).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Costs by Type</h3>
              <div className="space-y-2">
                {Object.entries(costAggregates.byType).map(([type, amount]) => (
                  <div key={type} className="flex justify-between items-center p-3 rounded-lg border">
                    <span className="font-medium capitalize">{type}</span>
                    <span>${amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By Employee */}
          {costAggregates.byEmployee && Object.keys(costAggregates.byEmployee).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Costs by Employee</h3>
              <div className="space-y-2">
                {Object.entries(costAggregates.byEmployee)
                  .sort(([, a], [, b]) => b - a)
                  .map(([employeeId, amount]) => {
                    const employee = employees.find((e) => e.id === employeeId);
                    return (
                      <div key={employeeId} className="flex justify-between items-center p-3 rounded-lg border">
                        <span className="font-medium">
                          {employee?.name || `Employee ${employeeId.slice(0, 8)}...`}
                        </span>
                        <span>${amount.toFixed(2)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* By Task */}
          {costAggregates.byTask && Object.keys(costAggregates.byTask).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Costs by Task</h3>
              <div className="space-y-2">
                {Object.entries(costAggregates.byTask)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([taskId, amount]) => {
                    const task = tasks.find((t) => t.id === taskId);
                    return (
                      <div key={taskId} className="flex justify-between items-center p-3 rounded-lg border">
                        <span className="font-medium">{task?.title || `Task ${taskId.slice(0, 8)}...`}</span>
                        <span>${amount.toFixed(2)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Recent Costs */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Recent Costs</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Timestamp</th>
                    <th className="text-left p-2">Employee</th>
                    <th className="text-left p-2">Task</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Amount</th>
                    <th className="text-right p-2">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {costs
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .slice(0, 20)
                    .map((cost) => {
                      const employee = employees.find((e) => e.id === cost.employeeId);
                      const task = tasks.find((t) => t.id === cost.taskId);
                      return (
                        <tr key={cost.id} className="border-b">
                          <td className="p-2">{new Date(cost.timestamp).toLocaleString()}</td>
                          <td className="p-2">
                            {employee?.name ||
                              (cost.employeeId ? `${cost.employeeId.slice(0, 8)}...` : "N/A")}
                          </td>
                          <td className="p-2">
                            {task ? (
                              <span className="truncate max-w-xs block" title={task.title}>
                                {task.title}
                              </span>
                            ) : (
                              cost.taskId ? `${cost.taskId.slice(0, 8)}...` : "N/A"
                            )}
                          </td>
                          <td className="p-2 capitalize">{cost.type}</td>
                          <td className="p-2 text-right font-medium">
                            ${parseFloat(cost.amount).toFixed(4)}
                          </td>
                          <td className="p-2 text-right">
                            {cost.totalTokens ? cost.totalTokens.toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

