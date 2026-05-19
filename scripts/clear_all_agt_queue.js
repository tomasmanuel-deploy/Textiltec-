const fs = require('fs');
const path = require('path');

const dataPath = path.join(process.cwd(), 'data', 'documents.json');

function clearAllAgtQueue() {
  if (!fs.existsSync(dataPath)) {
    console.log('No documents.json found.');
    return;
  }

  const raw = fs.readFileSync(dataPath, 'utf-8');
  if (!raw) return;

  const data = JSON.parse(raw);
  const docs = data.documents || {};
  let clearedCount = 0;

  Object.keys(docs).forEach(id => {
    const doc = docs[id];
    // Remove AGT status for ANY document that isn't already "success"
    if (doc.agtSubmission && doc.agtSubmission.status !== 'success') {
      delete doc.agtSubmission;
      clearedCount++;
    }
  });

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`Successfully cleared AGT sending queue for ${clearedCount} documents.`);
}

clearAllAgtQueue();
