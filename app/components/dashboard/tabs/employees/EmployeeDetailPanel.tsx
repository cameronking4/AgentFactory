"use client";

import type { Employee, EmployeeDetails } from "../../types";

interface EmployeeDetailPanelProps {
  employeeDetails: EmployeeDetails;
  employees: Employee[];
  onEmployeeSelect: (employee: Employee | null) => void;
}

export function EmployeeDetailPanel({
  employeeDetails,
  employees,
  onEmployeeSelect,
}: EmployeeDetailPanelProps) {
  return (
    <>
      <div className="p-6 border-b bg-gray-50">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex gap-2 items-center mb-2">
              <span
                className={`px-3 py-1 rounded text-sm font-medium border capitalize ${
                  employeeDetails.employee.role === "manager"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {employeeDetails.employee.role.toUpperCase()}
              </span>
              {employeeDetails.employee.status === "terminated" && (
                <span className="px-3 py-1 rounded text-sm font-medium border bg-red-100 text-red-800">
                  Terminated
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{employeeDetails.employee.name}</h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {employeeDetails.relationships.manager && (
            <div>
              <span className="text-gray-600">Manager: </span>
              <span
                className="text-blue-600 cursor-pointer hover:underline font-medium"
                onClick={() => {
                  const manager = employees.find((e) => e.id === employeeDetails.employee.managerId);
                  if (manager) {
                    onEmployeeSelect(manager);
                  }
                }}
              >
                {employeeDetails.relationships.manager.name}
              </span>
            </div>
          )}
          {employeeDetails.relationships.directReports.length > 0 && (
            <div>
              <span className="text-gray-600">Direct Reports: </span>
              <span className="font-medium">{employeeDetails.relationships.directReports.length}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* Skills */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Skills</h4>
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="flex flex-wrap gap-2">
                {employeeDetails.employee.skills.map((skill, idx) => (
                  <span key={idx} className="px-2 py-1 rounded text-xs border bg-white">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Stats</h4>
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600">Current Tasks</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {employeeDetails.stats.currentTasks}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Completed</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {employeeDetails.stats.completedTasks}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Memories</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {employeeDetails.stats.totalMemories}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Pings</div>
                  <div className="text-2xl font-bold text-gray-900">{employeeDetails.stats.totalPings}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Direct Reports */}
          {employeeDetails.relationships.directReports.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Direct Reports ({employeeDetails.relationships.directReports.length})
              </h4>
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="space-y-2">
                  {employeeDetails.relationships.directReports.map((dr) => (
                    <div
                      key={dr.id}
                      className="text-sm text-blue-600 cursor-pointer hover:underline font-medium"
                      onClick={() => {
                        const report = employees.find((e) => e.id === dr.id);
                        if (report) {
                          onEmployeeSelect(report);
                        }
                      }}
                    >
                      {dr.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Memories */}
          {employeeDetails.memories.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Memories ({employeeDetails.memories.length})
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {employeeDetails.memories.slice(0, 10).map((memory) => (
                  <div key={memory.id} className="rounded-lg border bg-white p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="px-2 py-1 rounded text-xs font-medium border capitalize">
                        {memory.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(memory.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm mt-2 text-gray-900 line-clamp-3">{memory.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pings */}
          {employeeDetails.pings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Pings ({employeeDetails.pings.length})
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {employeeDetails.pings.slice(0, 5).map((ping, idx) => (
                  <div key={idx} className="rounded-lg border bg-white p-4">
                    <div className="text-sm text-gray-900 line-clamp-3">{ping.content}</div>
                    <div className="text-xs mt-2 text-gray-500">
                      {new Date(ping.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meetings */}
          {employeeDetails.meetings.recent.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Meetings</h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {employeeDetails.meetings.recent.slice(0, 5).map((meeting) => (
                  <div key={meeting.id} className="rounded-lg border bg-white p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="px-2 py-1 rounded text-xs font-medium border capitalize">
                        {meeting.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(meeting.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">{meeting.participants.length} participants</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

