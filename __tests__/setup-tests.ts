/**
 * setup-tests.ts
 * Jest test setup configuration
 * Ensures all Jest globals are properly initialized
 */

// Make jest globals available
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "@jest/globals";

// Re-export for global usage
declare global {
  // eslint-disable-next-line no-var
  var describe: typeof describe;
  // eslint-disable-next-line no-var
  var it: typeof it;
  // eslint-disable-next-line no-var
  var expect: typeof expect;
  // eslint-disable-next-line no-var
  var beforeEach: typeof beforeEach;
  // eslint-disable-next-line no-var
  var afterEach: typeof afterEach;
  // eslint-disable-next-line no-var
  var beforeAll: typeof beforeAll;
  // eslint-disable-next-line no-var
  var afterAll: typeof afterAll;
}

Object.assign(global, {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
});
