const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const documentsPath = path.join(process.cwd(), 'data', 'documents.json');
const companyPath = path.join(process.cwd(), 'data', 'company.json');
const privateKeyPath = path.join(process.cwd(), 'data', 'agt_keys', 'private.pem');

// Load Data
const data = JSON.parse(fs.readFileSync(documentsPath, 'utf8'));
const company = JSON.parse(fs.readFileSync(companyPath, 'utf8'));
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

// Helper to map type
function mapType(type) {
    switch (type) {
        case 'factura': return 'FT';
        case 'factura_recibo': return 'FR';
        case 'nota_de_credito': return 'NC';
        case 'nota_de_debito': return 'ND';
        case 'recibo': return 'RC';
        case 'recibo_estorno': return 'RE';
        case 'nota_de_entrega': return 'GR';
        case 'orçamento': return 'OR';
        case 'proforma': return 'PP';
        default: return 'FT';
    }
}

// Helper to format date
function formatDate(d) {
    return new Date(d).toISOString().split('T')[0];
}

// Helper to format datetime
function formatDateTime(d) {
    return new Date(d).toISOString().split('.')[0];
}

// Helper to format number
function fmt2(n) {
    return Number(n || 0).toFixed(2);
}

// Sign Function
function sign(payload) {
    const signer = crypto.createSign('RSA-SHA1');
    signer.update(payload);
    signer.end();
    return signer.sign(privateKey, 'base64');
}

// 1. Flatten Documents
let docs = Object.values(data.documents);

// 2. Sort by Date
docs.sort((a, b) => new Date(a.issueDate) - new Date(b.issueDate));

// 3. Group by Series+Type
const buckets = {};
docs.forEach(doc => {
    // Ensure series is set. If missing, default to type-based standard series
    const typeCode = mapType(doc.documentType);
    const series = (doc.series || typeCode).toUpperCase(); // Default to FT, RC etc if series missing
    const key = `${typeCode}-${series}`;
    
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(doc);
});

// 4. Renumber and Resign
const prevHashes = {}; // Key: series-type

Object.keys(buckets).forEach(key => {
    const seriesDocs = buckets[key];
    let seq = 1;
    let prevHash = "";
    
    // Sort again just to be sure (stable sort)
    seriesDocs.sort((a, b) => new Date(a.issueDate) - new Date(b.issueDate));
    
    seriesDocs.forEach(doc => {
        // Fix sequential number
        doc.sequentialNumber = seq++;
        
        // Ensure Series is set correctly
        const typeCode = mapType(doc.documentType);
        doc.series = (doc.series || typeCode).toUpperCase();
        
        // Backfill createdAt if missing
        if (!doc.createdAt) {
            doc.createdAt = doc.issueDate;
        }

        // --- RECALCULATE TOTALS FROM LINES ---
        // This ensures the Hash matches the XML content exactly.
        // Logic matches export-xml.ts
        if (doc.lines && doc.lines.length > 0) {
            let totalNet = 0;
            let totalTax = 0;
            let totalGross = 0;

            doc.lines.forEach(line => {
                const qty = Number(line.quantity || 0);
                const unitPrice = Number(line.unitPrice || 0);
                const discount = Number(line.discount || 0);
                const vatRate = Number(line.vatRate || 0);

                // export-xml.ts logic:
                // settlementAmountNum = (qty * unitPrice * discount / 100)
                // baseAmount = (qty * unitPrice) - settlementAmountNum
                // taxAmount = baseAmount * (vatRate / 100)

                const settlementAmount = discount > 0 ? (qty * unitPrice * discount / 100) : 0;
                const baseAmount = (qty * unitPrice) - settlementAmount;
                const taxAmount = vatRate > 0 ? (baseAmount * vatRate / 100) : 0;

                // Accumulate raw values? No, export-xml.ts sums rounded values?
                // export-xml.ts: dtNet += Number(baseAmount.toFixed(2)); dtTax += Number(taxAmount.toFixed(2));
                
                totalNet += Number(baseAmount.toFixed(2));
                totalTax += Number(taxAmount.toFixed(2));
            });
            
            // Final Total Calculation
            totalGross = Number((totalNet + totalTax).toFixed(2));
            
            // Update doc.totals
            if (!doc.totals) doc.totals = {};
            doc.totals.subtotal = totalNet;
            doc.totals.vatTotal = totalTax;
            doc.totals.total = totalGross;
            doc.totals.grandTotal = totalGross; // Ensure consistency
        }
        // -------------------------------------

        // Construct Payload
        // Date;SystemEntryDate;DocNo;GrossTotal;PreviousHash
        const date = formatDate(doc.issueDate);
        const systemEntryDate = formatDateTime(doc.createdAt);
        const docNo = `${typeCode} ${doc.series}/${doc.sequentialNumber}`;
        const total = fmt2(doc.totals?.total || doc.totals?.grandTotal || 0);
        
        const payload = `${date};${systemEntryDate};${docNo};${total};${prevHash}`;
        
        // Sign
        const hash = sign(payload);
        
        doc.hash = hash;
        doc.hashControl = "1";
        
        prevHash = hash;
        
        console.log(`Processed ${docNo}: ${date} | Hash: ${hash.substring(0, 10)}...`);
    });
});

// 5. Re-index and Save
const newDocumentsMap = {};
docs.forEach(doc => {
    newDocumentsMap[doc.id] = doc;
});
data.documents = newDocumentsMap;

fs.writeFileSync(documentsPath, JSON.stringify(data, null, 2));

// 6. Fix Company Header
company.saftSoftwareValidationNumber = "0"; // Default for validated software in test/dev if not specified
company.saftProductId = "Prakash/1.0.6"; // Ensure format App/Version
fs.writeFileSync(companyPath, JSON.stringify(company, null, 2));

console.log("Repair Complete!");
