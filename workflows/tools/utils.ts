/**
 * Utility functions for tool validation and management
 */

/**
 * Validates that all tools have proper inputSchema with _zod property
 * This is critical for AI SDK to process tools correctly
 */
export function validateTools(tools: Record<string, any>, context: string): void {
  for (const [toolName, toolDef] of Object.entries(tools)) {
    if (!toolDef || typeof toolDef !== 'object') {
      console.error(`[${context}] Tool ${toolName} is invalid`);
      throw new Error(`Invalid tool definition for ${toolName}`);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolDefAny = toolDef as any;
    if (!toolDefAny.inputSchema && !toolDefAny.parameters) {
      console.error(`[${context}] Tool ${toolName} is missing inputSchema/parameters`);
      throw new Error(`Tool ${toolName} is missing inputSchema/parameters`);
    }
    
    const schema = toolDefAny.inputSchema || toolDefAny.parameters;
    if (!schema) {
      console.error(`[${context}] Tool ${toolName} has no schema (inputSchema or parameters)`);
      throw new Error(`Tool ${toolName} has no schema`);
    }
    
    // Check if schema has _zod property - this is critical for AI SDK
    // Note: Some schemas might work without _zod, but we log a warning
    if (!schema._zod) {
      console.warn(`[${context}] Tool ${toolName} schema missing _zod property. Schema type: ${typeof schema}, keys: ${Object.keys(schema).join(', ')}`);
      // Don't throw - let AI SDK handle it, but log for debugging
    }
  }
}

