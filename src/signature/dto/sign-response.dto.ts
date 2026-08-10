/**
 * Response body of `POST /sign` (cahier des charges §4.3): exclusively a
 * `signature` property — no echo of the input payload, no extra field.
 */
export interface SignResponseDto {
  signature: string;
}
