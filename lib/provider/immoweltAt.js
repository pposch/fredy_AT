/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

/**
 * Enrich a listing with its full description and address from the detail page.
 *
 * Unlike immowelt.de, the immowelt.at expose page does not embed a
 * `__NEXT_DATA__` JSON blob (it renders through a different "CDP"
 * micro-frontend), so the fields are read straight from the rendered DOM via
 * the `cdp-*` testids instead. `cdp-location-address` and the description
 * testids each appear twice in the markup (a mobile and a desktop variant
 * with identical text) — `.first()` avoids duplicating the text.
 *
 * @param {ParsedListing} listing
 * @param {import('puppeteer-core').Browser} browser
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'immoweltAt_details' });
    if (!html) return listing;

    const $ = cheerio.load(html);

    const addressText = $('[data-testid="cdp-location-address"]').first().text().trim();
    const address = addressText || listing.address;

    const sections = [
      {
        title: $('[data-testid="cdp-main-description-title"]').first().text().trim(),
        content: $('[data-testid="cdp-main-description-expandable-text"]').first().text().trim(),
      },
      {
        title: $('[data-testid="cdp-additional-description-title"]').first().text().trim(),
        content: $('[data-testid="cdp-additional-description-expandable-text"]').first().text().trim(),
      },
    ];
    const description = sections
      .map((s) => [s.title, s.content].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n\n');

    return {
      ...listing,
      address,
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch immoweltAt detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
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
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.address,
    image: o.image,
    description: o.description,
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

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer:
    'div[data-testid="serp-core-scrollablelistview-testid"]:not(div[data-testid="serp-enlargementlist-testid"] div[data-testid="serp-card-testid"]) div[data-testid="serp-core-classified-card-testid"]',
  // Confirmed against a live search: order=DateDesc changes both the "Sortieren
  // nach" label (to "Aktuellste Angebote") and the result order, same as immowelt.de.
  sortByDateParam: 'order=DateDesc',
  // waitForSelector is null: extract the full page via page.content() so the
  // Cheerio crawler can search anywhere in the rendered document.
  // preNavigateUrl visits the homepage first to establish a trusted session
  // before hitting the search URL; this prevents CDN-level bot challenges that
  // fire on cold sessions. waitForNetworkIdle (phase 2) then catches React's
  // listing API round-trip that fires well after domcontentloaded.
  waitForSelector: null,
  puppeteerOptions: {
    puppeteerTimeout: 60_000,
    preNavigateUrl: 'https://www.immowelt.at/',
    waitForNetworkIdle: true,
    waitForNetworkIdleTimeout: 60_000,
  },
  crawlFields: {
    id: 'a@href',
    price: 'div[data-testid="cardmfe-price-testid"] | removeNewline | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] div:nth-of-type(3) | removeNewline | trim',
    rooms: 'div[data-testid="cardmfe-keyfacts-testid"] div:nth-of-type(1) | removeNewline | trim',
    title: 'div[data-testid="cardmfe-description-box-text-test-id"] > div:nth-of-type(2)',
    link: 'a@href',
    description: 'div[data-testid="cardmfe-description-text-test-id"] > div:nth-of-type(2) | removeNewline | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
    image: 'div[data-testid="cardmfe-picture-box-opacity-layer-test-id"] img@src',
  },
  normalize: normalize,
  filter: applyBlacklist,
  fetchDetails: fetchDetails,
  activeTester: checkIfListingIsActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immowelt AT',
  baseUrl: 'https://www.immowelt.at/',
  id: 'immoweltAt',
};
export { config };
