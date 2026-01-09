/**
 * Jest test setup file
 * This runs before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test'

// Increase timeout for async operations
jest.setTimeout(10000)

// Global cleanup after all tests
afterAll(async () => {
  // Allow time for async cleanup
  await new Promise(resolve => setTimeout(resolve, 100))
})
