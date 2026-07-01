/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Hoist the mock so it is available in the vi.mock factory below.
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

// Replace node-fetch with our controllable mock for the entire file.
vi.mock('node-fetch', () => ({ default: fetchMock }));

// ---------------------------------------------------------------------------
// distanceMeters — pure Haversine, no network calls needed
// ---------------------------------------------------------------------------
describe('DACH geocoding — Austrian address support', () => {
  describe('distanceMeters — Vienna coordinates', () => {
    it('calculates distance between Mariahilfer Straße and Stephansplatz within expected bounds', async () => {
      const { distanceMeters } = await import('../../../lib/services/listings/distanceCalculator.js');

      // Mariahilfer Straße 1, 1060 Wien ≈ 48.1989°N 16.3563°E
      // Stephansplatz 1, 1010 Wien    ≈ 48.2085°N 16.3727°E
      // Real walking distance ≈ 1.7 km; straight-line ≈ 1.5 km
      const dist = distanceMeters(48.1989, 16.3563, 48.2085, 16.3727);

      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThan(50_000); // well under 50 km
    });

    it('returns 0 for identical Vienna coordinates', async () => {
      const { distanceMeters } = await import('../../../lib/services/listings/distanceCalculator.js');

      expect(distanceMeters(48.2085, 16.3727, 48.2085, 16.3727)).toBe(0);
    });

    it('distance between Vienna home and Vienna listing is a reasonable commute', async () => {
      const { distanceMeters } = await import('../../../lib/services/listings/distanceCalculator.js');

      // Home: Mariahilfer Str 1 (1060 Wien); Listing: Prater (1020 Wien)
      const homeLatLng = { lat: 48.1989, lng: 16.3563 };
      const listingLatLng = { lat: 48.2157, lng: 16.3969 };

      const dist = distanceMeters(homeLatLng.lat, homeLatLng.lng, listingLatLng.lat, listingLatLng.lng);

      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThan(50_000); // both in Vienna — must be under 50 km
    });
  });

  // ---------------------------------------------------------------------------
  // nominatimClient — verifies URL construction and response parsing
  //
  // Each test calls vi.resetModules() so it gets a fresh nominatimClient with
  // a clean pThrottle instance (avoids 1-second inter-test delay from throttle
  // state carryover).
  // ---------------------------------------------------------------------------
  describe('nominatimClient — DACH country codes', () => {
    beforeEach(() => {
      vi.resetModules();
      fetchMock.mockReset();
    });

    it('includes countrycodes=de,at,ch in the geocode request URL', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ lat: '48.1989', lon: '16.3563' }],
      });

      const { geocode } = await import('../../../lib/services/geocoding/client/nominatimClient.js');
      await geocode('Mariahilfer Straße 1, 1060 Wien');

      expect(fetchMock).toHaveBeenCalledOnce();
      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('countrycodes=de,at,ch');
    });

    it('returns valid Austrian coordinates — not null and not {lat:-1, lng:-1}', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ lat: '48.1989', lon: '16.3563' }],
      });

      const { geocode } = await import('../../../lib/services/geocoding/client/nominatimClient.js');
      const coords = await geocode('Mariahilfer Straße 1, 1060 Wien');

      expect(coords).not.toBeNull();
      expect(coords).not.toEqual({ lat: -1, lng: -1 });
      // Austria is roughly 46–49°N, 9–17°E
      expect(coords.lat).toBeGreaterThan(46);
      expect(coords.lat).toBeLessThan(50);
      expect(coords.lng).toBeGreaterThan(9);
      expect(coords.lng).toBeLessThan(18);
    });

    it('returns coordinates as numbers, not strings', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ lat: '48.1989', lon: '16.3563' }],
      });

      const { geocode } = await import('../../../lib/services/geocoding/client/nominatimClient.js');
      const coords = await geocode('Mariahilfer Straße 1, 1060 Wien');

      expect(typeof coords.lat).toBe('number');
      expect(typeof coords.lng).toBe('number');
    });

    it('includes countrycodes=de,at,ch in the autocomplete request URL', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ display_name: 'Mariahilfer Straße 1, Wien, Österreich' }],
      });

      const { autocomplete } = await import('../../../lib/services/geocoding/client/nominatimClient.js');
      await autocomplete('Mariahilfer Straße, Wien');

      expect(fetchMock).toHaveBeenCalledOnce();
      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('countrycodes=de,at,ch');
    });

    it('returns display_name strings from autocomplete for Austrian addresses', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { display_name: 'Mariahilfer Straße 1, Wien, Österreich' },
          { display_name: 'Mariahilfer Straße 12, Wien, Österreich' },
        ],
      });

      const { autocomplete } = await import('../../../lib/services/geocoding/client/nominatimClient.js');
      const results = await autocomplete('Mariahilfer Straße, Wien');

      expect(results).toEqual(['Mariahilfer Straße 1, Wien, Österreich', 'Mariahilfer Straße 12, Wien, Österreich']);
    });
  });
});
