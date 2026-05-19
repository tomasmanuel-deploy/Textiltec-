const axios = require('axios');

const BASE = 'http://localhost:3000';
const DOC_ID = '329'; // The ID from the previous run

async function run() {
  try {
    console.log(`Testing manual AGT submission for document ${DOC_ID}...`);
    const res = await axios.post(`${BASE}/api/documents/${DOC_ID}/submit-agt`);
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(res.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response?.status, error.response?.data || error.message);
  }
}

run();
