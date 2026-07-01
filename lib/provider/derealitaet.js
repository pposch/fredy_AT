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
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'derealitaet_details' });
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
    logger.warn(`Could not fetch derealitaet detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const link = o.link?.startsWith('http') ? o.link : `https://www.derealitaet.at${o.link}`;
  return {
    id,
    link,
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
  url: null,
  crawlContainer: '.search-result-item',
  sortByDateParam: 'sort=newest',
  waitForSelector: null,
  puppeteerOptions: {
    puppeteerTimeout: 60_000,
    preNavigateUrl: 'https://www.derealitaet.at/',
    waitForNetworkIdle: true,
    waitForNetworkIdleTimeout: 60_000,
  },
  crawlFields: {
    id: '@data-id',
    link: 'a.result-link@href',
    title: '.result-title | removeNewline | trim',
    price: '.result-price | removeNewline | trim',
    size: '.result-area | removeNewline | trim',
    rooms: '.result-rooms | removeNewline | trim',
    address: '.result-location | removeNewline | trim',
    image: '.result-image img@src',
    description: '.result-description | removeNewline | trim',
  },
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
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
  name: 'DerRealitaet',
  baseUrl: 'https://www.derealitaet.at/',
  id: 'derealitaet',
};

export { config };
