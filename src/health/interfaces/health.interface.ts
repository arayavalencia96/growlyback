export type HealthState = 'up' | 'down';

export interface IDatabaseHealth {
  status: HealthState;
  responseTimeMs: number;
}

export interface IHealthResponse {
  status: HealthState;
  timestamp: string;
  uptimeSeconds: number;
  database: IDatabaseHealth;
}
