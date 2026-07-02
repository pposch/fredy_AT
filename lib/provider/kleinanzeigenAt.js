/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

/**
 * Enrich a listing with its full description and (best-available) address
 * from the detail page. kleinanzeigen.at is an older, server-rendered PHP
 * site — the detail page only ever discloses postal-code+city (never the
 * exact street), same as what the search card already shows, so this mostly
 * upgrades the truncated card description into the full text.
 *
 * @param {ParsedListing} listing
 * @param {import('puppeteer-core').Browser} browser
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'kleinanzeigenAt_details' });
    if (!html) return listing;

    const $ = cheerio.load(html);

    const description = $('div[itemprop="description"]').first().text().replace(/\s+/g, ' ').trim();
    const address = $('a.showmap').first().attr('data-loc');

    return {
      ...listing,
      address: address || listing.address,
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch kleinanzeigenAt detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const image = o.image ? `https:${o.image}` : null;
  // The search card only exposes a free-text blurb like "zur Miete, 50 m², 2
  // Zimmer, Fernwärme" (no separate structured size/rooms fields), so pull the
  // numbers out with a regex.
  const details = o.details || '';
  const sizeMatch = details.match(/(\d+(?:[.,]\d+)?)\s*m/);
  const roomsMatch = details.match(/(\d+(?:[.,]\d+)?)\s*Zimmer/);

  return {
    id,
    link: o.link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: sizeMatch ? extractNumber(sizeMatch[1]) : null,
    rooms: roomsMatch ? extractNumber(roomsMatch[1]) : null,
    address: o.address || null,
    image,
    description: o.description || null,
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
  url: null,
  crawlContainer: '.srl-item-cont',
  // Confirmed against a live search: the "s" query param drives the sort
  // dropdown ("Aktualität: Absteigend" = newest first = value "vd"); it's also
  // the category's default order, but setting it explicitly guards against
  // that default ever changing.
  sortByDateParam: 's=vd',
  waitForSelector: 'body',
  puppeteerOptions: {
    puppeteerTimeout: 60_000,
    preNavigateUrl: 'https://www.kleinanzeigen.at/',
  },
  crawlFields: {
    id: 'meta[itemprop="url"]@content',
    link: 'meta[itemprop="url"]@content',
    title: 'meta[itemprop="name"]@content',
    price: 'meta[itemprop="price"]@content',
    image: 'meta[itemprop="image"]@content',
    details: 'meta[itemprop="description"]@content',
    description: 'meta[itemprop="description"]@content',
    address: '.tbl.addr .tbl-col-lt span |removeNewline |trim',
  },
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  normalize: normalize,
  filter: applyBlacklist,
  fetchDetails,
  activeTester: checkIfListingIsActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Kleinanzeigen AT',
  baseUrl: 'https://www.kleinanzeigen.at/',
  id: 'kleinanzeigenAt',
};
export { config };
