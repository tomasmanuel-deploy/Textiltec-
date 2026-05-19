const fs = require('fs');
const path = require('path');

const documentsPath = path.join(process.cwd(), 'data', 'documents.json');
const data = JSON.parse(fs.readFileSync(documentsPath, 'utf8'));
const docs = Object.values(data.documents);

console.log(`Total documents: ${docs.length}`);

let ftCount = 0;
let rcCount = 0;
let shortHashCount = 0;
let totalCreditCalc = 0;
let totalDebitCalc = 0;

docs.forEach(doc => {
    const hashLen = (doc.hash || "").length;
    if (hashLen < 172) {
        console.log(`SHORT HASH: ${doc.documentType} ${doc.series}/${doc.sequentialNumber} - Len: ${hashLen}`);
        shortHashCount++;
    }
    
    if (['factura', 'factura_recibo'].includes(doc.documentType)) {
        ftCount++;
        const total = doc.totals?.total || doc.totals?.grandTotal || 0;
        if (doc.status !== 'cancelled') {
            totalCreditCalc += Number(total);
        }
    }
    
    // Check duplicates?
});

console.log(`Short Hashes: ${shortHashCount}`);
console.log(`Calculated TotalCredit (FT/FR): ${totalCreditCalc.toFixed(2)}`);
