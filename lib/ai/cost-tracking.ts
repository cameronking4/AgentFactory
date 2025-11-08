import { db } from "@/lib/db";
import { costs } from "@/lib/db/schema";
import type { GenerateTextResult } from "ai";

/**
 * Estimates cost based on model and token usage
 * Pricing for OpenAI models (as of 2024, adjust as needed)
 */
function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Default pricing (adjust based on actual model pricing)
  // These are approximate prices per 1M tokens
  const pricing: Record<string, { prompt: number; completion: number }> = {
    "gpt-4.1": { prompt: 30.0, completion: 60.0 }, // GPT-4 Turbo pricing
    "gpt-4o": { prompt: 5.0, completion: 15.0 },
    "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
    "gpt-4": { prompt: 30.0, completion: 60.0 },
    "gpt-3.5-turbo": { prompt: 0.5, completion: 1.5 },
  };

  // Extract model name (handle "openai/gpt-4.1" format)
  const modelName = model.includes("/") ? model.split("/")[1] : model;
  const modelPricing = pricing[modelName] || pricing["gpt-4o"]; // Default to gpt-4o

  const promptCost = (promptTokens / 1_000_000) * modelPricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * modelPricing.completion;

  return promptCost + completionCost;
}

/**
 * Tracks cost and token usage from an AI SDK generateText result
 * Note: This should be called from within a step function
 */
export async function trackAICost(
  result: GenerateTextResult<unknown>,
  options: {
    employeeId: string | null;
    taskId: string | null;
    model: string;
    operation: string; // e.g., "task_execution", "evaluation", "reflection"
  }
): Promise<void> {

  try {
    // Extract usage information from AI SDK result
    const usage = result.usage;
    if (!usage) {
      console.warn("No usage information in AI SDK result");
      return;
    }

    const promptTokens = usage.promptTokens || 0;
    const completionTokens = usage.completionTokens || 0;
    const totalTokens = usage.totalTokens || promptTokens + completionTokens;

    // Estimate cost
    const cost = estimateCost(options.model, promptTokens, completionTokens);

    // Store cost record
    await db.insert(costs).values({
      employeeId: options.employeeId,
      taskId: options.taskId,
      type: "api", // API call cost
      amount: cost.toFixed(2),
      currency: "USD",
      promptTokens,
      completionTokens,
      totalTokens,
    });

    console.log(
      `[Cost Tracking] ${options.operation} - Employee: ${options.employeeId || "N/A"}, Task: ${options.taskId || "N/A"}, Cost: $${cost.toFixed(4)}, Tokens: ${totalTokens} (${promptTokens} prompt + ${completionTokens} completion)`
    );
  } catch (error) {
    console.error("Error tracking AI cost:", error);
    // Don't throw - cost tracking failure shouldn't break the workflow
  }
}

