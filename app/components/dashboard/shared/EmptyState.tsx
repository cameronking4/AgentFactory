"use client";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
  };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="p-8">
      <p className="text-center py-8 mb-4">{description}</p>
      {action && (
        <div className="flex justify-center">
          <button
            onClick={action.onClick}
            disabled={action.loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {action.loading ? "Loading..." : action.label}
          </button>
        </div>
      )}
    </div>
  );
}

