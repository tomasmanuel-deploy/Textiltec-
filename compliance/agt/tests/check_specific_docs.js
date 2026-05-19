const fs = require('fs');
const path = require('path');

const documentsPath = path.resolve(__dirname, '../../../data/documents.json');
const data = JSON.parse(fs.readFileSync(documentsPath, 'utf8'));

const doc296 = data.documents['296'];
const doc324 = data.documents['324'];
const docLast = Object.values(data.documents).sort((a,b) => parseInt(b.id) - parseInt(a.id))[0];

console.log('--- Document 296 (Expected Credit Note for 158) ---');
if (doc296) {
    console.log(`Type: ${doc296.documentType}`);
    console.log(`Series/Num: ${doc296.series}/${doc296.sequentialNumber}`);
    console.log(`Status: ${doc296.status}`);
    console.log(`Total: ${doc296.totals.total}`);
    console.log(`Related: ${JSON.stringify(doc296.relatedDocuments)}`);
} else {
    console.log('Not found');
}

console.log('\n--- Document 324 (Last Invoice mentioned by user?) ---');
if (doc324) {
    console.log(`Type: ${doc324.documentType}`);
    console.log(`Series/Num: ${doc324.series}/${doc324.sequentialNumber}`);
    console.log(`Status: ${doc324.status}`);
    console.log(`Total: ${doc324.totals.total}`);
    console.log(`Related: ${JSON.stringify(doc324.relatedDocuments)}`);
    console.log(`Cancellation: ${JSON.stringify(doc324.cancellation)}`);
} else {
    console.log('Not found');
}

console.log(`\n--- Very Last Document in System (ID: ${docLast.id}) ---`);
console.log(`Type: ${docLast.documentType}`);
console.log(`Series/Num: ${docLast.series}/${docLast.sequentialNumber}`);
