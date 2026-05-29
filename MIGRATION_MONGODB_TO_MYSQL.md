# 📚 Documentação: Migração MongoDB → MySQL com Prisma

**Data:** 2026-05-29  
**Versão do Projeto:** 1.0.6  
**Status:** Planejamento e Implementação

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Análise Atual](#análise-atual)
3. [Plano de Migração](#plano-de-migração)
4. [Pré-requisitos](#pré-requisitos)
5. [Passos de Implementação](#passos-de-implementação)
6. [Migração de Dados](#migração-de-dados)
7. [Atualização das Rotas API](#atualização-das-rotas-api)
8. [Testes](#testes)
9. [Rollback Plan](#rollback-plan)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Este documento descreve a migração do banco de dados de **MongoDB** (Mongoose) para **MySQL** usando **Prisma** como ORM.

### Por que Prisma?
- ✅ Type-safe queries com geração automática
- ✅ Migrações versionadas e reversíveis
- ✅ Excelente suporte a relacionamentos
- ✅ Ferramentas de debug (`prisma studio`)
- ✅ Performance otimizada para relational databases

---

## 📊 Análise Atual

### Configuração Existente (MongoDB)

**Arquivo:** `.env`
```env
MONGODB_URI=mongodb+srv://miguelsimao775_db_user:wUWJ2s5yl2xTfZ5O@cluster0.g5ie80p.mongodb.net/prakash-billing?retryWrites=true&w=majority&appName=Cluster0
```

**Dependências atuais:**
- `mongoose: ^8.19.2`

### Modelos MongoDB Existentes

| Modelo | Local | Relacionamentos |
|--------|-------|-----------------|
| `Product` | `src/models/Product.ts` | Company (companyId) |
| `Client` | `src/models/Client.ts` | Company (companyId) |
| `Company` | `src/models/Company.ts` | - |
| `Document` | `src/models/Document.ts` | Company (seller.nif) |
| `User` | `src/models/User.ts` | - |
| `Customer` | `src/models/Customer.ts` | - |
| `AgtConfig` | `src/models/AgtConfig.ts` | - |

### Armazenamento Híbrido

**JSON Stores (mantêm-se iguais):**
- `seriesStore` - Configuração de série
- `warehouseStore` - Configuração de armazém
- `documentStore` - Documentos fiscais (AGT compliance)
- `stockStore` / `movementStore` - Ledger de estoque

---

## 🔄 Plano de Migração

### Fase 1: Configuração (1-2 horas)
- [ ] Instalar dependências Prisma
- [ ] Configurar banco MySQL local/remoto
- [ ] Atualizar `.env`
- [ ] Remover Mongoose

### Fase 2: Schema Prisma (2-3 horas)
- [ ] Criar `prisma/schema.prisma`
- [ ] Gerar migrações
- [ ] Criar tabelas no MySQL

### Fase 3: Migração de Dados (1-2 horas)
- [ ] Exportar dados do MongoDB
- [ ] Importar no MySQL
- [ ] Validar integridade

### Fase 4: Atualização de Código (4-6 horas)
- [ ] Reescrever helper functions
- [ ] Atualizar todas as rotas API
- [ ] Remover imports Mongoose

### Fase 5: Testes (2-3 horas)
- [ ] Testes unitários
- [ ] Testes de integração
- [ ] Testes em produção (staging)

**Tempo Total Estimado:** 10-16 horas

---

## ✅ Pré-requisitos

### Ambiente Local
```bash
# Verificar Node.js
node --version  # >= 18.x
npm --version   # >= 9.x

# MySQL Server (já instalado ou usar Docker)
docker run -d \
  --name mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=prakash-billing \
  -p 3306:3306 \
  mysql:8.0
```

### Ou: MySQL na Nuvem
- AWS RDS
- DigitalOcean Managed Databases
- PlanetScale (MySQL serverless)
- Azure Database for MySQL

---

## 🛠️ Passos de Implementação

### Passo 1: Instalar Dependências

```bash
# Remover Mongoose
npm remove mongoose

# Instalar Prisma
npm install @prisma/client
npm install -D prisma ts-node

# Instalar driver MySQL
npm install mysql2
```

**package.json atualizado:**
```json
{
  "dependencies": {
    "@prisma/client": "^5.x.x",
    "mysql2": "^3.x.x"
  },
  "devDependencies": {
    "prisma": "^5.x.x",
    "ts-node": "^10.x.x"
  }
}
```

---

### Passo 2: Configurar `.env`

**Antes:**
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/prakash-billing
```

**Depois:**
```env
# MySQL Connection
DATABASE_URL="mysql://root:root@localhost:3306/prakash-billing"

# Ou para produção (ex: PlanetScale)
DATABASE_URL="mysql://user:password@aws.connect.psdb.cloud/prakash-billing?sslAccept=strict"

# Node Environment
NODE_ENV=development
```

---

### Passo 3: Inicializar Prisma

```bash
npx prisma init
```

Isso criará:
```
prisma/
  └── schema.prisma
.env  (atualizado)
```

---

### Passo 4: Criar Schema Prisma

**Arquivo:** `prisma/schema.prisma`

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ============ Company ============
model Company {
  id              String   @id @default(cuid())
  nif             String   @unique
  name            String
  legalName       String?
  address         String?
  email           String?
  phone           String?
  isDefault       Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  products        Product[]
  clients         Client[]
  documents       Document[]
  
  @@map("companies")
}

// ============ Product ============
model Product {
  id              String   @id @default(cuid())
  sku             String
  name            String
  description     String?
  price           Float
  quantity        Float    @default(0)
  category        String?
  companyId       String
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  // Unique constraint: sku must be unique per company
  @@unique([companyId, sku])
  @@index([companyId])
  @@map("products")
}

// ============ Client ============
model Client {
  id              String   @id @default(cuid())
  nif             String
  name            String
  email           String?
  phone           String?
  address         String?
  city            String?
  postalCode      String?
  country         String?
  companyId       String
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  // Unique constraint: nif must be unique per company
  @@unique([companyId, nif])
  @@index([companyId])
  @@map("clients")
}

// ============ Document ============
model Document {
  id              String   @id @default(cuid())
  type            String   // "invoice", "credit_note", "debit_note", etc
  number          String
  series          String
  date            DateTime
  seller          Json     // { nif: string, name: string }
  buyer           Json     // { nif: string, name: string }
  items           Json     // Array of invoice items
  total           Float
  tax             Float
  status          String   @default("draft") // draft, confirmed, cancelled
  companyId       String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, type, series, number])
  @@index([companyId])
  @@index([date])
  @@map("documents")
}

// ============ User ============
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  password        String
  name            String
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("users")
}

// ============ Customer ============
model Customer {
  id              String   @id @default(cuid())
  email           String   @unique
  name            String
  phone           String?
  address         String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("customers")
}

// ============ AgtConfig ============
model AgtConfig {
  id              String   @id @default(cuid())
  key             String   @unique
  value           String
  description     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("agt_configs")
}
```

---

### Passo 5: Gerar e Executar Migrações

```bash
# Criar migration inicial
npx prisma migrate dev --name init

# Verificar schema
npx prisma db push

# (Opcional) Abrir Prisma Studio para inspeção
npx prisma studio
```

---

### Passo 6: Criar Helpers para Banco de Dados

**Novo Arquivo:** `src/lib/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma =
  global.prisma ||
  new PrismaClient({
    log: ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
```

**Helper para Company Ativa:** `src/lib/getActiveCompany.ts`

```typescript
import prisma from '@/lib/prisma';

export async function getActiveCompany() {
  const company = await prisma.company.findFirst({
    where: { isDefault: true },
  });

  if (!company) {
    throw new Error('No active company configured. Please set a default company.');
  }

  return company;
}
```

---

## 📥 Migração de Dados

### Passo 1: Exportar MongoDB

**Script:** `scripts/export-mongodb.js`

```javascript
const mongoose = require('mongoose');
const fs = require('fs');

const MONGODB_URI = process.env.MONGODB_URI;

async function exportData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');

    // Importar models
    const Product = require('../src/models/Product').default;
    const Client = require('../src/models/Client').default;
    const Company = require('../src/models/Company').default;

    // Exportar collections
    const companies = await Company.find();
    const products = await Product.find();
    const clients = await Client.find();

    const data = {
      companies,
      products,
      clients,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      'data/mongodb-export.json',
      JSON.stringify(data, null, 2)
    );

    console.log('✅ Dados exportados para data/mongodb-export.json');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro na exportação:', error);
    process.exit(1);
  }
}

exportData();
```

**Executar:**
```bash
node scripts/export-mongodb.js
```

---

### Passo 2: Importar no MySQL com Prisma

**Script:** `scripts/import-mysql.ts`

```typescript
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

interface ExportData {
  companies: any[];
  products: any[];
  clients: any[];
}

async function importData() {
  try {
    const exportFile = path.join(process.cwd(), 'data/mongodb-export.json');
    const data = JSON.parse(
      fs.readFileSync(exportFile, 'utf-8')
    ) as ExportData;

    console.log('📥 Iniciando importação...');

    // 1. Importar Companies
    console.log(`📍 Importando ${data.companies.length} empresas...`);
    for (const company of data.companies) {
      await prisma.company.upsert({
        where: { nif: company.nif },
        update: company,
        create: {
          nif: company.nif,
          name: company.name,
          isDefault: company.isDefault ?? false,
        },
      });
    }
    console.log('✅ Empresas importadas');

    // 2. Importar Products
    console.log(`📍 Importando ${data.products.length} produtos...`);
    for (const product of data.products) {
      const company = await prisma.company.findUnique({
        where: { nif: product.company.nif },
      });

      if (company) {
        await prisma.product.upsert({
          where: {
            companyId_sku: {
              companyId: company.id,
              sku: product.sku,
            },
          },
          update: product,
          create: {
            ...product,
            companyId: company.id,
          },
        });
      }
    }
    console.log('✅ Produtos importados');

    // 3. Importar Clients
    console.log(`📍 Importando ${data.clients.length} clientes...`);
    for (const client of data.clients) {
      const company = await prisma.company.findUnique({
        where: { nif: client.company.nif },
      });

      if (company) {
        await prisma.client.upsert({
          where: {
            companyId_nif: {
              companyId: company.id,
              nif: client.nif,
            },
          },
          update: client,
          create: {
            ...client,
            companyId: company.id,
          },
        });
      }
    }
    console.log('✅ Clientes importados');

    console.log('\n✅ Importação concluída com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro na importação:', error);
    process.exit(1);
  }
}

importData();
```

**Executar:**
```bash
npx ts-node scripts/import-mysql.ts
```

---

## 🚀 Atualização das Rotas API

### Exemplo: `/api/products`

**Antes (Mongoose):**
```typescript
import mongoose from 'mongoose';
import Product from '@/models/Product';
import { connectToDatabase } from '@/lib/mongoose';

export async function GET(req: Request) {
  await connectToDatabase();

  const products = await Product.find({ isActive: true });
  return Response.json(products);
}
```

**Depois (Prisma):**
```typescript
import prisma from '@/lib/prisma';
import { getActiveCompany } from '@/lib/getActiveCompany';

export async function GET(req: Request) {
  const company = await getActiveCompany();

  const products = await prisma.product.findMany({
    where: {
      companyId: company.id,
      isActive: true,
    },
  });

  return Response.json(products);
}
```

### Exemplo: `/api/products` (POST)

**Antes:**
```typescript
export async function POST(req: Request) {
  await connectToDatabase();

  const data = await req.json();
  const product = await Product.create(data);

  return Response.json(product, { status: 201 });
}
```

**Depois:**
```typescript
export async function POST(req: Request) {
  const company = await getActiveCompany();
  const data = await req.json();

  const product = await prisma.product.create({
    data: {
      ...data,
      companyId: company.id,
    },
  });

  return Response.json(product, { status: 201 });
}
```

### Exemplo: `/api/clients`

**GET:**
```typescript
export async function GET(req: Request) {
  const company = await getActiveCompany();

  const clients = await prisma.client.findMany({
    where: {
      companyId: company.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(clients);
}
```

**POST:**
```typescript
export async function POST(req: Request) {
  const company = await getActiveCompany();
  const data = await req.json();

  try {
    const client = await prisma.client.create({
      data: {
        ...data,
        companyId: company.id,
      },
    });
    return Response.json(client, { status: 201 });
  } catch (error) {
    if (error.code === 'P2002') {
      return Response.json(
        { error: 'Cliente com este NIF já existe' },
        { status: 409 }
      );
    }
    throw error;
  }
}
```

---

## 🧪 Testes

### Testes Unitários: `__tests__/api/products.test.ts`

```typescript
import prisma from '@/lib/prisma';
import { GET, POST } from '@/app/api/products/route';

// Mock do Prisma
jest.mock('@/lib/prisma', () => ({
  product: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  company: {
    findFirst: jest.fn(),
  },
}));

describe('API /api/products', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return products for active company', async () => {
      const mockCompany = { id: '123', nif: '123456789' };
      const mockProducts = [
        { id: '1', sku: 'SKU001', name: 'Product 1' },
      ];

      (prisma.company.findFirst as jest.Mock).mockResolvedValue(
        mockCompany
      );
      (prisma.product.findMany as jest.Mock).mockResolvedValue(
        mockProducts
      );

      const req = new Request('http://localhost/api/products');
      const res = await GET(req);
      const data = await res.json();

      expect(data).toEqual(mockProducts);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          companyId: mockCompany.id,
          isActive: true,
        },
      });
    });
  });

  describe('POST', () => {
    it('should create a new product', async () => {
      const mockCompany = { id: '123', nif: '123456789' };
      const newProduct = { sku: 'SKU001', name: 'New Product' };

      (prisma.company.findFirst as jest.Mock).mockResolvedValue(
        mockCompany
      );
      (prisma.product.create as jest.Mock).mockResolvedValue({
        id: '1',
        ...newProduct,
        companyId: mockCompany.id,
      });

      const req = new Request('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify(newProduct),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.sku).toBe('SKU001');
    });
  });
});
```

**Executar testes:**
```bash
npm test

# Com cobertura
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## 🔄 Rollback Plan

Se algo der errado durante a migração:

### Passo 1: Manter Backup do MongoDB

```bash
# Exportar dados antes de deletar
mongodump --uri="$MONGODB_URI" --out ./backups/mongodb-backup
```

### Passo 2: Restaurar de Backup

```bash
# Se necessário restaurar
mongorestore --uri="$MONGODB_URI" ./backups/mongodb-backup
```

### Passo 3: Reverter Código

```bash
# Voltar para versão anterior
git checkout HEAD -- package.json
git checkout HEAD -- src/
npm install mongoose@^8.19.2
```

### Passo 4: Limpar MySQL (se necessário)

```bash
# Dropar database MySQL
mysql -u root -p -e "DROP DATABASE prakash_billing;"
```

---

## 🐛 Troubleshooting

### Erro: "ECONNREFUSED 127.0.0.1:3306"

**Problema:** MySQL não está rodando

**Solução:**
```bash
# Verificar se MySQL está rodando
brew services list  # macOS
# ou
sudo systemctl status mysql  # Linux
# ou
docker ps | grep mysql  # Docker

# Iniciar se não estiver
docker start mysql
```

---

### Erro: "P2002: Unique constraint failed"

**Problema:** Tentando inserir registro duplicado

**Solução:**
```typescript
// Usar upsert ao invés de create
const product = await prisma.product.upsert({
  where: {
    companyId_sku: { companyId: '123', sku: 'SKU001' },
  },
  update: { price: 100 },
  create: { sku: 'SKU001', companyId: '123', price: 100 },
});
```

---

### Erro: "Missing environment variable DATABASE_URL"

**Solução:**
```bash
# Verificar .env
cat .env | grep DATABASE_URL

# Recriar .env se necessário
npx prisma init
```

---

### Erro: "Field companyId is required"

**Problema:** Esqueceu de adicionar companyId ao criar registro

**Solução:**
```typescript
// ❌ Errado
const product = await prisma.product.create({
  data: { sku: 'SKU001', name: 'Product' },
});

// ✅ Correto
const company = await getActiveCompany();
const product = await prisma.product.create({
  data: {
    sku: 'SKU001',
    name: 'Product',
    companyId: company.id,
  },
});
```

---

## 📋 Checklist de Implementação

### Fase 1: Setup
- [ ] Instalar dependências Prisma
- [ ] Configurar MySQL (local ou cloud)
- [ ] Atualizar `.env`
- [ ] Remover Mongoose do package.json
- [ ] Criar `prisma/schema.prisma`

### Fase 2: Migrações
- [ ] Executar `npx prisma migrate dev --name init`
- [ ] Verificar tabelas criadas: `npx prisma studio`
- [ ] Exportar dados do MongoDB
- [ ] Importar dados no MySQL
- [ ] Validar integridade dos dados

### Fase 3: Código
- [ ] Criar `src/lib/prisma.ts`
- [ ] Criar `src/lib/getActiveCompany.ts`
- [ ] Remover `src/lib/mongoose.ts`
- [ ] Atualizar `/api/products`
- [ ] Atualizar `/api/clients`
- [ ] Atualizar `/api/documents`
- [ ] Atualizar outras rotas
- [ ] Remover imports Mongoose antigos

### Fase 4: Testes
- [ ] Rodar testes unitários
- [ ] Testes de integração
- [ ] Teste em staging
- [ ] Verificar performance

### Fase 5: Deploy
- [ ] Backup completo (MongoDB + código atual)
- [ ] Deploy no servidor de produção
- [ ] Monitorar logs
- [ ] Teste de smoke após deploy
- [ ] Documentar resultados

---

## 📞 Referências

- [Prisma Docs](https://www.prisma.io/docs/)
- [MySQL Prisma Guide](https://www.prisma.io/docs/orm/overview/databases/mysql)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate)
- [Data Migration Guide](https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/migrate-to-prisma)

---

**Última atualização:** 29 de maio de 2026  
**Responsável:** Equipe de Backend  
**Status:** 🟡 Planejamento
