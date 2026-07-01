/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/wgGesuchtAt.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';

const TEST_TIMEOUT = 120_000;

describe('#wgGesuchtAt testsuite()', () => {
  provider.init(providerConfig.wgGesuchtAt, []);

  let browser;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.wgGesuchtAt.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it(
    'should test wgGesuchtAt provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'wgGesuchtAt',
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
          expect(notificationObj.serviceName).toBe('wgGesuchtAt');

          const hasValidNotification = notificationObj.payload.some((notify) => {
            return (
              typeof notify.id === 'string' &&
              typeof notify.price === 'string' &&
              notify.price.includes('€') &&
              typeof notify.title === 'string' &&
              notify.title !== '' &&
              typeof notify.link === 'string' &&
              notify.link.includes('https://www.wg-gesucht.de/')
            );
          });

          expect(hasValidNotification).toBe(true);
          resolve();
        });
      });
    },
    TEST_TIMEOUT,
  );
});
