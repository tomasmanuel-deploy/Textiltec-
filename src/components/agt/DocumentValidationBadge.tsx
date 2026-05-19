import React, { useState, useEffect } from 'react';
import documentValidationService from '../../services/DocumentValidationService';
import { IDocument } from '../../models/Document';

interface DocumentValidationBadgeProps {
  document: Partial<IDocument>;
  showDetails?: boolean;
  onValidationChange?: (isValid: boolean) => void;
}

/**
 * Document Validation Badge Component
 * Shows validation status for documents according to AGT rules
 */
export default function DocumentValidationBadge({
  document,
  showDetails = false,
  onValidationChange,
}: DocumentValidationBadgeProps) {
  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (!document || !document.seller) {
      setValidationResult(null);
      return;
    }

    setIsValidating(true);
    
    // Debounce validation
    const timeoutId = setTimeout(() => {
      try {
        const result = documentValidationService.validateDocument(document as IDocument);
        setValidationResult(result);
        if (onValidationChange) {
          onValidationChange(result.isValid);
        }
      } catch (error) {
        console.error('Validation error:', error);
        setValidationResult({ isValid: false, errors: [{ message: 'Erro na validação' }] });
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [document, onValidationChange]);

  if (isValidating) {
    return (
      <div className="inline-flex items-center px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded">
        <svg className="animate-spin h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Validando...
      </div>
    );
  }

  if (!validationResult) {
    return null;
  }

  const { isValid, errors, warnings } = validationResult;
  const totalIssues = errors.length + warnings.length;

  if (isValid && totalIssues === 0) {
    return (
      <div className="inline-flex items-center px-2 py-1 text-xs text-green-700 bg-green-100 rounded">
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        Válido
      </div>
    );
  }

  if (errors.length > 0) {
    return (
      <div className="inline-flex flex-col">
        <div className="inline-flex items-center px-2 py-1 text-xs text-red-700 bg-red-100 rounded">
          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {errors.length} erro{errors.length > 1 ? 's' : ''}
          {warnings.length > 0 && `, ${warnings.length} aviso${warnings.length > 1 ? 's' : ''}`}
        </div>
        {showDetails && (
          <div className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 max-w-md">
            <div className="font-semibold mb-1">Erros:</div>
            <ul className="list-disc list-inside space-y-0.5">
              {errors.map((err: any, idx: number) => (
                <li key={idx}>{err.field}: {err.message}</li>
              ))}
            </ul>
            {warnings.length > 0 && (
              <>
                <div className="font-semibold mt-2 mb-1">Avisos:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {warnings.map((warn: any, idx: number) => (
                    <li key={idx}>{warn.field}: {warn.message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  if (warnings.length > 0) {
    return (
      <div className="inline-flex items-center px-2 py-1 text-xs text-yellow-700 bg-yellow-100 rounded">
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {warnings.length} aviso{warnings.length > 1 ? 's' : ''}
      </div>
    );
  }

  return null;
}

