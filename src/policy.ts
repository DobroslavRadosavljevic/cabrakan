import { Effect } from "effect";
import { HTTP_METHODS, type HttpMethod, type OpenApiMcpTool } from "./types.ts";

export type ToolPolicy = {
  include?: string[];
  exclude?: string[];
  tags?: string[];
  excludeTags?: string[];
  methods?: HttpMethod[];
  pathPrefixes?: string[];
  namePrefix?: string;
  confirmMutating?: boolean;
};

const MUTATING: ReadonlySet<HttpMethod> = new Set(["post", "put", "patch", "delete"]);

export function isMutatingMethod(method: HttpMethod): boolean {
  return MUTATING.has(method);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesAny(value: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => globToRegExp(pattern).test(value));
}

export function toolAllowedByPolicy(tool: OpenApiMcpTool, policy: ToolPolicy | undefined): boolean {
  if (!policy) {
    return true;
  }
  if (policy.methods && policy.methods.length > 0 && !policy.methods.includes(tool.method)) {
    return false;
  }
  if (policy.pathPrefixes && policy.pathPrefixes.length > 0) {
    const ok = policy.pathPrefixes.some((prefix) => tool.path.startsWith(prefix));
    if (!ok) {
      return false;
    }
  }
  if (policy.tags && policy.tags.length > 0) {
    const tags = tool.tags ?? [];
    if (!policy.tags.some((tag) => tags.includes(tag))) {
      return false;
    }
  }
  if (policy.excludeTags && policy.excludeTags.length > 0) {
    const tags = tool.tags ?? [];
    if (policy.excludeTags.some((tag) => tags.includes(tag))) {
      return false;
    }
  }
  if (policy.include && policy.include.length > 0 && !matchesAny(tool.name, policy.include)) {
    return false;
  }
  if (policy.exclude && matchesAny(tool.name, policy.exclude)) {
    return false;
  }
  return true;
}

export function applyToolPolicy(tools: OpenApiMcpTool[], policy: ToolPolicy | undefined): OpenApiMcpTool[] {
  const prefixed = policy?.namePrefix
    ? tools.map((tool) => ({
        ...tool,
        name: `${policy.namePrefix}${tool.name}`.slice(0, 64),
      }))
    : tools;
  return prefixed.filter((tool) => toolAllowedByPolicy(tool, policy));
}

export const applyToolPolicyEffect = (
  tools: OpenApiMcpTool[],
  policy: ToolPolicy | undefined,
): Effect.Effect<OpenApiMcpTool[]> => Effect.sync(() => applyToolPolicy(tools, policy));

export function parseHttpMethods(values: string[] | undefined): HttpMethod[] | { error: string } | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const methods: HttpMethod[] = [];
  for (const raw of values) {
    for (const piece of raw.split(",")) {
      const method = piece.trim().toLowerCase();
      if (!HTTP_METHODS.includes(method as HttpMethod)) {
        return { error: `Unknown HTTP method "${piece.trim()}"` };
      }
      methods.push(method as HttpMethod);
    }
  }
  return methods;
}
