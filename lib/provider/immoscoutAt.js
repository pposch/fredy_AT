/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ImmoScout AT provider — scrapes immobilienscout24.at via Puppeteer.
 *
 * The page embeds JSON-LD structured data (schema.org CollectionPage) for most
 * listing fields (title, link, image, address, size, rooms). The price is NOT
 * included in JSON-LD and is extracted from the HTML listing cards instead.
 *
 * Strategy:
 *  1. Render the page with Puppeteer and load the HTML into Cheerio.
 *  2. Build a price map (exposeId → price string) from the HTML.
 *  3. Parse listing metadata from JSON-LD and merge in prices.
 */

import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

const PUPPETEER_OPTIONS = {
  puppeteerTimeout: 60_000,
  preNavigateUrl: 'https://www.immobilienscout24.at/',
  waitForNetworkIdle: true,
  waitForNetworkIdleTimeout: 60_000,
};

/**
 * @this {import('../FredyPipelineExecutioner.js').default}
 * @param {string} url
 * @returns {Promise<any[]>}
 */
async function getListings(url) {
  const html = await puppeteerExtractor(url, 'ol[data-testid="results-items"]', {
    browser: this._browser,
    name: 'immoscoutAt',
    ...PUPPETEER_OPTIONS,
  });

  if (!html) return [];

  const $ = cheerio.load(html);

  // Build price map: exposeId → first price string containing "€" but not "/m²"
  const priceMap = {};
  $('ol[data-testid="results-items"] > li').each((_, el) => {
    const container = $(el);
    const href = container.find('a[href^="/expose/"]').first().attr('href') ?? '';
    const exposeId = href.split('/expose/').pop();
    if (!exposeId || exposeId === href) return;

    container.find('li').each((_, li) => {
      const text = $(li).text().trim();
      if (text.includes('€') && !text.includes('/m²') && !priceMap[exposeId]) {
        priceMap[exposeId] = text;
      }
    });
  });

  // Extract listings from JSON-LD structured data
  const listings = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }

    if (data['@type'] !== 'CollectionPage') return;

    for (const listItem of data.mainEntity?.itemListElement ?? []) {
      const item = listItem.item;
      if (!item?.['@id']) continue;

      const exposeId = item['@id'].split('/expose/').pop();
      if (!exposeId || exposeId === item['@id']) continue;

      // Parse size and rooms from description: "78,5 m² · 3 Zimmer · Adresse"
      const descParts = (item.description ?? '').split(' · ');
      const sizePart = descParts.find((p) => p.includes('m²')) ?? null;
      const roomsPart = descParts.find((p) => p.includes('Zimmer')) ?? null;

      // Build address from structured postal address data
      const addr = item.mainEntity?.address;
      let address = null;
      if (addr) {
        const parts = [addr.streetAddress, [addr.postalCode, addr.addressLocality].filter(Boolean).join(' ')].filter(
          Boolean,
        );
        address = parts.join(', ') || null;
      }
      // Fallback: last · segment when address is absent from JSON-LD
      if (!address && descParts.length >= 3) {
        const last = descParts[descParts.length - 1].trim();
        if (last && !last.includes('m²') && !last.includes('Zimmer')) {
          address = last;
        }
      }

      listings.push({
        id: exposeId,
        link: item['@id'],
        title: item.name ?? '',
        price: priceMap[exposeId] ?? null,
        size: sizePart,
        rooms: roomsPart,
        address,
        image: item.image?.[0] ?? null,
        description: null,
      });
    }
  });

  return listings;
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  return {
    id,
    link: o.link,
    title: (o.title || '').replace('NEU', '').trim(),
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.address ?? null,
    image: o.image ?? null,
    description: o.description ?? null,
  };
}

/**
 * @param {ParsedListing} o
 * @returns {boolean}
 */
function applyBlacklist(o) {
  return !isOneOf(o.title, appliedBlackList) && !isOneOf(o.description, appliedBlackList);
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  sortByDateParam: 'sorting=-firstactivation',
  normalize,
  filter: applyBlacklist,
  getListings,
  activeTester: checkIfListingIsActive,
};

export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};

export const metaInformation = {
  name: 'ImmoScout AT',
  baseUrl: 'https://www.immobilienscout24.at/',
  id: 'immoscoutAt',
};

export { config };
