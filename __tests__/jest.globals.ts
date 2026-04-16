// jest-setup.ts
// Ensures Jest globals are available for TypeScript
declare global {
  // @ts-ignore - these are available at runtime via Jest
  var jest: any;
  var describe: any;
  var it: any;
  var test: any;
  var expect: any;
  var beforeEach: any;
  var beforeAll: any;
  var afterEach: any;
  var afterAll: any;
}

export {};
