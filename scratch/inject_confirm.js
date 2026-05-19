const fs = require('fs');

const files = [
  'src/pages/documents/[id].tsx',
  'src/pages/documents/index.tsx',
  'src/pages/documents/new.tsx',
  'src/pages/products/index.tsx',
  'src/pages/warehouses/index.tsx',
  'src/pages/transfers/index.tsx',
  'src/pages/purchases/index.tsx',
  'src/pages/stock-in/index.tsx',
  'src/pages/series/index.tsx',
];

function injectConfirmPrompt(path) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');

    let changed = false;
    
    // Make sure we have the imports
    if ((content.includes('await confirm(') || content.includes('await prompt(')) && !content.includes('useConfirm')) {
        content = content.replace("import Layout from '../../components/Layout';", "import Layout from '../../components/Layout';\nimport { useConfirm, usePrompt } from '@/context/DialogContext';");
        content = content.replace("import Layout from '@/components/Layout';", "import Layout from '@/components/Layout';\nimport { useConfirm, usePrompt } from '@/context/DialogContext';");
        changed = true;
    }

    // Make sure we have the instantiations
    if ((content.includes('await confirm(') || content.includes('await prompt(')) && !content.includes('const confirm = useConfirm()')) {
        // Try finding export default function
        const match = content.match(/export default function\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{/);
        if (match) {
            content = content.replace(match[0], match[0] + "\n  const confirm = useConfirm();\n  const prompt = usePrompt();");
            changed = true;
        }
    }
    
    // Fix string prompt vs object format for confirm/prompt calls that were simply replaced
    // e.g. await confirm('Message') -> await confirm({ message: 'Message' })
    // If we want it to be simpler, DialogContext takes a string OR object now! So await confirm('Message') is fine!
    
    if (changed) {
        fs.writeFileSync(path, content, 'utf8');
    }
}

for (const file of files) {
  injectConfirmPrompt(file);
}

console.log("Injected confirm/prompt");
