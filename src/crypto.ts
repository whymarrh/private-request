/**
 * Represents the hash algorithms available for use with Subresource Integrity
 *
 * See [Subresource Integrity §3.2]{@link https://w3c.github.io/webappsec-subresource-integrity/#hash-functions}
 *
 * These are the minimal algorithms a user agent must support:
 * > Conformant user agents MUST support the SHA-256, SHA-384, and SHA-512 cryptographic hash functions for
 * > use as part of a request’s integrity metadata and MAY support additional hash functions.
 */
export type IntegrityHashAlgo = 'sha256' | 'sha384' | 'sha512';

/**
 * Represents data for a hash function
 */
export type DigestData = Parameters<typeof window.crypto.subtle.digest>[1];

/**
 * Represents a hash function
 */
export type HashFunction = (data: DigestData) => Promise<ArrayBuffer>;

/**
 * Represents a set of hash functions for use with Subresource Integrity
 */
export type IntegrityHashFunctions = Record<IntegrityHashAlgo, HashFunction>;

/**
 * Represents an optional set of hash functions for use with Subresource Integrity
 */
export type HashFunctionOptions = Partial<IntegrityHashFunctions>;
