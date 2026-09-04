import type { OpenApiParameter, ParameterStyle } from "./types.ts";

function defaultStyle(location: OpenApiParameter["in"]): ParameterStyle {
  return location === "query" || location === "cookie" ? "form" : "simple";
}

function defaultExplode(style: ParameterStyle): boolean {
  return style === "form";
}

function flatten(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flatten(item));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [key, ...flatten(item)]);
  }
  return [String(value)];
}

export type QueryPiece = { name: string; value: string; allowReserved?: boolean };
export type QueryPieces = QueryPiece[];

export function serializeQuery(parameter: OpenApiParameter, value: unknown): QueryPieces {
  const style = parameter.style ?? defaultStyle("query");
  const explode = parameter.explode ?? defaultExplode(style);
  const allow = parameter.allowReserved === true ? { allowReserved: true } : {};
  const name = parameter.name;

  if (style === "deepObject" && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
      name: `${name}[${key}]`,
      value: String(item),
      ...allow,
    }));
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => String(item));
    if (style === "spaceDelimited") {
      return explode ? items.map((item) => ({ name, value: item, ...allow })) : [{ name, value: items.join(" ") }];
    }
    if (style === "pipeDelimited") {
      return explode ? items.map((item) => ({ name, value: item, ...allow })) : [{ name, value: items.join("|") }];
    }
    if (explode) {
      return items.map((item) => ({ name, value: item, ...allow }));
    }
    return [{ name, value: items.join(","), ...allow }];
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (explode) {
      return entries.map(([key, item]) => ({ name: key, value: String(item), ...allow }));
    }
    return [
      {
        name,
        value: entries.map(([key, item]) => `${key},${String(item)}`).join(","),
        ...allow,
      },
    ];
  }

  return [{ name, value: String(value), ...allow }];
}

export function serializePath(parameter: OpenApiParameter, value: unknown): string {
  const style = parameter.style ?? "simple";
  const explode = parameter.explode ?? false;
  const parts = flatten(value).map((part) => encodeURIComponent(part));
  const joined =
    explode && value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>)
          .map(([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
          .join(",")
      : parts.join(",");

  if (style === "label") {
    return `.${joined}`;
  }
  if (style === "matrix") {
    return `;${parameter.name}=${joined}`;
  }
  return joined;
}

export function serializeHeader(parameter: OpenApiParameter, value: unknown): string {
  return flatten(value).join(",");
}

export function serializeCookie(parameter: OpenApiParameter, value: unknown): string {
  const explode = parameter.explode ?? true;
  if (Array.isArray(value) && !explode) {
    return `${parameter.name}=${value.map(String).join(",")}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => `${parameter.name}=${String(item)}`).join("; ");
  }
  return `${parameter.name}=${String(value)}`;
}
