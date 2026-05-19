const fs = require('fs');

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

function fixImports(path) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');

    let needsWrite = false;

    if (content.includes('toast.') && !content.includes('useToast')) {
        content = content.replace("import Layout from '@/components/Layout';", "import Layout from '@/components/Layout';\nimport { useToast } from '@/context/ToastContext';");
        content = content.replace("const router = useRouter();", "const router = useRouter();\n const toast = useToast();");
        needsWrite = true;
    }
    
    if (content.includes('toast.') && !content.includes('useToast()')) {
        content = content.replace("export default function", "export default function");
        // This is tricky, maybe better to just do it manually.
    }

    if (needsWrite) {
        fs.writeFileSync(path, content, 'utf8');
    }
}

for (const file of files) {
  fixImports(file);
}
