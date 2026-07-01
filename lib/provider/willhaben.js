/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

/**
 * Converts the flat attribute array from the API response into a key→value map.
 * @param {{ name: string, values: string[] }[]} attributes
 * @returns {Record<string, string|null>}
 */
function buildAttrMap(attributes) {
  const map = {};
  for (const attr of attributes ?? []) {
    map[attr.name] = attr.values?.[0] ?? null;
  }
  return map;
}

/**
 * @param {any} rawListing
 * @returns {ParsedListing}
 */
function normalize(rawListing) {
  const attrs = buildAttrMap(rawListing.attributes?.attribute);
  const price = attrs.PRICE;
  const id = buildHash(rawListing.id, price);
  const seoUrl = attrs.SEO_URL ?? '';
  const link = `https://www.willhaben.at/${seoUrl}`;
  const size = attrs['ESTATE_SIZE/LIVING_AREA'] ?? attrs.ESTATE_SIZE ?? null;
  const imageRaw = attrs.ALL_IMAGE_URLS ?? '';
  const imageRelative = imageRaw ? imageRaw.split(';')[0] : null;
  const image = imageRelative
    ? `https://cache.willhaben.at/mmo/${imageRelative.replace(/\.jpg$/, '_hoved.jpg')}`
    : null;

  return {
    id,
    link,
    title: attrs.HEADING ?? '',
    price: extractNumber(price),
    size: extractNumber(size),
    rooms: extractNumber(attrs.NUMBER_OF_ROOMS),
    address: attrs.LOCATION ?? null,
    image,
    description: attrs.BODY_DYN ?? null,
  };
}

/**
 * @param {ParsedListing} o
 * @returns {boolean}
 */
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

/**
 * Fetches listings from the willhaben search page by parsing the embedded
 * __NEXT_DATA__ JSON blob (willhaben is a Next.js SSR app; there is no
 * separate public JSON API).
 * @param {string} url The search page URL with query parameters.
 * @returns {Promise<any[]>}
 */
async function getListings(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    logger.error('Error fetching Willhaben page:', response.statusText);
    return [];
  }

  const html = await response.text();
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    logger.error('Could not find __NEXT_DATA__ on willhaben page');
    return [];
  }

  try {
    const data = JSON.parse(match[1]);
    return data?.props?.pageProps?.searchResult?.advertSummaryList?.advertSummary ?? [];
  } catch (err) {
    logger.error('Failed to parse willhaben __NEXT_DATA__:', err.message);
    return [];
  }
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  sortByDateParam: 'sort=1',
  normalize: normalize,
  filter: applyBlacklist,
  getListings: getListings,
  activeTester: checkIfListingIsActive,
};

export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};

export const metaInformation = {
  name: 'Willhaben',
  baseUrl: 'https://www.willhaben.at/',
  id: 'willhaben',
};

export { config };
