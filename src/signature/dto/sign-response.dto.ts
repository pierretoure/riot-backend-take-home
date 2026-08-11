/**
 * Response body of `POST /sign`: exclusively a `signature` property — no
 * echo of the input payload, no extra field.
 */
export interface SignResponseDto {
  signature: string;
}
