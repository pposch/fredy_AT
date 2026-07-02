/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/willhaben.js';

describe('#willhaben provider testsuite()', () => {
  provider.init(providerConfig.willhaben, []);

  it('should test willhaben provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'willhaben',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };

    return await new Promise((resolve, reject) => {
      const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, undefined);
      fredy.execute().then((listings) => {
        if (listings == null || listings.length === 0) {
          reject('Listings is empty!');
          return;
        }

        expect(listings).toBeInstanceOf(Array);
        const notificationObj = get();
        expect(notificationObj).toBeTypeOf('object');

        const hasValidNotification = notificationObj.payload.some((notify) => {
          return (
            typeof notify.id === 'string' &&
            typeof notify.price === 'string' &&
            notify.price.includes('€') &&
            typeof notify.size === 'string' &&
            notify.size.includes('m²') &&
            typeof notify.title === 'string' &&
            notify.title !== '' &&
            typeof notify.link === 'string' &&
            // the "iad" segment is required or the ad detail page 404s (verified live)
            notify.link.startsWith('https://www.willhaben.at/iad/') &&
            typeof notify.address === 'string'
          );
        });

        expect(hasValidNotification).toBe(true);
        resolve();
      });
    });
  });
});
