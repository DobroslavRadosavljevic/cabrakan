import type {
  HttpMethod,
  JsonSchema,
  OpenApiDocument,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiServer,
  ParameterLocation,
  SecurityScheme,
} from "./types.ts";
import { HTTP_METHODS } from "./types.ts";

type Loose = Record<string, unknown>;

function asRecord(value: unknown): Loose | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function swaggerServers(doc: Loose): OpenApiServer[] | undefined {
  const host = asString(doc.host);
  if (!host) {
    return undefined;
  }
  const basePath = asString(doc.basePath) ?? "";
  const schemes = Array.isArray(doc.schemes) && doc.schemes.length > 0 ? doc.schemes.map(String) : ["https"];
  return schemes.map((scheme) => ({ url: `${scheme}://${host}${basePath}` }));
}

function convertSecurityScheme(raw: Loose): SecurityScheme | undefined {
  const type = asString(raw.type);
  if (type === "apiKey") {
    const location = asString(raw.in);
    if (location !== "header" && location !== "query" && location !== "cookie") {
      return undefined;
    }
    const name = asString(raw.name);
    if (!name) {
      return undefined;
    }
    return { type: "apiKey", name, in: location, description: asString(raw.description) };
  }
  if (type === "basic") {
    return { type: "http", scheme: "basic", description: asString(raw.description) };
  }
  if (type === "oauth2") {
    const flow = asString(raw.flow);
    const scopes = (asRecord(raw.scopes) as Record<string, string> | undefined) ?? {};
    const flows: Extract<SecurityScheme, { type: "oauth2" }>["flows"] = {};
    if (flow === "implicit") {
      flows.implicit = { authorizationUrl: asString(raw.authorizationUrl), scopes };
    } else if (flow === "password") {
      flows.password = { tokenUrl: asString(raw.tokenUrl), scopes };
    } else if (flow === "application") {
      flows.clientCredentials = { tokenUrl: asString(raw.tokenUrl), scopes };
    } else if (flow === "accessCode") {
      flows.authorizationCode = {
        authorizationUrl: asString(raw.authorizationUrl),
        tokenUrl: asString(raw.tokenUrl),
        scopes,
      };
    }
    return { type: "oauth2", flows, description: asString(raw.description) };
  }
  return undefined;
}

function parameterSchemaFromSwagger(parameter: Loose): JsonSchema {
  if (asRecord(parameter.schema)) {
    return asRecord(parameter.schema) as JsonSchema;
  }
  const schema: JsonSchema = {};
  if (parameter.type) {
    schema.type = parameter.type;
  }
  if (parameter.format) {
    schema.format = parameter.format;
  }
  if (parameter.enum) {
    schema.enum = parameter.enum;
  }
  if (parameter.default !== undefined) {
    schema.default = parameter.default;
  }
  if (parameter.items) {
    schema.items = parameter.items;
  }
  return Object.keys(schema).length > 0 ? schema : { type: "string" };
}

function convertParameter(parameter: Loose): OpenApiParameter | undefined {
  const location = asString(parameter.in);
  const name = asString(parameter.name);
  if (!name || location === "body" || location === "formData") {
    return undefined;
  }
  if (location !== "path" && location !== "query" && location !== "header" && location !== "cookie") {
    return undefined;
  }
  return {
    name,
    in: location as ParameterLocation,
    required: Boolean(parameter.required) || location === "path",
    description: asString(parameter.description),
    schema: parameterSchemaFromSwagger(parameter),
  };
}

function convertOperation(raw: Loose, doc: Loose): OpenApiOperation {
  const parameters = Array.isArray(raw.parameters) ? raw.parameters.map(asRecord).filter(Boolean) as Loose[] : [];
  const convertedParameters = parameters.map(convertParameter).filter(Boolean) as OpenApiParameter[];
  const body = parameters.find((parameter) => asString(parameter.in) === "body");
  const form = parameters.filter((parameter) => asString(parameter.in) === "formData");
  const consumes = (Array.isArray(raw.consumes) ? raw.consumes : Array.isArray(doc.consumes) ? doc.consumes : []).map(
    String,
  );
  let requestBody: OpenApiOperation["requestBody"];
  if (body) {
    const contentType = consumes.find((type) => type.includes("json")) ?? consumes[0] ?? "application/json";
    requestBody = {
      required: Boolean(body.required),
      description: asString(body.description),
      content: {
        [contentType]: { schema: (asRecord(body.schema) as JsonSchema | undefined) ?? { type: "object" } },
      },
    };
  } else if (form.length > 0) {
    const contentType =
      consumes.find((type) => type.includes("urlencoded") || type.includes("form-data")) ??
      "application/x-www-form-urlencoded";
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const field of form) {
      const name = asString(field.name);
      if (!name) {
        continue;
      }
      properties[name] = parameterSchemaFromSwagger(field);
      if (field.required) {
        required.push(name);
      }
    }
    requestBody = {
      required: required.length > 0,
      content: {
        [contentType]: {
          schema: { type: "object", properties, ...(required.length > 0 ? { required } : {}) },
        },
      },
    };
  }

  return {
    operationId: asString(raw.operationId),
    summary: asString(raw.summary),
    description: asString(raw.description),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    parameters: convertedParameters,
    requestBody,
    security: raw.security as OpenApiOperation["security"],
  };
}

function convertPathItem(raw: Loose, doc: Loose): OpenApiPathItem {
  const item: OpenApiPathItem = {
    parameters: Array.isArray(raw.parameters)
      ? (raw.parameters.map(asRecord).filter(Boolean) as Loose[]).map(convertParameter).filter(Boolean) as OpenApiParameter[]
      : undefined,
  };
  for (const method of HTTP_METHODS) {
    const operation = asRecord(raw[method]);
    if (operation) {
      item[method as HttpMethod] = convertOperation(operation, doc);
    }
  }
  return item;
}

export function upgradeSwaggerDocument(input: unknown): OpenApiDocument {
  const doc = asRecord(input) ?? {};
  const swagger = asString(doc.swagger);
  if (!swagger) {
    return input as OpenApiDocument;
  }

  const securityDefinitions = asRecord(doc.securityDefinitions) ?? {};
  const securitySchemes: Record<string, SecurityScheme> = {};
  for (const [name, value] of Object.entries(securityDefinitions)) {
    const scheme = asRecord(value);
    if (!scheme) {
      continue;
    }
    const converted = convertSecurityScheme(scheme);
    if (converted) {
      securitySchemes[name] = converted;
    }
  }

  const paths: Record<string, OpenApiPathItem> = {};
  for (const [path, value] of Object.entries(asRecord(doc.paths) ?? {})) {
    const item = asRecord(value);
    if (item) {
      paths[path] = convertPathItem(item, doc);
    }
  }

  return {
    openapi: "3.0.3",
    info: (asRecord(doc.info) as OpenApiDocument["info"]) ?? { title: "API", version: "0.0.0" },
    servers: swaggerServers(doc),
    paths,
    security: doc.security as OpenApiDocument["security"],
    components: Object.keys(securitySchemes).length > 0 ? { securitySchemes } : undefined,
  };
}

export function isSwagger2(document: { swagger?: string; openapi?: string }): boolean {
  return Boolean(document.swagger && !document.openapi);
}
