/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

describe('services/jobs/jobExecutionService', () => {
  /** @type {EventEmitter} */
  let bus;
  let calls;
  let state;

  async function initService({ providers = [], proxyUrl = '' } = {}) {
    const root = (await import('node:path')).resolve('.');
    const svcPath = root + '/lib/services/jobs/jobExecutionService.js';
    const busPath = root + '/lib/services/events/event-bus.js';
    const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
    const userStoragePath = root + '/lib/services/storage/userStorage.js';
    const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';
    const brokerPath = root + '/lib/services/sse/sse-broker.js';
    const utilsPath = root + '/lib/utils.js';
    const loggerPath = root + '/lib/services/logger.js';
    const notifyPath = root + '/lib/notification/notify.js';
    const pipelinePath = root + '/lib/FredyPipelineExecutioner.js';
    const puppeteerExtractorPath = root + '/lib/services/extractor/puppeteerExtractor.js';
    const similarityCachePath = root + '/lib/services/similarity-check/similarityCache.js';

    vi.resetModules();
    vi.doMock(busPath, () => ({ bus }));
    vi.doMock(jobStoragePath, () => ({
      getJob: (id) => state.jobsById[id] || null,
      getJobs: () => state.jobsList.slice(),
      updateJobLastRunAt: (id, timestamp) => calls.lastRunUpdates.push({ id, timestamp }),
    }));
    vi.doMock(userStoragePath, () => ({
      getUsers: () => state.users.slice(),
      getUser: (id) => state.users.find((u) => u.id === id) || null,
    }));
    vi.doMock(settingsStoragePath, () => ({
      getSettings: async () => ({ proxyUrl }),
    }));
    vi.doMock(brokerPath, () => ({
      sendToUsers: (...args) => calls.sent.push(args),
    }));
    vi.doMock(utilsPath, () => ({
      duringWorkingHoursOrNotSet: () => false,
      getPackageVersion: async () => '0.0.0-test',
    }));
    vi.doMock(loggerPath, () => {
      const m = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
      return { default: m };
    });
    vi.doMock(notifyPath, () => ({ send: async () => [] }));
    vi.doMock(similarityCachePath, () => ({ checkAndAddEntry: () => false }));
    vi.doMock(pipelinePath, () => ({
      default: class FakeFredyPipelineExecutioner {
        constructor(providerConfig, job, providerId, similarityCache, browser) {
          calls.pipelineRuns.push({ providerId, browser });
        }
        execute() {
          return Promise.resolve();
        }
      },
    }));
    vi.doMock(puppeteerExtractorPath, () => ({
      launchBrowser: (...args) => {
        calls.launchBrowser.push(args);
        return Promise.resolve({ connected: true, browserId: args[1] });
      },
      closeBrowser: () => Promise.resolve(),
    }));
    vi.doMock(root + '/lib/services/jobs/run-state.js', () => ({
      isRunning: () => false,
      markRunning: (id) => {
        calls.markRunning.push(id);
        return true;
      },
      markFinished: () => {},
    }));

    const mod = await import(svcPath);
    mod.initJobExecutionService({ providers, settings: { demoMode: false }, intervalMs: 0 });
    return mod;
  }

  beforeEach(() => {
    bus = new EventEmitter();
    calls = { sent: [], markRunning: [], lastRunUpdates: [], launchBrowser: [], pipelineRuns: [] };
    state = {
      jobsById: {},
      jobsList: [],
      users: [],
    };
  });

  it('forwards SSE jobStatus to owner, shared users and admins', async () => {
    state.jobsById['j1'] = { id: 'j1', userId: 'owner1', shared_with_user: ['u2'] };
    state.users = [
      { id: 'a1', isAdmin: true },
      { id: 'owner1', isAdmin: false },
      { id: 'u2', isAdmin: false },
    ];

    await initService();

    bus.emit('jobs:status', { jobId: 'j1', running: true });

    expect(calls.sent.length, 'sendToUsers should be called once').toBe(1);
    const [recipients, event, data] = calls.sent[0];
    expect(event).toBe('jobStatus');
    expect(data).toEqual({ jobId: 'j1', running: true });
    const got = new Set(recipients);
    const expected = new Set(['owner1', 'u2', 'a1']);
    expect(got).toEqual(expected);
  });

  it('runs all jobs for admin; only own jobs for regular user', async () => {
    state.jobsList = [
      { id: 'j1', enabled: true, userId: 'u1', provider: [] },
      { id: 'j2', enabled: true, userId: 'u2', provider: [] },
    ];
    state.users = [
      { id: 'u1', isAdmin: false },
      { id: 'u2', isAdmin: false },
      { id: 'admin', isAdmin: true },
    ];

    await initService();

    // Non-admin: only own jobs
    bus.emit('jobs:runAll', { userId: 'u1' });
    // allow microtasks to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(new Set(calls.markRunning)).toEqual(new Set(['j1']));

    // Admin: all jobs
    calls.markRunning = [];
    bus.emit('jobs:runAll', { userId: 'admin' });
    await new Promise((r) => setTimeout(r, 0));
    expect(new Set(calls.markRunning)).toEqual(new Set(['j1', 'j2']));
  });

  it('persists last_run_at when a job is executed', async () => {
    state.jobsById['j1'] = { id: 'j1', enabled: true, userId: 'u1', provider: [] };
    state.jobsList = [state.jobsById['j1']];
    state.users = [{ id: 'u1', isAdmin: false }];

    await initService();

    const before = Date.now();
    bus.emit('jobs:runOne', { jobId: 'j1' });
    await new Promise((r) => setTimeout(r, 0));
    const after = Date.now();

    expect(calls.lastRunUpdates.length).toBe(1);
    const [update] = calls.lastRunUpdates;
    expect(update.id).toBe('j1');
    expect(update.timestamp).toBeGreaterThanOrEqual(before);
    expect(update.timestamp).toBeLessThanOrEqual(after);
  });

  it('launches a proxied browser for a provider with a custom getListings that opts in via usesPuppeteer', async () => {
    const provider = {
      metaInformation: { id: 'immoscoutAt' },
      config: { url: 'https://example.at', getListings: async () => [], usesPuppeteer: true },
      init: () => {},
    };
    state.jobsById['j1'] = {
      id: 'j1',
      enabled: true,
      userId: 'u1',
      provider: [{ id: 'immoscoutAt' }],
    };
    state.jobsList = [state.jobsById['j1']];
    state.users = [{ id: 'u1', isAdmin: false }];

    await initService({ providers: [provider], proxyUrl: 'http://user:pass@host:1234' });

    bus.emit('jobs:runOne', { jobId: 'j1' });
    await new Promise((r) => setTimeout(r, 0));

    expect(calls.launchBrowser.length).toBe(1);
    const [, options] = calls.launchBrowser[0];
    expect(options).toEqual({ proxyUrl: 'http://user:pass@host:1234' });
    expect(calls.pipelineRuns.length).toBe(1);
    expect(calls.pipelineRuns[0].providerId).toBe('immoscoutAt');
    expect(calls.pipelineRuns[0].browser).toBeTruthy();
  });

  it('does not launch a browser for a provider using the plain fetch/API flow', async () => {
    const provider = {
      metaInformation: { id: 'willhaben' },
      config: { url: 'https://example.at', getListings: async () => [] },
      init: () => {},
    };
    state.jobsById['j1'] = {
      id: 'j1',
      enabled: true,
      userId: 'u1',
      provider: [{ id: 'willhaben' }],
    };
    state.jobsList = [state.jobsById['j1']];
    state.users = [{ id: 'u1', isAdmin: false }];

    await initService({ providers: [provider], proxyUrl: 'http://user:pass@host:1234' });

    bus.emit('jobs:runOne', { jobId: 'j1' });
    await new Promise((r) => setTimeout(r, 0));

    expect(calls.launchBrowser.length).toBe(0);
    expect(calls.pipelineRuns.length).toBe(1);
    expect(calls.pipelineRuns[0].browser).toBeFalsy();
  });
});
