"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EllipsisVerticalIcon, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

interface HeaderProps {
  hrId: string | null;
  onCreateTask: (title: string, description: string) => Promise<void>;
  onClearDatabase: () => Promise<void>;
  loading: boolean;
}

export function Header({ hrId, onCreateTask, onClearDatabase, loading }: HeaderProps) {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !taskDescription.trim()) return;
    await onCreateTask(taskTitle, taskDescription);
    setTaskTitle("");
    setTaskDescription("");
    setTaskDialogOpen(false);
  };

  return (
    <div className="mb-8">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h1 className="text-4xl font-bold mb-2">CEO Dashboard</h1>
          <p className="text-lg">AI Agent Factory - Monitor and manage your autonomous workforce</p>
          {hrId && (
            <p className="text-sm mt-1">
              Agent Resources Workflow: <code className="px-2 py-1 rounded border">{hrId.slice(0, 20)}...</code>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
            <DialogTrigger asChild>
              <Button>Create Task</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Task Title</label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g., Build a Next.js blog platform"
                    className="w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2"
                    disabled={loading || !hrId}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Task Description</label>
                  <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="Describe the task in detail..."
                    rows={4}
                    className="w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2"
                    disabled={loading || !hrId}
                  />
                </div>
                <div className="flex gap-4 justify-end">
                  <Button
                    onClick={handleCreateTask}
                    disabled={loading || !hrId || !taskTitle.trim() || !taskDescription.trim()}
                  >
                    {loading ? "Creating Task..." : "Create Task & Assign to AR (Agent Resources)"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More options">
                <span className="sr-only">More options</span>
                <EllipsisVerticalIcon className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="end">
              <button
                onClick={onClearDatabase}
                className="w-full text-left px-4 py-2 text-sm rounded hover:bg-red-50 focus:outline-none focus:bg-red-100 text-red-700"
                disabled={loading}
              >
                Layoff Staff
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

