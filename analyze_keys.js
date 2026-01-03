const fs = require('fs');

try {
    const content = fs.readFileSync('/Users/kaisasakarias/Downloads/files 2/questions.js', 'utf8');
    // Extract the array content. It starts with "const ALL_QUESTIONS = [" and ends with "];"
    // We can just evaluate the file content if we strip the const declaration or just use eval in a safe way if we trust the content.
    // simpler: regex to find keys

    // Actually, let's just try to eval it. It's a JS file.
    // We can perform a little hack to make it a module or just run it.

    // Let's manually parse it to be safe and robust against formatting.
    // Or just require it if we export it? No, it's a global var.

    // Let's strip the "const ALL_QUESTIONS =" part and just eval the array.
    const start = content.indexOf('[');
    const end = content.lastIndexOf(']');
    if (start === -1 || end === -1) {
        console.error("Could not find array brackets");
        process.exit(1);
    }

    const arrayStr = content.substring(start, end + 1);

    // We need to make sure the keys are valid JSON or JS. Data uses single quotes likely.
    // eval is easiest for this context as I am the agent running it.
    const questions = eval(arrayStr);

    const allKeys = new Set();
    questions.forEach(q => {
        Object.keys(q).forEach(k => allKeys.add(k));
    });

    console.log("All Keys Found:", Array.from(allKeys).sort());

    // Also check specific types mentioned
    const types = new Set(questions.map(q => q.type));
    console.log("Question Types:", Array.from(types).sort());

} catch (e) {
    console.error(e);
}
