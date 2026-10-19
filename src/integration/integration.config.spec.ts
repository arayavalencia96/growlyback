import { ConfigService } from '@nestjs/config';
import { IntegrationConfig } from './integration.config';

const enabledConfig = {
  INTEGRATION_ENABLED: 'true',
  INTEGRATION_PEER_API_URL: 'http://localhost:3000',
  INTEGRATION_PEER_FRONTEND_URL: 'http://localhost:4200',
  INTEGRATION_CALLBACK_URL: 'http://localhost:5173/integrations/callback',
  INTEGRATION_INBOUND_SECRET: 'i'.repeat(32),
  INTEGRATION_OUTBOUND_SECRET: 'o'.repeat(32),
  NODE_ENV: 'development',
};

describe('IntegrationConfig', () => {
  it('uses the integration timeout when it is within the valid range', () => {
    const config = new IntegrationConfig(
      new ConfigService({
        ...enabledConfig,
        INTEGRATION_REQUEST_TIMEOUT_MS: '5000',
      }),
    );

    expect(config.requestTimeoutMs).toBe(5000);
  });

  it('rejects peer request timeouts below one second', () => {
    expect(
      () =>
        new IntegrationConfig(
          new ConfigService({
            ...enabledConfig,
            INTEGRATION_REQUEST_TIMEOUT_MS: '120',
          }),
        ),
    ).toThrow('Invalid configuration: INTEGRATION_REQUEST_TIMEOUT_MS');
  });
});
