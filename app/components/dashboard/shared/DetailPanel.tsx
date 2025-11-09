"use client";

interface DetailPanelProps {
  children: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DetailPanel({ children, emptyTitle, emptyDescription }: DetailPanelProps) {
  if (!children) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-lg mb-2">{emptyTitle || "Select an item"}</p>
          <p className="text-sm">{emptyDescription || "Choose an item from the list to view details"}</p>
        </div>
      </div>
    );
  }

  return <div className="overflow-hidden flex flex-col bg-white">{children}</div>;
}

