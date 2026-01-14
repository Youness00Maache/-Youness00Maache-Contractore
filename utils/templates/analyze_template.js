const fs = require('fs');
const path = require('path');

// Read the slide XML
const slideXML = fs.readFileSync(
    path.join(__dirname, 'temp_extract', 'ppt', 'slides', 'slide1.xml'),
    'utf8'
);

// Extract all text content with their properties
const textBoxPattern = /\<a:t\>([^<]+)\<\/a:t\>/g;
const texts = [];
let match;

while ((match = textBoxPattern.exec(slideXML)) !== null) {
    texts.push(match[1]);
}

console.log('='.repeat(80));
console.log('PPTX TEMPLATE ANALYSIS - Invoice/Facture Template');
console.log('='.repeat(80));
console.log('\nAll text content found in the template:\n');

texts.forEach((text, index) => {
    console.log(`${index + 1}. "${text}"`);
});

console.log('\n' + '='.repeat(80));
console.log('Total text elements:', texts.length);
console.log('='.repeat(80));
