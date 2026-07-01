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
 * Transforms any willhaben search result URL into the JSON API endpoint URL,
 * preserving all query parameters.
 * @param {string} url
 * @returns {string}
 */
function toApiUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.pathname = '/iad/searchad/v1/ads/search';
    return parsed.toString();
  } catch {
    return url;
  }
}

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
  const link = `https://www.willhaben.at/iad/${seoUrl}`;
  const size = attrs.ESTATE_SIZE_LIVING_AREA ?? attrs.ESTATE_SIZE ?? attrs.AREA ?? null;
  const imageRaw = attrs.ALL_IMAGE_URLS ?? '';
  const image = imageRaw ? imageRaw.split(';')[0] : null;

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
 * Fetches listings from the willhaben JSON search API.
 * @param {string} url The API URL with query parameters.
 * @returns {Promise<any[]>}
 */
async function getListings(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; Fredy/1.0)',
    },
  });

  if (!response.ok) {
    logger.error('Error fetching data from Willhaben API:', response.statusText);
    return [];
  }

  const body = await response.json();
  return body?.advertSummaryList?.advertSummary ?? [];
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
  config.url = toApiUrl(sourceConfig.url);
  appliedBlackList = blacklist || [];
};

export const metaInformation = {
  name: 'Willhaben',
  baseUrl: 'https://www.willhaben.at/',
  id: 'willhaben',
};

export { config };
