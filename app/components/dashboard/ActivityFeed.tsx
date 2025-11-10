"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  PlayCircle,
  FileText,
  Star,
  DollarSign,
  User,
  Clock,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface ActivityItem {
  id: string;
  type: "task_created" | "task_started" | "task_completed" | "deliverable_created" | "deliverable_evaluated" | "employee_active" | "cost_recorded";
  timestamp: string;
  employeeId?: string;
  employeeName?: string;
  taskId?: string;
  taskTitle?: string;
  deliverableId?: string;
  deliverableType?: string;
  costAmount?: string;
  description: string;
  metadata?: Record<string, any>;
}

interface ActivityFeedProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  limit?: number;
  hours?: number;
}

const getActivityIcon = (type: ActivityItem["type"]) => {
  switch (type) {
    case "task_created":
      return <FileText className="w-4 h-4 text-blue-500" />;
    case "task_started":
      return <PlayCircle className="w-4 h-4 text-yellow-500" />;
    case "task_completed":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "deliverable_created":
      return <FileText className="w-4 h-4 text-purple-500" />;
    case "deliverable_evaluated":
      return <Star className="w-4 h-4 text-amber-500" />;
    case "employee_active":
      return <User className="w-4 h-4 text-indigo-500" />;
    case "cost_recorded":
      return <DollarSign className="w-4 h-4 text-orange-500" />;
    default:
      return <Clock className="w-4 h-4 text-gray-500" />;
  }
};

const getActivityColor = (type: ActivityItem["type"]) => {
  switch (type) {
    case "task_created":
      return "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900";
    case "task_started":
      return "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900";
    case "task_completed":
      return "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900";
    case "deliverable_created":
      return "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-900";
    case "deliverable_evaluated":
      return "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900";
    case "employee_active":
      return "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900";
    case "cost_recorded":
      return "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900";
    default:
      return "bg-gray-50 border-gray-200 dark:bg-gray-950/20 dark:border-gray-900";
  }
};

const getTypeLabel = (type: ActivityItem["type"]) => {
  switch (type) {
    case "task_created":
      return "Task Created";
    case "task_started":
      return "Task Started";
    case "task_completed":
      return "Task Completed";
    case "deliverable_created":
      return "Deliverable Created";
    case "deliverable_evaluated":
      return "Deliverable Evaluated";
    case "employee_active":
      return "Active Work";
    case "cost_recorded":
      return "API Usage";
    default:
      return "Activity";
  }
};

export function ActivityFeed({
  autoRefresh = true,
  refreshInterval = 5000,
  limit = 50,
  hours = 24,
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/activity?limit=${limit}&hours=${hours}`);
      const data = await response.json();

      if (data.success) {
        setActivities(data.activities || []);
      } else {
        setError(data.error || "Failed to fetch activities");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();

    if (autoRefresh) {
      const interval = setInterval(fetchActivities, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, limit, hours]);

  if (loading && activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive py-4">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Activity
            {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <Badge variant="outline" className="text-xs">
            Last {hours}h
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No recent activity
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`p-3 rounded-lg border ${getActivityColor(activity.type)} transition-all hover:shadow-sm`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className="text-xs font-medium"
                            >
                              {getTypeLabel(activity.type)}
                            </Badge>
                            {activity.employeeName && (
                              <span className="text-sm font-medium text-foreground">
                                {activity.employeeName}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-foreground">{activity.description}</p>
                          {activity.taskTitle && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              Task: {activity.taskTitle}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(activity.timestamp), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      {activity.metadata?.evaluationScore && (
                        <div className="mt-1">
                          <Badge variant="secondary" className="text-xs">
                            Score: {activity.metadata.evaluationScore}
                          </Badge>
                        </div>
                      )}
                      {activity.costAmount && (
                        <div className="mt-1">
                          <Badge variant="secondary" className="text-xs">
                            ${activity.costAmount}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

