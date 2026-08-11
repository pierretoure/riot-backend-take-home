import { createHash } from 'node:crypto';
import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limits per client rather than per route.
 *
 * The stock `generateKey` folds the controller and handler names into the
 * storage key, so every endpoint gets its own independent counter: a client
 * can spend the whole limit on `/encrypt`, then the whole limit again on
 * `/sign`, and so on. What we want to bound is the load a single client puts
 * on the application as a whole, so the key is derived from the tracker (the
 * client IP) and the named throttler alone — every guarded route then draws
 * from one shared budget.
 *
 * The tracker is hashed, exactly as the base implementation does, so client
 * IP addresses are never held verbatim in the throttler store.
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected override generateKey(
    _context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    return createHash('sha256').update(`${name}-${suffix}`).digest('hex');
  }
}
