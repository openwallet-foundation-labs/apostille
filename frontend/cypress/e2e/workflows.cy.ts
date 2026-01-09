describe('Workflows dashboard smoke', () => {
  it('loads workflows page', () => {
    cy.visit('/workflows')
    cy.contains('Viewer Profile').should('exist')
  })
})

