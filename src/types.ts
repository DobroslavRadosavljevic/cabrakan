export const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type JsonSchema = Record<string, unknown>;
export type ParameterLocation = "path" | "query" | "header" | "cookie";
export type ParameterStyle =
  | "simple"
  | "form"
  | "label"
  | "matrix"
  | "spaceDelimited"
  | "pipeDelimited"
  | "deepObject";

export type OpenApiParameter = {
  name: string;
  in: ParameterLocation;
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
  style?: ParameterStyle;
  explode?: boolean;
  allowReserved?: boolean;
};

export type SecurityRequirement = Record<string, string[]>;

export type OpenApiServer = {
  url: string;
  description?: string;
  variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
};

export type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<string, { schema?: JsonSchema }>;
  };
  servers?: OpenApiServer[];
  security?: SecurityRequirement[];
};

export type OpenApiPathItem = {
  parameters?: OpenApiParameter[];
  servers?: OpenApiServer[];
} & Partial<Record<HttpMethod, OpenApiOperation>>;

export type SecurityScheme =
  | { type: "apiKey"; name: string; in: "header" | "query" | "cookie"; description?: string }
  | { type: "http"; scheme: string; bearerFormat?: string; description?: string }
  | {
      type: "oauth2";
      flows: {
        implicit?: { authorizationUrl?: string; scopes?: Record<string, string> };
        password?: { tokenUrl?: string; scopes?: Record<string, string> };
        clientCredentials?: { tokenUrl?: string; scopes?: Record<string, string> };
        authorizationCode?: { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> };
      };
      description?: string;
    }
  | { type: "openIdConnect"; openIdConnectUrl: string; description?: string }
  | { type: "mutualTLS"; description?: string };

export type OpenApiDocument = {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string; description?: string };
  servers?: OpenApiServer[];
  paths?: Record<string, OpenApiPathItem>;
  security?: SecurityRequirement[];
  components?: { securitySchemes?: Record<string, SecurityScheme> };
};

export type ToolLocation = ParameterLocation | "body";

export type OpenApiMcpTool = {
  name: string;
  description: string;
  method: HttpMethod;
  path: string;
  inputSchema: JsonSchema;
  locations: Record<string, ToolLocation>;
  parameters: OpenApiParameter[];
  contentType?: string;
  servers?: OpenApiServer[];
  security: SecurityRequirement[] | undefined;
  tags?: string[];
  requiresConfirmation?: boolean;
};

export type SchemeCredential = {
  value?: string;
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
};

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type AuthOptions = {
  bearer?: string;
  apiKey?: string;
  basic?: string | { username: string; password: string };
  schemes?: Record<string, SchemeCredential>;
};
