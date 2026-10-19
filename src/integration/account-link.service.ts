import {
  isAdjustmentLookup,
  type ContributionAdjustmentIdentity,
  type ContributionAdjustmentInput,
  type ContributionAdjustmentLookup,
} from './contribution-adjustment.contracts';
import {
  isAllocationState,
  type LinkedAllocationState,
} from './allocation.contracts';
import {
  isContributionLookup,
  type ContributionIdentity,
  type ContributionLookup,
  type ReserveContributionInput,
} from './contribution.contracts';
import {
  BadGatewayException,
  HttpException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../common/auth/entity/auth.entity';
import {
  IntegrationLinkProjection,
  IntegrationLinkRevocation,
} from './integration-link.entity';
import type { IAuthenticatedUser } from '../common/auth/interfaces/auth.interface';
import type { IntegrationPermission } from './integration.contracts';
import { IntegrationConfig } from './integration.config';
import { requireLinkToken, requireLinkId } from './link-input';
import type {
  AccountLinkState,
  LinkConsent,
  LinkRedirect,
  AccountLinkView,
  LinkedAccountIdentity,
  RevocationReceipt,
} from './link.contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPermissions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    [3, 4].includes(value.length) &&
    new Set(value).size === value.length &&
    value.every((p) =>
      [
        'allocations:read',
        'contributions:write',
        'contributions:read',
        'portfolio:read',
      ].includes(String(p)),
    ) &&
    ['allocations:read', 'contributions:write', 'contributions:read'].every(
      (p) => value.includes(p),
    )
  );
}

function isLinkView(value: unknown): value is AccountLinkView {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.cashyEmail === 'string' &&
    typeof value.growlyEmail === 'string' &&
    typeof value.linkedAt === 'string' &&
    isPermissions(value.permissions)
  );
}

function isLinkState(value: unknown): value is AccountLinkState {
  if (
    !isRecord(value) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.peerFrontendUrl !== 'string'
  )
    return false;
  if (value.status === 'not-linked') return true;
  if (!isLinkView(value.link)) return false;
  if (value.status === 'active')
    return (
      typeof value.detailsFresh === 'boolean' &&
      typeof value.accessAvailable === 'boolean'
    );
  return (
    value.status === 'revocation-pending' &&
    typeof value.requestedAt === 'string'
  );
}

@Injectable()
export class AccountLinkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountLinkService.name);
  private timer?: ReturnType<typeof setInterval>;
  private retrying = false;

  constructor(
    private readonly config: IntegrationConfig,
    @InjectModel(IntegrationLinkProjection.name)
    private readonly projections: Model<IntegrationLinkProjection>,
    @InjectModel(IntegrationLinkRevocation.name)
    private readonly revocations: Model<IntegrationLinkRevocation>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(() => {
      void this.retryPending();
    }, 60000);
    this.timer.unref();
    void this.retryPending();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async preview(token: string, user: IAuthenticatedUser): Promise<LinkConsent> {
    await this.assertNoPendingRevocation(user.userId);
    return this.peer(
      '/integration/peer/link/preview',
      {
        requestToken: requireLinkToken(token),
        growlyUserId: user.userId,
        growlyEmail: user.email,
      },
      (value): value is LinkConsent =>
        isRecord(value) &&
        typeof value.cashyEmail === 'string' &&
        typeof value.growlyEmail === 'string' &&
        value.growlyUserId === user.userId &&
        value.growlyEmail === user.email &&
        typeof value.expiresAt === 'string' &&
        Number.isFinite(Date.parse(value.expiresAt)) &&
        isPermissions(value.permissions),
    );
  }

  async approve(
    token: string,
    user: IAuthenticatedUser,
  ): Promise<LinkRedirect> {
    await this.assertNoPendingRevocation(user.userId);
    return this.peer(
      '/integration/peer/link/approve',
      {
        requestToken: requireLinkToken(token),
        growlyUserId: user.userId,
        growlyEmail: user.email,
      },
      (value): value is LinkRedirect => this.isRedirect(value),
    );
  }

  deny(token: string): Promise<LinkRedirect> {
    return this.peer(
      '/integration/peer/link/deny',
      { requestToken: requireLinkToken(token) },
      (value): value is LinkRedirect => this.isRedirect(value),
    );
  }

  async status(user: IAuthenticatedUser): Promise<AccountLinkState> {
    const pending = await this.revocations
      .findOne({ userId: user.userId, status: 'pending' })
      .lean()
      .exec();
    if (pending) return this.pendingState(pending.link, pending.requestedAt);
    if (!this.config.enabled) return this.offlineState(user.userId, false);
    try {
      const state = await this.peer(
        '/integration/peer/link/status',
        { growlyUserId: user.userId },
        isLinkState,
      );
      const afterRequest = await this.revocations
        .findOne({ userId: user.userId, status: 'pending' })
        .lean()
        .exec();
      if (afterRequest)
        return this.pendingState(afterRequest.link, afterRequest.requestedAt);
      if (state.status === 'active') {
        const blocked = await this.revocations.exists({
          linkId: state.link.id,
        });
        if (blocked) return this.offlineState(user.userId, true);
        await this.projections
          .updateOne(
            { _id: user.userId },
            {
              $set: { link: state.link, checkedAt: new Date() },
              $setOnInsert: { userId: user.userId },
            },
            { upsert: true },
          )
          .exec();
      } else {
        await this.projections.deleteOne({ userId: user.userId }).exec();
      }
      return { ...state, peerFrontendUrl: this.config.peerFrontendUrl };
    } catch (error) {
      if (
        error instanceof HttpException &&
        [502, 503, 504].includes(error.getStatus())
      ) {
        return this.offlineState(user.userId, true);
      }
      throw error;
    }
  }

  private async offlineState(
    userId: string,
    enabled: boolean,
  ): Promise<AccountLinkState> {
    const cached = await this.projections.findOne({ userId }).lean().exec();
    if (cached)
      return {
        status: 'active',
        enabled,
        peerFrontendUrl: this.config.peerFrontendUrl,
        link: cached.link,
        detailsFresh: false,
        accessAvailable: false,
      };
    if (!enabled)
      return {
        status: 'not-linked',
        enabled: false,
        peerFrontendUrl: this.config.peerFrontendUrl,
      };
    throw new ServiceUnavailableException(
      'No se pudo confirmar el estado de la conexión con Cashy.',
    );
  }

  private pendingState(
    link: AccountLinkView,
    requestedAt: Date,
  ): AccountLinkState {
    return {
      status: 'revocation-pending',
      enabled: this.config.enabled,
      peerFrontendUrl: this.config.peerFrontendUrl,
      link,
      requestedAt: requestedAt.toISOString(),
    };
  }

  async revoke(
    user: IAuthenticatedUser,
    linkId: string,
  ): Promise<AccountLinkState> {
    requireLinkId(linkId);
    const previous = await this.revocations.findOne({ linkId }).lean().exec();
    if (previous) {
      if (previous.userId !== user.userId)
        throw new ForbiddenException('La conexión no pertenece a esta cuenta.');
      if (previous.status === 'pending') {
        await this.deliverRevocation(previous);
      }
      return this.status(user);
    }
    const state = await this.status(user);
    if (state.status !== 'active' || state.link.id !== linkId) {
      throw new ConflictException(
        'La conexión cambió. Actualizá su estado antes de desvincular.',
      );
    }
    const pending = await this.revocations
      .findOneAndUpdate(
        { _id: linkId, userId: user.userId },
        {
          $setOnInsert: {
            linkId,
            link: state.link,
            status: 'pending',
            requestedAt: new Date(),
            nextAttemptAt: new Date(),
            attempts: 0,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    if (!pending)
      throw new ServiceUnavailableException(
        'No se pudo guardar la solicitud de desvinculación.',
      );
    await this.deliverRevocation(pending);
    return this.status(user);
  }

  async peerIdentity(
    userId: string,
    linkId: string,
  ): Promise<LinkedAccountIdentity> {
    requireLinkId(linkId);
    const grant = await this.peer(
      '/integration/peer/link/validate',
      { linkId, growlyUserId: userId },
      (value): value is { authorized: boolean } =>
        isRecord(value) && typeof value.authorized === 'boolean',
    );
    if (!grant.authorized) return { available: false };
    const user = await this.users.findById(userId).lean().exec();
    if (!user || user.isDisabled) return { available: false };
    const blocked = await this.revocations.exists({ linkId, userId });
    return {
      available: true,
      email: user.email,
      accessAllowed:
        user.isValidated &&
        !user.isBlocked &&
        !user.passwordChangeRequired &&
        !blocked,
    };
  }

  async authorize(
    user: Pick<IAuthenticatedUser, 'userId'>,
    linkId: string,
    permission: IntegrationPermission,
  ): Promise<AccountLinkView> {
    requireLinkId(linkId);
    if (await this.revocations.exists({ linkId, userId: user.userId })) {
      throw new ForbiddenException(
        'La conexión fue revocada o está pendiente de desvinculación.',
      );
    }
    const link = await this.peer(
      '/integration/peer/link/authorize',
      {
        growlyUserId: user.userId,
        linkId,
        permission,
      },
      isLinkView,
    );
    if (
      link.id !== linkId ||
      (await this.revocations.exists({ linkId, userId: user.userId }))
    ) {
      throw new ForbiddenException(
        'La conexión ya no autoriza esta operación.',
      );
    }
    return link;
  }

  async allocation(
    user: IAuthenticatedUser,
    period: string,
    expectedLinkId?: string,
  ): Promise<LinkedAllocationState> {
    const state = await this.status(user);
    if (!state.enabled) return { status: 'disabled' };
    if (state.status === 'not-linked') return { status: 'not-linked' };
    if (state.status === 'revocation-pending')
      return { status: 'access-paused' };
    if (expectedLinkId && state.link.id !== expectedLinkId)
      throw new ConflictException(
        'Cambió la cuenta vinculada. Volvé a preparar el aporte.',
      );
    if (!state.detailsFresh)
      throw new ServiceUnavailableException(
        'No se pudo verificar la conexión con Cashy.',
      );
    if (!state.accessAvailable) return { status: 'access-paused' };
    const result = await this.peer(
      '/integration/peer/allocation',
      {
        growlyUserId: user.userId,
        linkId: state.link.id,
        period,
      },
      isAllocationState,
    );
    if (
      await this.revocations.exists({
        linkId: state.link.id,
        userId: user.userId,
      })
    )
      throw new ForbiddenException('La conexión fue revocada.');
    const returnedPeriod =
      result.status === 'available' ? result.allocation.period : result.period;
    if (returnedPeriod !== period)
      throw new BadGatewayException('Cashy devolvió un período incompatible.');
    return result;
  }

  private async assertNoPendingRevocation(userId: string): Promise<void> {
    if (await this.revocations.exists({ userId, status: 'pending' })) {
      throw new ConflictException(
        'Esperá a que termine la desvinculación antes de conectar otra cuenta.',
      );
    }
  }

  private async deliverRevocation(
    entry: Pick<IntegrationLinkRevocation, 'linkId' | 'userId' | 'attempts'>,
  ): Promise<void> {
    try {
      await this.peer(
        '/integration/peer/link/revoke',
        { linkId: entry.linkId, growlyUserId: entry.userId },
        (value): value is RevocationReceipt =>
          isRecord(value) &&
          value.status === 'revoked' &&
          value.linkId === entry.linkId &&
          typeof value.revokedAt === 'string' &&
          Number.isFinite(Date.parse(value.revokedAt)),
      );
      await this.revocations
        .updateOne(
          { linkId: entry.linkId, userId: entry.userId, status: 'pending' },
          {
            $set: { status: 'completed', completedAt: new Date() },
          },
        )
        .exec();
      await this.projections
        .deleteOne({ userId: entry.userId, 'link.id': entry.linkId })
        .exec();
    } catch {
      const delay = Math.min(60000, 5000 * 2 ** Math.min(entry.attempts, 4));
      await this.revocations
        .updateOne(
          { linkId: entry.linkId, userId: entry.userId, status: 'pending' },
          {
            $inc: { attempts: 1 },
            $set: { nextAttemptAt: new Date(Date.now() + delay) },
          },
        )
        .exec();
    }
  }

  private async retryPending(): Promise<void> {
    if (this.retrying || !this.config.enabled) return;
    this.retrying = true;
    try {
      const entries = await this.revocations
        .find({ status: 'pending', nextAttemptAt: { $lte: new Date() } })
        .sort({ nextAttemptAt: 1 })
        .limit(20)
        .lean()
        .exec();
      for (const entry of entries) await this.deliverRevocation(entry);
    } catch {
      this.logger.warn(
        'No se pudo procesar la cola de desvinculación. Se reintentará.',
      );
    } finally {
      this.retrying = false;
    }
  }

  private isRedirect(value: unknown): value is LinkRedirect {
    if (!isRecord(value) || typeof value.redirectUrl !== 'string') return false;
    try {
      const url = new URL(value.redirectUrl);
      return (
        url.origin === new URL(this.config.peerFrontendUrl).origin &&
        url.pathname === '/integrations/callback' &&
        !url.username &&
        !url.password &&
        !url.search
      );
    } catch {
      return false;
    }
  }

  adjustmentRequest(
    action: 'adjust' | 'adjustment-status' | 'adjustment-reject',
    body: ContributionAdjustmentIdentity | ContributionAdjustmentInput,
  ): Promise<ContributionAdjustmentLookup> {
    return this.peer(
      '/integration/peer/contribution/' + action,
      body,
      isAdjustmentLookup,
    );
  }

  contributionRequest(
    action: 'reserve' | 'confirm' | 'cancel' | 'status',
    body: ContributionIdentity | ReserveContributionInput,
  ): Promise<ContributionLookup> {
    return this.peer(
      '/integration/peer/contribution/' + action,
      body,
      isContributionLookup,
    );
  }

  private async peer<T>(
    path: string,
    body: object,
    validate: (value: unknown) => value is T,
  ): Promise<T> {
    this.config.assertEnabled();
    try {
      const response = await fetch(this.config.peerApiUrl + path, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.config.outboundSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
        redirect: 'error',
      });
      const envelope: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          throw new BadGatewayException(
            'La autenticación entre aplicaciones requiere revisión.',
          );
        }
        const allowed = [400, 401, 403, 404, 409, 410, 429, 503];
        if (
          allowed.includes(response.status) &&
          isRecord(envelope) &&
          typeof envelope.message === 'string' &&
          envelope.message.length < 500
        ) {
          throw new HttpException(envelope.message, response.status);
        }
        throw new BadGatewayException('Cashy no pudo completar la solicitud.');
      }
      if (
        !isRecord(envelope) ||
        envelope.ok !== true ||
        !validate(envelope.result)
      ) {
        throw new BadGatewayException('Respuesta de integración incompatible.');
      }
      return envelope.result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'No se pudo conectar con Cashy. Reintentá cuando esté disponible.',
      );
    }
  }
}
