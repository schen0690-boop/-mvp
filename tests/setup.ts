import {localFetch} from './helpers/local-fetch.js';
globalThis.fetch=localFetch(globalThis.fetch);
