// Test script for RSales connection
require('dotenv').config();
const rsales = require('../lib/rsales');

async function testConnection() {
  try {
    console.log('Testing RSales API connection...');
    console.log('Base URL:', process.env.RSALES_BASE_URL);
    
    // Test 1: Get token
    console.log('\n1. Testing token generation...');
    const token = await rsales.getToken();
    console.log('✅ Token obtained successfully');
    console.log('Token prefix:', token.substring(0, 20) + '...');
    
    // Test 2: Get receivables (first page)
    console.log('\n2. Testing receivables endpoint...');
    const receivables = await rsales.getReceivables({ limit: '10' });
    console.log('✅ Receivables received');
    console.log('Total items:', receivables.meta?.totalItems);
    console.log('Items in page:', receivables.data?.length);
    
    if (receivables.data && receivables.data.length > 0) {
      console.log('\nFirst record sample:');
      const first = receivables.data[0];
      console.log('  Client:', first.client_code);
      console.log('  Document:', first.document_number);
      console.log('  Balance:', first.balance);
      console.log('  State:', first.state);
    }
    
    console.log('\n✅ All tests passed!');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
}

testConnection();