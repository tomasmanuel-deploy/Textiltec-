const fs = require('fs');
const path = require('path');

const documentsPath = path.resolve(__dirname, '../../../data/documents.json');
const data = JSON.parse(fs.readFileSync(documentsPath, 'utf8'));
const docs = Object.values(data.documents);

console.log(`Total documents: ${docs.length}`);

const typeCounts = {};
const statusCounts = {};
const recentDocs = [];

// Check documents created in the last hour
const now = new Date();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

docs.forEach(doc => {
  // Count by type
  typeCounts[doc.documentType] = (typeCounts[doc.documentType] || 0) + 1;
  
  // Count by status
  statusCounts[doc.status] = (statusCounts[doc.status] || 0) + 1;

  // Check recent
  const created = new Date(doc.createdAt || doc.issueDate); // Fallback if createdAt missing
  if (created > oneHourAgo) {
    recentDocs.push({
      id: doc.id,
      type: doc.documentType,
      series: doc.series,
      number: doc.sequentialNumber,
      status: doc.status,
      time: created.toISOString()
    });
  }
});

console.log('\nDocument Types:', JSON.stringify(typeCounts, null, 2));
console.log('\nDocument Statuses:', JSON.stringify(statusCounts, null, 2));
console.log(`\nDocuments created in the last hour: ${recentDocs.length}`);
if (recentDocs.length > 0) {
    console.log('Sample of recent documents:', recentDocs.slice(0, 10));
}
