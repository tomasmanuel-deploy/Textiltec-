# Relatório de Investigação de Falha de Envio à AGT

**Data:** 2026-03-07
**Autor:** Assistente de Desenvolvimento
**Assunto:** Falha no envio de facturas/recibos e inconsistência de dados (valor "0")

## 1. Descrição do Problema

Dois problemas principais foram identificados:
1.  **Inconsistência de Dados em Recibos (RC):** O recibo `RC RC7926S7461C/0011` foi submetido com sucesso, mas apareceu no portal da AGT com valor "0.00".
2.  **Falha de Envio/Falsos Positivos:** Documentos marcados como "sucesso" (`documents.json`) mas não encontrados na AGT, e falhas intermitentes de conexão.

## 2. Análise da Causa Raiz

### 2.1. Valor "0" em Recibos (RC)
-   **Causa:** A estrutura do payload JSON gerada pelo `AgtService.ts` para documentos do tipo `RC` (Recibo) estava incompleta.
-   **Detalhe Técnico:** A especificação AGT DS.120 exige que Recibos (PaymentReceipt) incluam o bloco `payment` contendo o mecanismo e montante do pagamento. O código anterior omitia este bloco ou falhava ao mapear os totais quando o objeto `totals` tinha estrutura diferente da esperada (ex: `grandTotal` vs `total`).
-   **Evidência:** Testes unitários confirmaram que o campo `payment` estava ausente ou com valor 0.

### 2.2. Falha de Envio e Conectividade
-   **Causa:** Falhas de rede transientes (timeouts ou erros 5xx da AGT) não eram tratadas com mecanismos de retry.
-   **Detalhe Técnico:** O método `submitRestRequest` fazia apenas uma tentativa. Se falhasse (ex: `Network Error`), o erro era propagado imediatamente. Além disso, a configuração de `allowMock` poderia mascarar falhas se ativada indevidamente, retornando um sucesso simulado (`resultCode: 1`).
-   **Evidência:** Logs indicaram falhas de conexão sem tentativas subsequentes.

## 3. Soluções Implementadas

### 3.1. Correção do Payload de Recibos
-   **Arquivo:** `src/services/AgtService.ts`
-   **Alteração:** Implementada lógica robusta para gerar o array `payment` em recibos.
-   **Lógica:**
    ```typescript
    // Se payment.amount não existir, usa totais do documento como fallback
    paymentAmount: formatAmount((document.totals as any)?.total || (document.totals as any)?.grandTotal || 0)
    ```
-   **Validação:** Adicionado teste unitário `generateRegistarFacturaPayload for RC` garantindo presença e valor correto.

### 3.2. Mecanismo de Retry Automático
-   **Arquivo:** `src/services/AgtService.ts`
-   **Alteração:** O método `submitRestRequest` agora implementa "Exponential Backoff".
-   **Configuração:**
    -   Máximo de tentativas: 3
    -   Delay: 2s (1ª), 4s (2ª), 6s (3ª)
    -   Condição: Apenas para erros de rede ou status 500-599.
-   **Validação:** Testes de integração (`src/__tests__/integration/AgtRetry.test.ts`) confirmam recuperação após 2 falhas.

### 3.3. Notificações e UX
-   **Componentes:** `NotificationContext.tsx`, `useAgtSync.ts`
-   **Funcionalidade:** Feedback visual multilingue (PT/EN) para o utilizador.
    -   Sucesso: "Documento enviado com sucesso à AGT."
    -   Erro: "Falha na comunicação com a AGT. O sistema tentará novamente."
    -   Aviso: Detalhes sobre tempo de resolução e suporte.

### 3.4. Logging Centralizado
-   **Arquivo:** `src/services/CentralLogService.ts`
-   **Funcionalidade:** Todos os envios (sucesso ou falha) são registrados com detalhes da resposta/erro para auditoria futura.

## 4. Validação e Testes

### 4.1. Testes Unitários
Executados via Jest (`src/__tests__/unit/AgtService.test.ts`):
-   ✅ Geração de Payload (FT, NC, ND, RC)
-   ✅ Formatação de valores (2 casas decimais)

### 4.2. Testes de Integração
Executados via Jest (`src/__tests__/integration/AgtRetry.test.ts`):
-   ✅ Simulação de erro de rede (3 tentativas)
-   ✅ Recuperação de falha (Sucesso após falha)

## 5. Recomendações Futuras

1.  **Monitorização de `allowMock`:** Verificar periodicamente se `AGT_ALLOW_MOCKS` está `false` em produção.
2.  **Conciliação Diária:** Implementar script que consulta `listarFacturas` na AGT e compara com a base local para detectar discrepâncias automaticamente.
3.  **Alertas em Tempo Real:** Integrar `CentralLogService` com serviço de alerta (email/SMS) para falhas críticas consecutivas.

---
**Status:** Resolvido e Validado.
