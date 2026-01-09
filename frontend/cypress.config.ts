import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL?.replace(/:\\d+$/, ':3000').replace(/\/$/, '') || 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    video: false,
    defaultCommandTimeout: 10000,
  },
})

