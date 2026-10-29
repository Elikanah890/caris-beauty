import { describe, expect, it } from 'vitest';
import { connectionStringWithoutSslMode, resolveSslConfig } from '../src/db/ssl';

describe('resolveSslConfig', () => {
  it('requires SSL for Neon hosts', () => {
    const config = resolveSslConfig(
      'postgresql://user:pass@ep-purple-flower-b4y7tzaq.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
    );
    expect(config).toEqual({ rejectUnauthorized: false });
  });

  it('requires SSL for Render hosts without an sslmode parameter', () => {
    const config = resolveSslConfig('postgres://user:pass@dpg-abc.oregon-postgres.render.com/duka');
    expect(config).toEqual({ rejectUnauthorized: false });
  });

  it('disables SSL for local Postgres', () => {
    expect(resolveSslConfig('postgres://duka:duka@127.0.0.1:5432/duka')).toBe(false);
    expect(resolveSslConfig('postgres://duka:duka@localhost:5432/duka')).toBe(false);
  });

  it('honours sslmode=disable even on a managed host', () => {
    const config = resolveSslConfig(
      'postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=disable'
    );
    expect(config).toBe(false);
  });

  it('enables SSL when sslmode=require is set on any host', () => {
    const config = resolveSslConfig('postgres://user:pass@10.0.0.5:5432/duka?sslmode=require');
    expect(config).toEqual({ rejectUnauthorized: false });
  });

  it('falls back to a managed-host match when the URL cannot be parsed', () => {
    const config = resolveSslConfig('postgres://user:p@ss@ep-example.neon.tech/neondb');
    expect(config).toEqual({ rejectUnauthorized: false });
  });
});

describe('connectionStringWithoutSslMode', () => {
  it('removes sslmode and uselibpqcompat while keeping other parameters', () => {
    const cleaned = connectionStringWithoutSslMode(
      'postgresql://user:pass@ep-example.neon.tech/neondb?sslmode=require&uselibpqcompat=true&application_name=caris'
    );
    const url = new URL(cleaned);
    expect(url.searchParams.has('sslmode')).toBe(false);
    expect(url.searchParams.has('uselibpqcompat')).toBe(false);
    expect(url.searchParams.get('application_name')).toBe('caris');
    expect(url.hostname).toBe('ep-example.neon.tech');
  });

  it('leaves connection strings without SSL parameters unchanged', () => {
    const url = 'postgres://duka:duka@127.0.0.1:5432/duka';
    expect(connectionStringWithoutSslMode(url)).toBe(url);
  });
});
