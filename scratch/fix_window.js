const fs = require('fs');

function fixFile(path) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');

    // Fix remaining window.*
    content = content.replace(/window\.confirm\(/g, "await confirm(");
    content = content.replace(/window\.prompt\(/g, "await prompt(");

    // Make sure we have useConfirm and usePrompt imported
    if ((content.includes("await confirm(") || content.includes("await prompt(")) && !content.includes("useConfirm")) {
        content = content.replace("import { useToast } from '@/context/ToastContext';", "import { useToast } from '@/context/ToastContext';\nimport { useConfirm, usePrompt } from '@/context/DialogContext';");
    }

    // Add them to the component if missing
    if ((content.includes("await confirm(") || content.includes("await prompt(")) && !content.includes("const confirm = useConfirm()")) {
        content = content.replace("const toast = useToast();", "const toast = useToast();\n  const confirm = useConfirm();\n  const prompt = usePrompt();");
    }

    fs.writeFileSync(path, content, 'utf8');
}

const files = [
  'src/pages/documents/[id].tsx',
  'src/pages/documents/index.tsx',
  'src/pages/documents/new.tsx',
];

for (const file of files) {
  fixFile(file);
}

console.log("Fixed window.* prompts/confirms");
