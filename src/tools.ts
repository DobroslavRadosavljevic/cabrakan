import { HTTP_METHODS, type HttpMethod, type JsonSchema, type OpenApiDocument, type OpenApiMcpTool, type OpenApiOperation, type OpenApiParameter, type OpenApiPathItem } from "./types.ts";

const NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function toolNameFor(method: HttpMethod, path: string, operationId?: string): string {
  const raw = operationId?.trim() || `${method}_${path}`;
  let name = raw
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  if (!name || !/^[a-zA-Z]/.test(name)) {
    name = `op_${name}`.slice(0, 64);
  }

  if (!NAME_PATTERN.test(name)) {
    name = `op_${hashName(raw)}`.slice(0, 64);
  }

  return name;
}

function hashName(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function uniquifyToolName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${name.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Could not uniquify tool name ${name}`);
}

function pickJsonContent(
  content: Record<string, { schema?: JsonSchema }> | undefined,
): { schema?: JsonSchema; contentType?: string } {
  if (!content) {
    return {};
  }
  const jsonKey = Object.keys(content).find((key) => key.includes("json"));
  const formKey = Object.keys(content).find((key) => key.includes("www-form-urlencoded"));
  const key = jsonKey ?? formKey ?? Object.keys(content)[0];
  return key ? { schema: content[key]?.schema, contentType: key } : {};
}

function mergeParameters(pathItem: OpenApiParameter[], operation: OpenApiParameter[]): OpenApiParameter[] {
  const merged = new Map<string, OpenApiParameter>();
  for (const parameter of [...pathItem, ...operation]) {
    merged.set(`${parameter.in}:${parameter.name}`, parameter);
  }
  return [...merged.values()];
}

function parameterSchema(parameter: OpenApiParameter): JsonSchema {
  const schema = { ...(parameter.schema ?? { type: "string" }) };
  if (parameter.description && typeof schema.description !== "string") {
    schema.description = parameter.description;
  }
  return schema;
}

function isSecurityParameter(parameter: OpenApiParameter, document: OpenApiDocument): boolean {
  for (const scheme of Object.values(document.components?.securitySchemes ?? {})) {
    if (scheme.type === "apiKey" && scheme.name === parameter.name && scheme.in === parameter.in) {
      return true;
    }
  }
  return false;
}

export function operationToTool(
  method: HttpMethod,
  path: string,
  operation: OpenApiOperation,
  pathItem: OpenApiPathItem,
  document: OpenApiDocument,
  usedNames: Set<string> = new Set(),
): OpenApiMcpTool {
  const parameters = mergeParameters(pathItem.parameters ?? [], operation.parameters ?? []).filter(
    (parameter) => !isSecurityParameter(parameter, document),
  );
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const locations: OpenApiMcpTool["locations"] = {};

  for (const parameter of parameters) {
    properties[parameter.name] = parameterSchema(parameter);
    locations[parameter.name] = parameter.in;
    if (parameter.required || parameter.in === "path") {
      required.push(parameter.name);
    }
  }

  const picked = pickJsonContent(operation.requestBody?.content);
  if (picked.schema || operation.requestBody) {
    properties.body = picked.schema ?? { type: "object", additionalProperties: true };
    locations.body = "body";
    if (operation.requestBody?.required) {
      required.push("body");
    }
    if (operation.requestBody?.description && typeof properties.body.description !== "string") {
      properties.body.description = operation.requestBody.description;
    }
  }

  const requiresConfirmation = method === "post" || method === "put" || method === "patch" || method === "delete";
  if (requiresConfirmation) {
    properties.confirm = {
      type: "boolean",
      description: `Set true to confirm this ${method.toUpperCase()} ${path} call`,
    };
  }

  const description = [operation.summary, operation.description, `${method.toUpperCase()} ${path}`]
    .filter(Boolean)
    .join(" — ");

  return {
    name: uniquifyToolName(toolNameFor(method, path, operation.operationId), usedNames),
    description,
    method,
    path,
    locations,
    parameters,
    contentType: picked.contentType,
    servers: operation.servers ?? pathItem.servers ?? document.servers,
    security: operation.security ?? document.security,
    tags: operation.tags,
    requiresConfirmation,
    inputSchema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
  };
}

export function openApiToTools(document: OpenApiDocument): OpenApiMcpTool[] {
  const usedNames = new Set<string>();
  const tools: OpenApiMcpTool[] = [];

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }
      tools.push(operationToTool(method, path, operation, pathItem, document, usedNames));
    }
  }

  return tools;
}
