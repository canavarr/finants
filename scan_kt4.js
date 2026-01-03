const fs = require('fs');

try {
    const data = fs.readFileSync('questions.js', 'utf8');
    // Extract everything between { id: 'kt4_' and the next closing bracket } could be messy with regex.
    // Better: Find all indices of "id: 'kt4_" and check the type/matches in those blocks.

    // Simple state machine parser
    const lines = data.split('\n');
    let currentId = null;
    let currentType = null;
    let hasMatches = false;
    let hasOptions = false;

    lines.forEach((line, idx) => {
        if (line.includes("id: '")) {
            // Check previous question
            if (currentId && currentId.startsWith('kt4_')) {
                if (currentType === 'input' && (hasMatches || hasOptions)) {
                    console.log(`[MISMATCH] ${currentId}: input type with matches/options`);
                }
            }

            // Start new
            const match = line.match(/id: '([^']+)'/);
            if (match) currentId = match[1];
            currentType = null;
            hasMatches = false;
            hasOptions = false;
        }

        if (currentId && currentId.startsWith('kt4_')) {
            if (line.includes("type: 'input'")) currentType = 'input';
            if (line.includes("type: 'dropdown'")) currentType = 'dropdown';
            if (line.includes("matches: [")) hasMatches = true;
            if (line.includes("options: [")) hasOptions = true;
        }
    });

    // Check last one
    if (currentId && currentId.startsWith('kt4_')) {
        if (currentType === 'input' && (hasMatches || hasOptions)) {
            console.log(`[MISMATCH] ${currentId}: input type with matches/options`);
        }
    }

    console.log("Scan complete.");

} catch (e) {
    console.error(e);
}
