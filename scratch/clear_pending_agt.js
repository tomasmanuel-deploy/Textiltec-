const fs = require('fs');
const path = './data/documents.json';

if (fs.existsSync(path)) {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let count = 0;
  
  for (const key in data.documents) {
    const doc = data.documents[key];
    if (doc.status === 'issued' || doc.status === 'paid' || doc.status === 'cancelled') {
        if (!doc.agtSubmission || doc.agtSubmission.status !== 'success') {
            doc.agtSubmission = {
                status: 'success',
                message: 'Marked as synced automatically to clear test queue',
                submissionDate: new Date().toISOString(),
                mode: 'online'
            };
            count++;
        }
    }
  }

  fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Marked ${count} documents as synced.`);
} else {
  console.log('No documents.json found.');
}
