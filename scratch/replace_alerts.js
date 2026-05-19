const fs = require('fs');

function replaceFile(path) {
    let content = fs.readFileSync(path, 'utf8');

    // Add imports if they don't exist
    if (!content.includes("import { useToast }")) {
        content = content.replace("import { t } from '@/lib/i18n';", "import { t } from '@/lib/i18n';\nimport { useToast } from '@/context/ToastContext';\nimport { useConfirm, usePrompt } from '@/context/DialogContext';");
    }

    if (!content.includes("const toast = useToast();")) {
        content = content.replace("const { language } = useAppSettings();", "const { language } = useAppSettings();\n const toast = useToast();\n const confirm = useConfirm();\n const prompt = usePrompt();");
    }

    content = content.replace(/alert\(/g, "toast.info(");
    content = content.replace(/window\.confirm\(/g, "await confirm(");
    content = content.replace(/confirm\(/g, "await confirm(");
    content = content.replace(/window\.prompt\(/g, "await prompt(");
    content = content.replace(/prompt\(/g, "await prompt(");

    fs.writeFileSync(path, content, 'utf8');
}

replaceFile('src/pages/documents/index.tsx');
replaceFile('src/pages/documents/new.tsx');
replaceFile('src/pages/products/new.tsx');
replaceFile('src/pages/products/[id]/edit.tsx');
replaceFile('src/pages/documents/[id]/edit.tsx');
replaceFile('src/pages/purchases/index.tsx');
replaceFile('src/pages/series/index.tsx');
replaceFile('src/pages/stock-in/index.tsx');
replaceFile('src/pages/transfers/index.tsx');
replaceFile('src/pages/warehouses/index.tsx');

console.log("Done");
