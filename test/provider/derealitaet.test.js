/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/derealitaet.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';

const TEST_TIMEOUT = 120_000;

describe('#derealitaet testsuite()', () => {
  provider.init(providerConfig.derealitaet, []);

  let browser;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.derealitaet.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it(
    'should test derealitaet provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'derealitaet',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };

      return await new Promise((resolve, reject) => {
        const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, browser);

        fredy.execute().then((listings) => {
          if (listings == null || listings.length === 0) {
            reject('Listings is empty!');
            return;
          }

          expect(listings).toBeInstanceOf(Array);
          const notificationObj = get();
          expect(notificationObj.serviceName).toBe('derealitaet');
          notificationObj.payload.forEach((notify) => {
            expect(notify).toBeTypeOf('object');
            expect(notify.id).toBeTypeOf('string');
            expect(notify.title).toBeTypeOf('string');
            expect(notify.title).not.toBe('');
            expect(notify.price).toBeTypeOf('string');
            expect(notify.price).toContain('€');
            expect(notify.link).toBeTypeOf('string');
            expect(notify.link).toContain('https://www.derealitaet.at/');
          });
          resolve();
        });
      });
    },
    TEST_TIMEOUT,
  );
});
