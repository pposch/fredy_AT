/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/kleinanzeigenAt.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';

const TEST_TIMEOUT = 120_000;

describe('#kleinanzeigenAt testsuite()', () => {
  provider.init(providerConfig.kleinanzeigenAt, []);

  let browser;
  let liveListings;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.kleinanzeigenAt.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it(
    'should test kleinanzeigenAt provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'kleinanzeigenAt',
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
          liveListings = listings;

          expect(listings).toBeInstanceOf(Array);
          const notificationObj = get();
          expect(notificationObj.serviceName).toBe('kleinanzeigenAt');

          const hasValidNotification = notificationObj.payload.some((notify) => {
            return (
              typeof notify.id === 'string' &&
              typeof notify.price === 'string' &&
              notify.price.includes('€') &&
              typeof notify.title === 'string' &&
              notify.title !== '' &&
              typeof notify.link === 'string' &&
              notify.link.includes('https://www.kleinanzeigen.at/') &&
              typeof notify.address === 'string' &&
              notify.address !== ''
            );
          });

          expect(hasValidNotification).toBe(true);
          resolve();
        });
      });
    },
    TEST_TIMEOUT,
  );

  describe('with provider_details enabled', () => {
    it(
      'should enrich a listing with details',
      async () => {
        if (!liveListings?.length) throw new Error('No listings from first test to enrich');

        const enriched = await provider.config.fetchDetails(liveListings[0], browser);

        expect(enriched).toBeTruthy();
        expect(enriched.link).toContain('https://www.kleinanzeigen.at/');
        if (enriched.description != null) {
          expect(enriched.description).toBeTypeOf('string');
        }
      },
      TEST_TIMEOUT,
    );
  });
});
