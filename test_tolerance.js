// Mocking the checkAnswer logic from app.js
function checkAnswer(q, userAnswer) {
    // ... logic from app.js ...
    if (q.type === 'input' || q.type === 'calculation') {
        const correctClean = String(q.correctAnswer).replace(/[,\s€]/g, '').replace(',', '.');
        const userClean = String(userAnswer).replace(/[,\s€]/g, '').replace(',', '.');

        const tol = q.tolerance || 0;
        const correctFloat = parseFloat(correctClean);
        const userFloat = parseFloat(userClean);

        console.log(`Checking: Correct=${correctFloat}, User=${userFloat}, Tol=${tol}`);
        console.log(`Diff: ${Math.abs(correctFloat - userFloat)}`);

        if (isNaN(userFloat)) return 0;

        if (Math.abs(correctFloat - userFloat) <= tol) return parseFloat(q.points);
        return 0;
    }
}

// Test Case from User
const q = {
    type: 'input',
    correctAnswer: '1005.66',
    tolerance: 0.5,
    points: 2.5
};

console.log("Testing 1006:", checkAnswer(q, '1006')); // Should pass
console.log("Testing 1005:", checkAnswer(q, '1005')); // Should fail (0.66 > 0.5)
