import { Schema } from "effect";

export class SpecError extends Schema.TaggedError<SpecError>()("SpecError", {
  message: Schema.String,
}) {}

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  message: Schema.String,
}) {}

export class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
  message: Schema.String,
  status: Schema.optional(Schema.Number),
  retryable: Schema.optional(Schema.Boolean),
}) {}

export class RequestBuildError extends Schema.TaggedError<RequestBuildError>()("RequestBuildError", {
  message: Schema.String,
}) {}
