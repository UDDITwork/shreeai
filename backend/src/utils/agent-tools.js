// Agent tool utilities
export const AGENT_TOOLS = {
  SEARCH_WEB: 'search_web',
  SAVE_IDEA: 'save_idea',
  SAVE_TASK: 'save_task',
  SET_REMINDER: 'set_reminder',
  SEARCH_MEMORY: 'search_memory',
  PROCESS_IMAGE: 'process_image',
  SEND_EMAIL: 'send_email',
  READ_EMAILS: 'read_emails',
  GENERATE_SUMMARY: 'generate_summary',
};

export function formatToolResult(toolName, result) {
  return {
    tool: toolName,
    result,
    timestamp: new Date().toISOString(),
  };
}

