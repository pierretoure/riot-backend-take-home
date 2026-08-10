/**
 * Recursive JSON type definitions shared across the codebase.
 *
 * These mirror the grammar of the JSON specification (RFC 8259): a value is
 * either a primitive, an object of values, or an array of values.
 */

export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonArray = JsonValue[];

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
