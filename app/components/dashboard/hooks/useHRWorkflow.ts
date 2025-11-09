import { useState, useEffect } from "react";

export function useHRWorkflow() {
  const [hrId, setHrId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initHR = async () => {
      try {
        const response = await fetch("/api/hr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await response.json();
        
        if (response.status === 503) {
          console.log("HR workflow already running, using existing instance");
          setError(null);
          return;
        }
        
        if (data.success && data.hrId) {
          setHrId(data.hrId);
          setError(null);
        } else {
          setError(data.error || "Failed to initialize HR workflow");
        }
      } catch (err) {
        console.error("Error initializing HR:", err);
      }
    };
    initHR();
  }, []);

  return { hrId, error, setError };
}

