const fs = require('fs');

// Read questions.js content
const content = fs.readFileSync('questions.js', 'utf8');

// Hacky eval to get the array (assuming it's assigned to window or const)
// We'll wrap it in a function wrapper to extract the variable
// The file typically has "const ALL_QUESTIONS = [...]"
const mockWindow = {};
const code = content.replace('const ALL_QUESTIONS =', 'global.ALL_QUESTIONS =');
eval(code);

const questions = global.ALL_QUESTIONS;

console.log(`Auditing ${questions.length} questions...`);

let issues = 0;

questions.forEach(q => {
    // Check 1: Input type but looks like dropdown
    if (q.type === 'input') {
        if (q.matches) {
            console.log(`[MISMATCH] ${q.id}: Type is 'input' but has 'matches'. Should be 'dropdown'?`);
            issues++;
        }
        if (q.options) {
            console.log(`[MISMATCH] ${q.id}: Type is 'input' but has 'options'. Should be 'dropdown' or 'multiple-choice'?`);
            issues++;
        }
    }

    // Check 2: Dropdown type but missing data
    if (q.type === 'dropdown') {
        if (!q.matches && !q.options) {
            console.log(`[INVALID] ${q.id}: Type is 'dropdown' but missing 'matches' or 'options'.`);
            issues++;
        }
    }

    // Check 3: Multiple choice missing options
    if (q.type === 'multiple-choice') {
        if (!q.options) {
            console.log(`[INVALID] ${q.id}: Type is 'multiple-choice' but missing 'options'.`);
            issues++;
        }
    }
});

if (issues === 0) {
    console.log("No type inconsistencies found.");
} else {
    console.log(`Found ${issues} issues.`);
}
