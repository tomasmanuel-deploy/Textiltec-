# Integração Completa AGT Angola - Prakash Billing System

Este documento descreve a implementação completa da integração com a AGT (Administração Geral Tributária) de Angola, conforme as especificações técnicas fornecidas.

## Componentes Implementados

### 1. Módulo de Consulta de Contribuinte (`TaxpayerConsultationService`)

**Localização:** `src/services/TaxpayerConsultationService.ts`

**Funcionalidades:**
- Consulta de contribuintes via API AGT conforme especificação v5_0_1
- Cache inteligente em memória (LRU) com TTL de 24 horas
- Retry automático com rate limiting
- Validação de formato de NIF
- Suporte para modo de teste e produção
- Autenticação Bearer Token conforme padrão AGT

**API Endpoint:** `GET /api/agt/taxpayer/consult?nif=123456789&forceRefresh=false`

**Uso:**
```typescript
import taxpayerConsultationService from '@/services/TaxpayerConsultationService';

const taxpayerInfo = await taxpayerConsultationService.consultTaxpayer('123456789');
if (taxpayerInfo.isValid) {
  console.log('Contribuinte encontrado:', taxpayerInfo.name);
}
```

### 2. Validação de Documentos (`DocumentValidationService`)

**Localização:** `src/services/DocumentValidationService.ts`

**Funcionalidades:**
- Validação completa conforme Decreto 317.20
- Validação de campos obrigatórios SAFT
- Validação de formatos (NIF, datas, valores)
- Validação específica por tipo de documento
- Validação pré-submissão AGT

**Regras Implementadas:**
- Seller (Vendedor): NIF, Nome, Morada obrigatórios
- Buyer (Comprador): NIF obrigatório (exceto Consumidor Final), Nome obrigatório
- Documento: Série, Número sequencial, UUID, Datas obrigatórios
- Linhas: SKU, Descrição, Quantidade, Unidade, Preço unitário (validado para facturas)
- Totais: Subtotal, Total, Breakdown de IVA
- Validações específicas: Facturas não podem ter preço unitário <= 0

**Uso:**
```typescript
import documentValidationService from '@/services/DocumentValidationService';

const validation = documentValidationService.validateDocument(document);
if (!validation.isValid) {
  console.error('Erros:', validation.errors);
}
```

### 3. Serviço de Auditoria AGT (`AgtAuditService`)

**Localização:** `src/services/AgtAuditService.ts`

**Funcionalidades:**
- Logging detalhado de todas as operações AGT
- Rotação automática de logs (10MB por arquivo, máximo 100 arquivos)
- Logs em formato JSONL (uma linha por entrada)
- Query de logs com filtros
- Categorias: Submissão de documentos, Consulta de contribuintes, Geração SAFT, Validação

**Logs gerados:**
- `audit_YYYY-MM-DD.jsonl` - Um arquivo por dia
- Campos: timestamp, action, documentId, status, message, details

**Uso:**
```typescript
import agtAuditService from '@/services/AgtAuditService';

agtAuditService.logDocumentSubmission(
  documentId,
  documentType,
  'success',
  'Document submitted successfully',
  { token: 'AGT-123456' }
);
```

### 4. Configuração AGT Melhorada (`AgtConfig`)

**Localização:** `src/models/AgtConfig.ts`

**Campos Adicionados:**
- `taxpayerConsultationUrl`: URL específica para consulta de contribuintes
- `saftSubmissionUrl`: URL específica para submissão SAFT
- `softwareCertificateNumber`: Número do certificado do software
- `publicKeyFingerprint`: Fingerprint da chave pública para assinatura
- `privateKeyPath`: Caminho para chave privada
- `environment`: Ambiente (production/staging/development)
- `timeout`: Timeout de requisições (padrão: 10000ms)
- `retryAttempts`: Número de tentativas de retry (padrão: 3)
- `retryDelay`: Delay entre retries (padrão: 1000ms)

**API Endpoint:** `GET/POST /api/agt/config`

### 5. Componentes UI

#### TaxpayerLookup
**Localização:** `src/components/agt/TaxpayerLookup.tsx`

Componente React para consulta de contribuintes com:
- Busca automática (debounced) ou manual
- Indicadores visuais de status (ativo, inativo, suspenso)
- Exibição de informações do contribuinte
- Tratamento de erros

**Uso:**
```tsx
<TaxpayerLookup
  nif={customerNif}
  onTaxpayerFound={(info) => {
    // Preencher campos do formulário com info.name, info.address, etc.
  }}
  autoLookup={true}
/>
```

#### DocumentValidationBadge
**Localização:** `src/components/agt/DocumentValidationBadge.tsx`

Componente React para exibir status de validação:
- Badge verde: Documento válido
- Badge vermelho: Erros de validação
- Badge amarelo: Avisos
- Detalhes de erros/avisos (opcional)

**Uso:**
```tsx
<DocumentValidationBadge
  document={document}
  showDetails={true}
  onValidationChange={(isValid) => {
    // Habilitar/desabilitar botão de submissão
  }}
/>
```

### 6. API Endpoints

#### POST /api/documents/{id}/submit-agt
Submete um documento à AGT após validação.

**Request:**
```json
POST /api/documents/123/submit-agt
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Document submitted successfully to AGT",
  "token": "AGT-123456789",
  "validation": {
    "isValid": true,
    "warnings": []
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Document validation failed",
  "validation": {
    "isValid": false,
    "errors": [...],
    "warnings": [...]
  }
}
```

### 7. Integração com AgtService Existente

O `AgtService` existente foi mantido e pode ser usado em conjunto com os novos serviços:
- Geração de SAF-T JSON/XML
- Geração de QR Codes
- Assinatura digital (RSA-SHA256)
- Submissão à AGT

## Configuração

### 1. Configurar Credenciais AGT

Criar arquivo `data/agt_config.json`:
```json
{
  "apiUrl": "https://api.agt.gov.ao",
  "clientId": "seu-client-id",
  "clientSecret": "seu-client-secret",
  "testMode": false,
  "environment": "production",
  "timeout": 10000,
  "retryAttempts": 3,
  "retryDelay": 1000,
  "softwareCertificateNumber": "SEU_CERTIFICADO",
  "publicKeyFingerprint": "SEU_FINGERPRINT"
}
```

Ou via API:
```bash
POST /api/agt/config
Content-Type: application/json

{
  "apiUrl": "https://api.agt.gov.ao",
  "clientId": "seu-client-id",
  "clientSecret": "seu-client-secret",
  "testMode": false
}
```

### 2. Configurar Chaves de Assinatura Digital

Colocar chave privada em: `data/agt_keys/private.pem`
Colocar fingerprint público em: `data/agt_keys/public.sha256.base64.txt`

Ou definir variáveis de ambiente:
```bash
AGT_PRIVATE_KEY_PATH=/path/to/private.pem
AGT_PRIVATE_KEY_PASSPHRASE=passphrase (opcional)
AGT_PUBLIC_KEY_FINGERPRINT=base64_fingerprint
```

## Fluxo de Trabalho Recomendado

### Criar Documento com Validação

1. Usuário preenche formulário de documento
2. `DocumentValidationBadge` valida em tempo real
3. Usuário pode consultar contribuinte via `TaxpayerLookup`
4. Ao salvar, validação completa é executada
5. Se válido, documento é criado
6. Opcionalmente, submeter à AGT via `/api/documents/{id}/submit-agt`

### Consultar Contribuinte

1. Usuário digita NIF no campo
2. `TaxpayerLookup` consulta AGT (com cache)
3. Se encontrado, preenche automaticamente nome, morada, etc.
4. Se não encontrado, exibe erro apropriado

### Gerar e Exportar SAF-T

1. Usuário seleciona período (data início, data fim)
2. Sistema gera SAF-T XML conforme estrutura AGT
3. Validação XSD opcional (via Python lxml)
4. Download do arquivo XML

## Performance

### Otimizações Implementadas

1. **Cache de Contribuintes**: 24h TTL, máximo 10.000 entradas (LRU)
2. **Validação Debounced**: 500ms delay para evitar validações excessivas
3. **Consulta Automática Debounced**: 800ms delay para consultas automáticas
4. **Processamento Assíncrono**: SAF-T generation não bloqueia UI
5. **Rate Limiting**: 100ms delay entre consultas batch

### Métricas Esperadas

- Consulta de contribuinte: < 200ms (com cache), < 2s (sem cache)
- Validação de documento: < 50ms
- Geração SAF-T XML: < 5s (para 1000 documentos)
- Submissão AGT: < 3s (depende da rede)

## Conformidade

### Decreto 317.20 (SAF-T)
✅ Todos os campos obrigatórios implementados
✅ Estrutura XML conforme XSD
✅ Validação de formatos (NIF, datas, valores)
✅ Hash chain implementation
✅ Assinatura digital

### Especificação Consulta de Contribuinte v5_0_1
✅ Endpoint conforme especificação
✅ Autenticação Bearer Token
✅ Tratamento de erros HTTP
✅ Cache implementado
✅ Rate limiting

### Estrutura de Dados AGT
✅ Todos os campos conforme especificação
✅ Tipos de documento mapeados corretamente
✅ Códigos de taxa de IVA (NOR, RED, ISE, OUT)
✅ Status de documento (N, F, A)

## Logs e Auditoria

Todos os logs são armazenados em `data/audit_logs/audit_YYYY-MM-DD.jsonl`

Exemplo de log:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "action": "agt_document_submission",
  "documentId": "123",
  "documentType": "factura",
  "status": "success",
  "message": "Document submitted successfully to AGT",
  "details": {
    "token": "AGT-123456789"
  }
}
```

Query de logs via código:
```typescript
import agtAuditService from '@/services/AgtAuditService';

const logs = agtAuditService.queryLogs({
  action: 'agt_document_submission',
  status: 'success',
  startDate: new Date('2024-01-01'),
  limit: 100
});
```

## Testes

### Modo de Teste

Definir `testMode: true` na configuração AGT para:
- Consultas retornarem dados mock
- Submissões simularem sucesso
- Evitar chamadas reais à API AGT

### Testes Recomendados

1. **Teste de Consulta de Contribuinte**
   - NIF válido existente
   - NIF inválido (formato)
   - NIF não encontrado
   - Cache funcionando

2. **Teste de Validação**
   - Documento válido completo
   - Documento sem campos obrigatórios
   - Documento com valores inválidos
   - Documento tipo factura com preço zero

3. **Teste de Submissão AGT**
   - Documento válido submetido com sucesso
   - Documento inválido rejeitado
   - Erro de rede/timeout
   - Modo de teste

## Próximos Passos

1. Integrar `TaxpayerLookup` nas páginas de criação/edição de documentos
2. Adicionar botão "Submeter à AGT" na página de detalhes do documento
3. Adicionar página de configuração AGT nas settings
4. Adicionar dashboard de logs de auditoria
5. Implementar retry automático para submissões falhadas
6. Adicionar notificações em tempo real para status de submissão

## Suporte

Para questões sobre a integração AGT:
- Consulte os logs em `data/audit_logs/`
- Verifique a configuração em `data/agt_config.json`
- Revise os logs do servidor para erros detalhados

