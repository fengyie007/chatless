export const LIST_TOOLS_TTL_MS = 60_000; // 1min 缓存，降低重复 listTools 开销
export const LIST_TOOLS_TIMEOUT_MS = 5_000; // 单次 listTools 超时，从1.2秒增加到5秒，保障连接稳定性
export const MCP_CONNECT_TIMEOUT_MS = 30_000; // MCP连接超时时间
export const MCP_INIT_TIMEOUT_MS = 15_000; // MCP初始化超时时间（包括连接和工具列表获取）
export const MAX_TOOL_SIGNATURES = 6;
export const MAX_TOOL_SUMMARY_PER_SERVER = 8;
// 默认递归深度（可被设置页覆盖）
export const DEFAULT_MAX_TOOL_RECURSION_DEPTH = 6;
// 兼容旧常量名（仍导出，但不再直接使用硬编码）
export const MAX_TOOL_RECURSION_DEPTH = DEFAULT_MAX_TOOL_RECURSION_DEPTH;
export const CALL_TOOL_TIMEOUT_MS = 30_000; // 单次工具调用超时
