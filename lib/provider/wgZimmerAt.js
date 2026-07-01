/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

/**
 * @param {ParsedListing} listing
 * @param {import('../types/browser.js').Browser} browser
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'wgZimmerAt_details' });
    if (!html) return listing;

    const $ = cheerio.load(html);
    const description = $('.detail-description').text().replace(/\s+/g, ' ').trim();
    const address = $('.detail-address').text().replace(/\s+/g, ' ').trim();

    return {
      ...listing,
      address: address || listing.address,
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch wgZimmerAt detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const link = o.link?.startsWith('http') ? o.link : `https://www.wg-zimmer.at${o.link}`;
  const id = buildHash(link, o.price);
  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.address || null,
    image: o.image || null,
    description: o.description || null,
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
  crawlContainer: '.listig-item',
  sortByDateParam: 'sort=date_desc',
  waitForSelector: '.listig-item',
  puppeteerOptions: {
    puppeteerTimeout: 60_000,
    preNavigateUrl: 'https://www.wg-zimmer.at/',
    waitForNetworkIdle: true,
    waitForNetworkIdleTimeout: 60_000,
  },
  crawlFields: {
    id: '@data-id',
    link: 'a.item-link@href',
    title: '.item-title | removeNewline | trim',
    price: '.item-price | removeNewline | trim',
    size: '.item-size | removeNewline | trim',
    rooms: '.item-rooms | removeNewline | trim',
    address: '.item-address | removeNewline | trim',
    image: 'img.item-image@src',
    description: '.item-description | removeNewline | trim',
  },
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  normalize,
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
  name: 'WG-Zimmer AT',
  baseUrl: 'https://www.wg-zimmer.at/',
  id: 'wgZimmerAt',
};

export { config };
