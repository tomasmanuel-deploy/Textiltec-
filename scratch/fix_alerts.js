const fs = require('fs');

function fixFile(path) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');

    // Fix double awaits
    content = content.replace(/await await /g, 'await ');

    // Add imports if replacing alerts and missing
    if (content.includes("alert(") && !content.includes("useToast")) {
        content = content.replace("import { t } from '@/lib/i18n';", "import { t } from '@/lib/i18n';\nimport { useToast } from '@/context/ToastContext';");
        content = content.replace("const { language } = useAppSettings();", "const { language } = useAppSettings();\n const toast = useToast();");
    }

    content = content.replace(/alert\(/g, "toast.info(");

    fs.writeFileSync(path, content, 'utf8');
}

const files = [
  'src/pages/documents/index.tsx',
  'src/pages/documents/new.tsx',
  'src/pages/products/new.tsx',
  'src/pages/products/[id]/edit.tsx',
  'src/pages/documents/[id]/edit.tsx',
  'src/pages/purchases/index.tsx',
  'src/pages/series/index.tsx',
  'src/pages/stock-in/index.tsx',
  'src/pages/transfers/index.tsx',
  'src/pages/warehouses/index.tsx',
  'src/pages/index.tsx',
  'src/pages/clients/[id]/edit.tsx',
  'src/pages/clients/new.tsx',
  'src/pages/admin/companies/[id]/settings.tsx',
  'src/pages/admin/companies/[id]/license.tsx'
];

for (const file of files) {
  fixFile(file);
}

console.log("Fixed double awaits and leftover alerts");
