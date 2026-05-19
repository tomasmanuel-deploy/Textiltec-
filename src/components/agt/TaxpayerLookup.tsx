import React, { useState, useEffect, useCallback } from 'react';
import Button from '../ui/Button';

interface TaxpayerInfo {
  nif: string;
  name: string;
  tradeName?: string;
  address?: string;
  city?: string;
  status: 'active' | 'inactive' | 'suspended' | 'unknown';
  isValid: boolean;
  validationErrors?: string[];
}

interface TaxpayerLookupProps {
  nif: string;
  onTaxpayerFound?: (info: TaxpayerInfo) => void;
  onTaxpayerNotFound?: () => void;
  autoLookup?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Taxpayer Lookup Component
 * Allows users to lookup taxpayer information from AGT database
 */
export default function TaxpayerLookup({
  nif,
  onTaxpayerFound,
  onTaxpayerNotFound,
  autoLookup = false,
  disabled = false,
  placeholder = 'Digite o NIF e clique em Consultar',
}: TaxpayerLookupProps) {
  const [isConsulting, setIsConsulting] = useState(false);
  const [taxpayerInfo, setTaxpayerInfo] = useState<TaxpayerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastConsultedNif, setLastConsultedNif] = useState<string>('');

  // Auto-lookup when NIF changes (debounced)
  useEffect(() => {
    if (!autoLookup || !nif || nif === lastConsultedNif || disabled) return;

    const normalizedNif = String(nif).replace(/\s+/g, '').trim();
    if (normalizedNif.length < 6) return; // Don't lookup if NIF is too short

    const timeoutId = setTimeout(() => {
      handleConsult(normalizedNif);
    }, 800); // 800ms debounce

    return () => clearTimeout(timeoutId);
  }, [nif, autoLookup, lastConsultedNif, disabled]);

  const handleConsult = useCallback(async (nifToConsult?: string) => {
    const nifValue = nifToConsult || nif;
    if (!nifValue || String(nifValue).trim().length === 0) {
      setError('Por favor, digite um NIF válido');
      return;
    }

    const normalizedNif = String(nifValue).replace(/\s+/g, '').trim();
    
    // Basic NIF format validation
    if (!/^[0-9A-Z]{6,14}$/i.test(normalizedNif)) {
      setError('Formato de NIF inválido');
      setTaxpayerInfo(null);
      if (onTaxpayerNotFound) onTaxpayerNotFound();
      return;
    }

    setIsConsulting(true);
    setError(null);
    setTaxpayerInfo(null);

    try {
      const response = await fetch(`/api/agt/taxpayer/consult?nif=${encodeURIComponent(normalizedNif)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Erro ao consultar contribuinte');
      }

      if (data.success && data.data) {
        const info: TaxpayerInfo = data.data;
        setTaxpayerInfo(info);
        setLastConsultedNif(normalizedNif);

        if (info.isValid && onTaxpayerFound) {
          onTaxpayerFound(info);
        } else if (!info.isValid && onTaxpayerNotFound) {
          onTaxpayerNotFound();
        }
      } else {
        throw new Error('Dados de contribuinte não encontrados');
      }
    } catch (err: any) {
      console.error('Error consulting taxpayer:', err);
      setError(err.message || 'Erro ao consultar contribuinte na AGT');
      setTaxpayerInfo(null);
      if (onTaxpayerNotFound) onTaxpayerNotFound();
    } finally {
      setIsConsulting(false);
    }
  }, [nif, onTaxpayerFound, onTaxpayerNotFound]);

  const getStatusColor = (status: TaxpayerInfo['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-600';
      case 'inactive':
        return 'text-yellow-600';
      case 'suspended':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusLabel = (status: TaxpayerInfo['status']) => {
    switch (status) {
      case 'active':
        return 'Ativo';
      case 'inactive':
        return 'Inativo';
      case 'suspended':
        return 'Suspenso';
      default:
        return 'Desconhecido';
    }
  };

  return (
    <div className="space-y-2">
      {!autoLookup && (
        <div className="flex gap-2">
          <Button
            onClick={() => handleConsult()}
            disabled={disabled || isConsulting || !nif}
            className="flex-shrink-0"
          >
            {isConsulting ? 'Consultando...' : 'Consultar AGT'}
          </Button>
          {taxpayerInfo?.isValid && (
            <span className="flex items-center text-sm text-green-600">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Válido
            </span>
          )}
        </div>
      )}

      {isConsulting && autoLookup && (
        <div className="text-sm text-gray-500 flex items-center">
          <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Consultando AGT...
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      {taxpayerInfo && taxpayerInfo.isValid && (
        <div className="bg-green-50 border border-green-200 rounded p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-green-800">{taxpayerInfo.name}</div>
            <span className={`text-xs font-medium ${getStatusColor(taxpayerInfo.status)}`}>
              {getStatusLabel(taxpayerInfo.status)}
            </span>
          </div>
          {taxpayerInfo.tradeName && (
            <div className="text-sm text-gray-600">Nome comercial: {taxpayerInfo.tradeName}</div>
          )}
          {taxpayerInfo.address && (
            <div className="text-sm text-gray-600">
              {taxpayerInfo.address}
              {taxpayerInfo.city && `, ${taxpayerInfo.city}`}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1">
            NIF: {taxpayerInfo.nif}
          </div>
        </div>
      )}

      {taxpayerInfo && !taxpayerInfo.isValid && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
          <div className="text-sm text-yellow-800 font-medium">Contribuinte não encontrado ou inválido</div>
          {taxpayerInfo.validationErrors && taxpayerInfo.validationErrors.length > 0 && (
            <ul className="mt-1 text-xs text-yellow-700 list-disc list-inside">
              {taxpayerInfo.validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

