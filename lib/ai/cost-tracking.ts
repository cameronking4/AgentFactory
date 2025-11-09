import { db } from "@/lib/db";
import { costs } from "@/lib/db/schema";
import { generateText } from "ai";

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
    "gpt-4.1": { prompt: 10.0, completion: 30.0 }, // GPT-4.1 via AI Gateway (estimated)
    "openai/gpt-4.1": { prompt: 10.0, completion: 30.0 }, // AI Gateway format
    "gpt-4o": { prompt: 5.0, completion: 15.0 },
    "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
    "gpt-4": { prompt: 30.0, completion: 60.0 },
    "gpt-3.5-turbo": { prompt: 0.5, completion: 1.5 },
  };

  // Extract model name (handle "openai/gpt-4.1" format)
  // Try full model string first, then extract name
  const modelPricing = pricing[model] || pricing[model.includes("/") ? model.split("/")[1] : model] || pricing["gpt-4o"];

  const promptCost = (promptTokens / 1_000_000) * modelPricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * modelPricing.completion;

  return promptCost + completionCost;
}

/**
 * Tracks cost and token usage from an AI SDK generateText result
 * Note: This should be called from within a step function
 */
export async function trackAICost(
  result: Awaited<ReturnType<typeof generateText>>,
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

    // AI SDK v5 uses LanguageModelV2Usage which has inputTokens and outputTokens
    // (not promptTokens/completionTokens)
    const promptTokens = usage.inputTokens ?? 0;
    const completionTokens = usage.outputTokens ?? 0;
    const totalTokens = usage.totalTokens ?? (promptTokens + completionTokens);

    // If we only have totalTokens, estimate split (typically 70% prompt, 30% completion)
    let estimatedPromptTokens = promptTokens;
    let estimatedCompletionTokens = completionTokens;
    
    if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
      // Estimate: assume 70% prompt, 30% completion (typical for most AI tasks)
      estimatedPromptTokens = Math.floor(totalTokens * 0.7);
      estimatedCompletionTokens = totalTokens - estimatedPromptTokens;
    }

    // Estimate cost
    const cost = estimateCost(options.model, estimatedPromptTokens, estimatedCompletionTokens);

    // Store cost record
    await db.insert(costs).values({
      employeeId: options.employeeId,
      taskId: options.taskId,
      type: "api", // API call cost
      amount: cost.toFixed(2),
      currency: "USD",
      promptTokens: estimatedPromptTokens,
      completionTokens: estimatedCompletionTokens,
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

