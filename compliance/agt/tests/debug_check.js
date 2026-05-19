const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../../../data/agt_config.json');
const documentsPath = path.resolve(__dirname, '../../../data/documents.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('Current Config Mode:', config.submissionMode);

const data = JSON.parse(fs.readFileSync(documentsPath, 'utf8'));
const doc326 = data.documents['326'];

if (doc326) {
    console.log('Document 326 AGT Submission:', JSON.stringify(doc326.agtSubmission, null, 2));
} else {
    console.log('Document 326 not found in file.');
}
