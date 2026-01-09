// Quick script to see what a DID document looks like
const agent = require('./dist/services/agentService');

async function testKeys() {
  try {
    const testAgent = await agent.getAgent({ tenantId: '42cf5bac-fb34-4107-95a1-341caf66dc88' });
    const dids = await testAgent.dids.getCreatedDids();
    
    console.log('Number of DIDs:', dids.length);
    
    if (dids.length > 0) {
      const did = dids[0];
      console.log('\nDID:', did.did);
      console.log('\nDID Document:', JSON.stringify(did.didDocument, null, 2));
      
      if (did.didDocument?.verificationMethod) {
        console.log('\nVerification Methods:');
        did.didDocument.verificationMethod.forEach((vm, idx) => {
          console.log(`\n[${idx}]:`, JSON.stringify(vm, null, 2));
        });
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

testKeys();
