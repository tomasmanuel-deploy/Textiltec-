const fs = require('fs');
const path = require('path');

const docsPath = path.join(process.cwd(), 'data', 'documents.json');
const seriesPath = path.join(process.cwd(), 'data', 'series.json');

function cleanSystem() {
  if (!fs.existsSync(docsPath)) return;

  const docsData = JSON.parse(fs.readFileSync(docsPath, 'utf-8'));
  const docs = docsData.documents || {};
  const remainingDocs = {};
  let deletedCount = 0;

  // 1. Delete documents that were not successful in AGT (pending or error)
  Object.keys(docs).forEach(id => {
    const doc = docs[id];
    const isSuccess = doc.agtSubmission && doc.agtSubmission.status === 'success';
    const isDraft = doc.status === 'draft';
    
    // We keep successful docs and drafts (unless drafts were syncing)
    if (isSuccess || (isDraft && !doc.agtSubmission)) {
      remainingDocs[id] = doc;
    } else {
      deletedCount++;
    }
  });

  docsData.documents = remainingDocs;
  // Update nextId to be max id + 1
  const ids = Object.keys(remainingDocs).map(Number);
  docsData.nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

  fs.writeFileSync(docsPath, JSON.stringify(docsData, null, 2));
  console.log(`Deleted ${deletedCount} documents that were not successfully synced.`);

  // 2. Reset series counters
  if (fs.existsSync(seriesPath)) {
    const seriesData = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));
    const seriesList = seriesData.series || [];

    seriesList.forEach(s => {
      const seriesDocs = Object.values(remainingDocs).filter(d => 
        d.series === s.code && 
        new Date(d.issueDate).getFullYear() === s.year
      );
      
      const maxSeq = seriesDocs.reduce((max, d) => Math.max(max, d.sequentialNumber || 0), 0);
      s.currentNumber = maxSeq;
      console.log(`Reset series ${s.code} (${s.year}) to currentNumber: ${s.currentNumber}`);
    });

    fs.writeFileSync(seriesPath, JSON.stringify(seriesData, null, 2));
  }
}

cleanSystem();
